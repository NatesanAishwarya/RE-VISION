// RE:VISION API: accounts, sessions, shared experiments, failure gallery.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import Database from "better-sqlite3";

const SESSION_DAYS = 7;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, title TEXT NOT NULL,
      image_name TEXT NOT NULL, image_hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
      model_id TEXT NOT NULL, model_label TEXT NOT NULL, overall REAL, n_points INTEGER NOT NULL, n_combos INTEGER NOT NULL,
      data TEXT NOT NULL, image BLOB, image_type TEXT);
    CREATE INDEX IF NOT EXISTS idx_exp_created ON experiments(created_at DESC);
    CREATE TABLE IF NOT EXISTS gallery (
      id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', data TEXT NOT NULL);
  `);
  return db;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function checkPassword(password, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(password, salt, 64).toString("hex"));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Tiny fixed-window limiter, enough to slow password guessing. */
function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(), h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n++;
    return h.n <= max;
  };
}

const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const num = (v) => typeof v === "number" && Number.isFinite(v);

export function createApp(db, { distDir, registerPerHour = 10, loginPer10Min = 10 } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const loginLimit = limiter(loginPer10Min, 10 * 60 * 1000), registerLimit = limiter(registerPerHour, 60 * 60 * 1000);

  const q = {
    userByName: db.prepare("SELECT * FROM users WHERE username = ?"),
    insertUser: db.prepare("INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?,?,?,?)"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)"),
    session: db.prepare("SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"),
    delSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    purge: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  };

  const readCookie = (req, name) => {
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
  };
  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString("hex");
    q.purge.run(Date.now());
    q.insertSession.run(sha256(token), userId, Date.now() + SESSION_DAYS * 864e5);
    const secure = req.secure ? "; Secure" : "";
    res.setHeader("Set-Cookie", `rv_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  }
  const auth = (req, res, next) => {
    const token = readCookie(req, "rv_session");
    const user = token ? q.session.get(sha256(token), Date.now()) : null;
    if (!user) return res.status(401).json({ error: "Sign in to continue." });
    req.user = user; next();
  };

  app.use("/api", express.json({ limit: "30mb" }));

  // ---- accounts
  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body ?? {};
    if (!registerLimit(req.ip)) return res.status(429).json({ error: "Too many sign-ups from this address. Try again later." });
    if (typeof username !== "string" || !USERNAME_RE.test(username)) return res.status(400).json({ error: "Username must be 3 to 32 characters: letters, numbers, dot, dash or underscore." });
    if (typeof password !== "string" || password.length < 8 || password.length > 200) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (q.userByName.get(username)) return res.status(409).json({ error: "That username is taken." });
    const { salt, hash } = hashPassword(password);
    const id = Number(q.insertUser.run(username, hash, salt, nowIso()).lastInsertRowid);
    startSession(req, res, id);
    res.status(201).json({ username });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") return res.status(400).json({ error: "Enter a username and password." });
    if (!loginLimit(`${req.ip}|${username.toLowerCase()}`)) return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
    const u = q.userByName.get(username);
    // Same message and same work whether or not the user exists, so the response does not reveal which usernames are real.
    const ok = u ? checkPassword(password, u.salt, u.pass_hash) : (hashPassword(password), false);
    if (!ok) return res.status(401).json({ error: "Wrong username or password." });
    startSession(req, res, u.id);
    res.json({ username: u.username });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = readCookie(req, "rv_session");
    if (token) q.delSession.run(sha256(token));
    res.setHeader("Set-Cookie", "rv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = readCookie(req, "rv_session");
    const user = token ? q.session.get(sha256(token), Date.now()) : null;
    res.json({ username: user ? user.username : null });
  });

  // ---- experiments
  const summaryCols = `e.id, u.username AS owner, e.shared, e.created_at AS createdAt, e.title, e.image_name AS imageName,
    e.image_hash AS imageHash, e.width, e.height, e.model_id AS modelId, e.model_label AS modelLabel, e.overall,
    e.n_points AS points, e.n_combos AS combos`;
  const visible = "(e.shared = 1 OR e.owner_id = @me)";
  const fixSummary = (r) => ({ ...r, shared: !!r.shared });

  app.get("/api/experiments", auth, (req, res) => {
    const rows = db.prepare(`SELECT ${summaryCols} FROM experiments e JOIN users u ON u.id = e.owner_id WHERE ${visible} ORDER BY e.created_at DESC LIMIT 500`).all({ me: req.user.id });
    res.json(rows.map(fixSummary));
  });

  app.post("/api/experiments", auth, (req, res) => {
    const b = req.body ?? {};
    const s = b.summary, d = b.data;
    if (!s || !d || typeof d !== "object" || !str(s.title, 200) || !str(s.imageName, 300) || !str(s.imageHash, 128) ||
        !str(s.modelId, 40) || !str(s.modelLabel, 120) || !num(s.width) || !num(s.height) ||
        !Array.isArray(d.baseline) || !Array.isArray(d.points) || !(s.overall === null || num(s.overall))) {
      return res.status(400).json({ error: "This experiment is incomplete and was not saved." });
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO experiments (id, owner_id, shared, created_at, title, image_name, image_hash, width, height, model_id, model_label, overall, n_points, n_combos, data)
      VALUES (@id,@owner,@shared,@created,@title,@imageName,@imageHash,@width,@height,@modelId,@modelLabel,@overall,@points,@combos,@data)`).run({
      id, owner: req.user.id, shared: b.shared === false ? 0 : 1, created: nowIso(), title: s.title, imageName: s.imageName,
      imageHash: s.imageHash, width: Math.round(s.width), height: Math.round(s.height), modelId: s.modelId, modelLabel: s.modelLabel,
      overall: s.overall, points: d.points.length, combos: Array.isArray(d.combos) ? d.combos.length : 0, data: JSON.stringify(d),
    });
    res.status(201).json({ id });
  });

  app.put("/api/experiments/:id/image", auth, express.raw({ type: ["image/*"], limit: "12mb" }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Send the image bytes with an image content type." });
    const r = db.prepare("UPDATE experiments SET image = ?, image_type = ? WHERE id = ? AND owner_id = ?").run(req.body, req.headers["content-type"], req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: "Experiment not found." });
    res.json({ ok: true });
  });

  const findVisible = (id, me) => db.prepare(`SELECT ${summaryCols}, e.data FROM experiments e JOIN users u ON u.id = e.owner_id WHERE e.id = @id AND ${visible}`).get({ id, me });

  app.get("/api/experiments/:id", auth, (req, res) => {
    const r = findVisible(req.params.id, req.user.id);
    if (!r) return res.status(404).json({ error: "Experiment not found." });
    const { data, ...summary } = r;
    res.json({ ...fixSummary(summary), ...JSON.parse(data) });
  });

  app.get("/api/experiments/:id/image", auth, (req, res) => {
    const r = db.prepare("SELECT image, image_type FROM experiments e WHERE e.id = @id AND " + visible).get({ id: req.params.id, me: req.user.id });
    if (!r || !r.image) return res.status(404).json({ error: "Image not found." });
    res.setHeader("Content-Type", r.image_type || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(r.image);
  });

  app.patch("/api/experiments/:id", auth, (req, res) => {
    if (typeof req.body?.shared !== "boolean") return res.status(400).json({ error: "Send shared as true or false." });
    const r = db.prepare("UPDATE experiments SET shared = ? WHERE id = ? AND owner_id = ?").run(req.body.shared ? 1 : 0, req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: "Experiment not found, or it is not yours." });
    res.json({ ok: true });
  });

  app.delete("/api/experiments/:id", auth, (req, res) => {
    const r = db.prepare("DELETE FROM experiments WHERE id = ? AND owner_id = ?").run(req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: "Experiment not found, or it is not yours." });
    res.json({ ok: true });
  });

  // ---- failure gallery
  app.get("/api/gallery", auth, (req, res) => {
    const rows = db.prepare(`SELECT g.id, g.experiment_id AS experimentId, g.created_at AS createdAt, g.kind, g.note, g.data, u.username AS owner,
        e.title AS experimentTitle, e.model_label AS modelLabel, e.image_hash AS imageHash
      FROM gallery g JOIN users u ON u.id = g.owner_id JOIN experiments e ON e.id = g.experiment_id
      WHERE ${visible} ORDER BY g.created_at DESC LIMIT 500`).all({ me: req.user.id });
    res.json(rows.map((r) => ({ ...r, data: JSON.parse(r.data) })));
  });

  app.post("/api/gallery", auth, (req, res) => {
    const { experimentId, kind, note, data } = req.body ?? {};
    if (!str(experimentId, 64) || !str(kind, 40) || !data || typeof data !== "object" || (note !== undefined && typeof note !== "string")) return res.status(400).json({ error: "This gallery item is incomplete." });
    if (!findVisible(experimentId, req.user.id)) return res.status(404).json({ error: "Experiment not found." });
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO gallery (id, owner_id, experiment_id, created_at, kind, note, data) VALUES (?,?,?,?,?,?,?)")
      .run(id, req.user.id, experimentId, nowIso(), kind, (note ?? "").slice(0, 300), JSON.stringify(data));
    res.status(201).json({ id });
  });

  app.delete("/api/gallery/:id", auth, (req, res) => {
    const r = db.prepare("DELETE FROM gallery WHERE id = ? AND owner_id = ?").run(req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: "Item not found, or it is not yours." });
    res.json({ ok: true });
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "That is too large to save." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed request." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  if (distDir && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }
  return app;
}
