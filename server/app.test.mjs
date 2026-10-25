import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, openDb } from "./app.mjs";

let server, base;
beforeAll(async () => {
  const app = createApp(openDb(":memory:"), { registerPerHour: 1000 });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

/** A tiny cookie-keeping client. */
function client() {
  let cookie = "";
  return async (method, url, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + url, {
      method, headers: { ...(body && !isBuf ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body),
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, body: ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()), setCookie: sc };
  };
}

const payload = (title = "cat.jpg", overall = 71.5) => ({
  shared: true,
  summary: { title, imageName: title, imageHash: "abc123", width: 640, height: 480, modelId: "coco-mnv2", modelLabel: "COCO-SSD MobileNetV2", overall },
  data: { settings: { model: "coco-mnv2", tiled: false, queries: [] }, baseline: [{ id: "cat-0", className: "cat", score: 0.9, box: { x: 1, y: 2, width: 3, height: 4 } }], points: [{ condition: "blur", severity: 25, metrics: null }], combos: [] },
});

describe("accounts", () => {
  it("registers, signs in, signs out; cookie is httpOnly", async () => {
    const c = client();
    expect((await c("GET", "/api/experiments")).status).toBe(401);
    const reg = await c("POST", "/api/auth/register", { username: "asha", password: "correct horse" });
    expect(reg.status).toBe(201);
    expect(reg.setCookie).toMatch(/HttpOnly/);
    expect(reg.setCookie).toMatch(/SameSite=Lax/);
    expect((await c("GET", "/api/auth/me")).body.username).toBe("asha");
    await c("POST", "/api/auth/logout", {});
    expect((await c("GET", "/api/auth/me")).body.username).toBeNull();
    expect((await c("GET", "/api/experiments")).status).toBe(401);
    const login = await c("POST", "/api/auth/login", { username: "ASHA", password: "correct horse" }); // names are case-insensitive
    expect(login.status).toBe(200);
  });
  it("rejects weak input, duplicates and wrong passwords with generic messages", async () => {
    const c = client();
    expect((await c("POST", "/api/auth/register", { username: "x", password: "longenough" })).status).toBe(400);
    expect((await c("POST", "/api/auth/register", { username: "bad name!", password: "longenough" })).status).toBe(400);
    expect((await c("POST", "/api/auth/register", { username: "okname", password: "short" })).status).toBe(400);
    await c("POST", "/api/auth/register", { username: "dup_user", password: "longenough" });
    expect((await client()("POST", "/api/auth/register", { username: "DUP_USER", password: "longenough" })).status).toBe(409);
    const wrong = await client()("POST", "/api/auth/login", { username: "dup_user", password: "wrong-password" });
    const ghost = await client()("POST", "/api/auth/login", { username: "nobody_here", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe(ghost.body.error);
  });
  it("rate-limits repeated bad logins", async () => {
    const c = client();
    let last;
    for (let i = 0; i < 12; i++) last = await c("POST", "/api/auth/login", { username: "someone", password: "nope-nope" });
    expect(last.status).toBe(429);
  });
  it("rate-limits sign-ups per address by default", async () => {
    const app2 = createApp(openDb(":memory:"));
    const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
    const url = `http://127.0.0.1:${srv.address().port}/api/auth/register`;
    let last;
    for (let i = 0; i < 12; i++) last = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: `user_${i}`, password: "longenough" }) });
    srv.close();
    expect(last.status).toBe(429);
  });
});

describe("experiments", () => {
  it("stores, lists, returns image, and shares between users", async () => {
    const a = client(), b = client();
    await a("POST", "/api/auth/register", { username: "alice_x", password: "password-1" });
    await b("POST", "/api/auth/register", { username: "bob_y", password: "password-2" });
    const created = await a("POST", "/api/experiments", payload("shared.jpg"));
    expect(created.status).toBe(201);
    const id = created.body.id;
    const img = Buffer.from([1, 2, 3, 4, 5]);
    expect((await a("PUT", `/api/experiments/${id}/image`, img, { "Content-Type": "image/png" })).status).toBe(200);

    const list = await b("GET", "/api/experiments");
    expect(list.body.find((e) => e.id === id)).toMatchObject({ owner: "alice_x", title: "shared.jpg", shared: true, overall: 71.5, points: 1 });
    const full = await b("GET", `/api/experiments/${id}`);
    expect(full.body.baseline[0].className).toBe("cat");
    expect(full.body.owner).toBe("alice_x");
    const image = await b("GET", `/api/experiments/${id}/image`);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect([...image.body]).toEqual([1, 2, 3, 4, 5]);
  });
  it("keeps private experiments private and only lets the owner change or delete", async () => {
    const a = client(), b = client();
    await a("POST", "/api/auth/register", { username: "priv_a", password: "password-1" });
    await b("POST", "/api/auth/register", { username: "priv_b", password: "password-2" });
    const { body } = await a("POST", "/api/experiments", { ...payload("secret.jpg"), shared: false });
    expect((await b("GET", `/api/experiments/${body.id}`)).status).toBe(404);
    expect((await b("GET", "/api/experiments")).body.some((e) => e.id === body.id)).toBe(false);
    expect((await a("GET", "/api/experiments")).body.some((e) => e.id === body.id)).toBe(true);
    expect((await a("PATCH", `/api/experiments/${body.id}`, { shared: true })).status).toBe(200);
    expect((await b("GET", `/api/experiments/${body.id}`)).status).toBe(200);
    expect((await b("DELETE", `/api/experiments/${body.id}`)).status).toBe(404); // not the owner
    expect((await b("PUT", `/api/experiments/${body.id}/image`, Buffer.from([9]), { "Content-Type": "image/png" })).status).toBe(404);
    expect((await a("DELETE", `/api/experiments/${body.id}`)).status).toBe(200);
    expect((await a("GET", `/api/experiments/${body.id}`)).status).toBe(404);
  });
  it("rejects incomplete experiments and non-image uploads", async () => {
    const a = client();
    await a("POST", "/api/auth/register", { username: "valid_a", password: "password-1" });
    expect((await a("POST", "/api/experiments", { summary: { title: "x" }, data: {} })).status).toBe(400);
    const { body } = await a("POST", "/api/experiments", payload());
    expect((await a("PUT", `/api/experiments/${body.id}/image`, Buffer.from("<script>"), { "Content-Type": "text/html" })).status).toBe(400);
  });
});

describe("gallery", () => {
  it("pins, lists across users, cascades on delete, owner-only removal", async () => {
    const a = client(), b = client();
    await a("POST", "/api/auth/register", { username: "gal_a", password: "password-1" });
    await b("POST", "/api/auth/register", { username: "gal_b", password: "password-2" });
    const exp = (await a("POST", "/api/experiments", payload("g.jpg"))).body.id;
    const item = await a("POST", "/api/gallery", { experimentId: exp, kind: "missed", note: "gone at blur 25", data: { className: "cat", condition: "blur", severity: 25 } });
    expect(item.status).toBe(201);
    const seen = (await b("GET", "/api/gallery")).body.find((g) => g.id === item.body.id);
    expect(seen).toMatchObject({ owner: "gal_a", kind: "missed", experimentId: exp });
    expect(seen.data.className).toBe("cat");
    expect((await b("DELETE", `/api/gallery/${item.body.id}`)).status).toBe(404);
    await a("DELETE", `/api/experiments/${exp}`);
    expect((await a("GET", "/api/gallery")).body.some((g) => g.id === item.body.id)).toBe(false);
  });
  it("will not pin onto an experiment you cannot see", async () => {
    const a = client(), b = client();
    await a("POST", "/api/auth/register", { username: "own_a", password: "password-1" });
    await b("POST", "/api/auth/register", { username: "own_b", password: "password-2" });
    const exp = (await a("POST", "/api/experiments", { ...payload(), shared: false })).body.id;
    expect((await b("POST", "/api/gallery", { experimentId: exp, kind: "missed", data: {} })).status).toBe(404);
  });
});
