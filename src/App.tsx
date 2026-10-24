import { useEffect, useRef, useState } from "react";
import { MODEL_NAME, SCORE_THRESHOLD, detect, loadDetector } from "./services/detector";
import { applyCondition, describeMapping } from "./services/transform";
import { compare, summarize, IOU_MATCH } from "./services/comparison";
import type { ConditionType, Detection, DetectionComparison, Metrics, SavedRun, SweepPoint } from "./types/experiment";
import { CONDITIONS, LEVELS, runStress } from "./services/sweep";
import { deleteRun, listRuns, saveRun } from "./services/store";
import StressPanel from "./StressPanel";

const BLUE = "#1565c0", PINK = "#c2185b";
const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(0)}%`);
const num = (v: number | null, d = 3) => (v === null ? "N/A" : v.toFixed(d));

function Viewer({ source, detections, color, show }: { source: CanvasImageSource | null; detections: Detection[]; color: string; show: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    const w = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width;
    const h = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    if (!show) return;
    const lw = Math.max(2, w / 250);
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.font = `${Math.max(12, w / 45)}px system-ui`;
    for (const d of detections) {
      ctx.strokeRect(d.box.x, d.box.y, d.box.width, d.box.height);
      const label = `${d.className} ${(d.score * 100).toFixed(0)}%`;
      const tw = ctx.measureText(label).width + 8, th = Math.max(16, w / 38);
      ctx.fillRect(d.box.x, Math.max(0, d.box.y - th), tw, th);
      ctx.fillStyle = "#fff"; ctx.fillText(label, d.box.x + 4, Math.max(th - 4, d.box.y - 4)); ctx.fillStyle = color;
    }
  }, [source, detections, color, show]);
  return source ? <canvas ref={ref} className="view" /> : <div className="view empty">Nothing here yet</div>;
}

export default function App() {
  const [model, setModel] = useState<"loading" | "ready" | "failed">("loading");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState<Detection[] | null>(null);
  const [modCanvas, setModCanvas] = useState<HTMLCanvasElement | null>(null);
  const [mod, setMod] = useState<Detection[] | null>(null);
  const [cmp, setCmp] = useState<DetectionComparison[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cond, setCond] = useState<ConditionType>("blur");
  const [sev, setSev] = useState(40);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBase, setShowBase] = useState(true);
  const [showMod, setShowMod] = useState(true);
  const [points, setPoints] = useState<SweepPoint[]>([]);
  const [file, setFile] = useState<Blob | null>(null);
  const [history, setHistory] = useState<SavedRun[]>([]);
  const stop = useRef(false);
  const refresh = () => listRuns().then(setHistory).catch(() => setError("Could not read saved experiments from this browser."));
  useEffect(() => { refresh(); }, []);

  useEffect(() => { loadDetector().then(() => setModel("ready")).catch(() => setModel("failed")); }, []);

  const resetResults = () => { setPoints([]); setBase(null); setModCanvas(null); setMod(null); setCmp([]); setMetrics(null); };

  function onFile(f?: File) {
    setError(null);
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|bmp)$/.test(f.type)) return setError("Use a PNG, JPEG, WebP or BMP image.");
    if (f.size > 10 * 1024 * 1024) return setError("Image is over 10 MB. Choose a smaller one.");
    const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { resetResults(); setImg(im); setName(f.name); setFile(f); };
    im.onerror = () => setError("This file could not be read as an image.");
    im.src = url;
  }

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label); setError(null);
    try { return await fn(); } catch (e) { setError(`${label} failed: ${(e as Error).message}`); } finally { setBusy(null); }
  }

  const runBaseline = () => run("Baseline detection", async () => {
    setModCanvas(null); setMod(null); setCmp([]); setMetrics(null);
    setBase(await detect(img!));
  });

  const runModified = () => run("Modified detection", async () => {
    const c = applyCondition(img!, cond, sev); // always from the original
    const d = await detect(c);
    const result = compare(base!, d);
    setModCanvas(c); setMod(d); setCmp(result); setMetrics(summarize(result));
  });

  const runAll = () => run("Stress test", async () => {
    stop.current = false; setPoints([]);
    await runStress(img!, base!, (p) => setPoints((prev) => [...prev, p]), () => stop.current);
  });

  const record = (): SavedRun => ({
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), imageName: name,
    width: img!.naturalWidth, height: img!.naturalHeight, model: MODEL_NAME,
    scoreThreshold: SCORE_THRESHOLD, iouThreshold: IOU_MATCH, baseline: base!, points, image: file!,
  });
  const save = async () => { try { await saveRun(record()); await refresh(); } catch (e) { setError(`Saving failed: ${(e as Error).message}`); } };
  const exportJson = () => {
    const { image: _image, ...r } = record();
    const doc = { ...r, note: "Model scores are confidence, not accuracy. Results apply to this image and these settings only.", single: metrics && { condition: cond, severity: sev, metrics, comparisons: cmp } };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    a.download = `revision-${name.replace(/\.[^.]+$/, "")}.json`; a.click();
  };
  const openRun = (r: SavedRun) => {
    const im = new Image();
    im.onload = () => { resetResults(); setImg(im); setName(r.imageName); setFile(r.image); setBase(r.baseline); setPoints(r.points); };
    im.src = URL.createObjectURL(r.image);
  };
  const remove = async (r: SavedRun) => { if (confirm(`Delete the saved experiment for ${r.imageName}?`)) { await deleteRun(r.id); refresh(); } };

  const ready = model === "ready" && !busy;
  return (
    <div className="app">
      <header>
        <h1>RE:VISION</h1>
        <p>Change the image. Rerun the same detector. See what moved.</p>
        <span className={`pill ${model}`}>{model === "ready" ? `${MODEL_NAME} ready` : model === "loading" ? "Loading model…" : "Model failed to load. Check your connection and reload."}</span>
      </header>

      <aside>
        <label className="file">
          <span>1. Choose an image</span>
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button disabled={!img || !ready} onClick={runBaseline}>2. Run baseline detection</button>

        <fieldset disabled={!base}>
          <legend>3. Change the image</legend>
          <select value={cond} onChange={(e) => setCond(e.target.value as ConditionType)}>
            <option value="blur">Blur</option><option value="brightness">Darken</option>
            <option value="contrast">Reduce contrast</option><option value="occlusion">Cover with a box</option>
          </select>
          <label>Severity: {sev}<input type="range" min={0} max={100} value={sev} onChange={(e) => setSev(+e.target.value)} /></label>
          <small>{describeMapping[cond](sev)}</small>
        </fieldset>
        <button disabled={!base || !ready} onClick={runModified}>4. Run modified detection</button>
        <button disabled={!base || !ready} onClick={runAll}>5. Run full stress test ({CONDITIONS.length * LEVELS.length} runs)</button>
        {busy === "Stress test" && <button className="ghost" onClick={() => { stop.current = true; }}>Stop after this run</button>}
        <div className="row">
          <button className="ghost" disabled={!base || !!busy} onClick={save}>Save experiment</button>
          <button className="ghost" disabled={!base || !!busy} onClick={exportJson}>Export JSON</button>
        </div>
        <button className="ghost" disabled={!img || !!busy} onClick={() => { resetResults(); }}>Reset to original</button>
        {history.length > 0 && (
          <details>
            <summary>Saved experiments ({history.length})</summary>
            <ul className="history">
              {history.map((r) => (
                <li key={r.id}>
                  <span>{r.imageName}<small> {new Date(r.createdAt).toLocaleString()}, {r.points.length} runs</small></span>
                  <button className="ghost" onClick={() => openRun(r)}>Open</button>
                  <button className="ghost" onClick={() => remove(r)} aria-label={`Delete ${r.imageName}`}>Delete</button>
                </li>
              ))}
            </ul>
            <small>Saved in this browser only. Export JSON before clearing browser data.</small>
          </details>
        )}
        <small>Detector: {MODEL_NAME}. Score threshold {SCORE_THRESHOLD}. A match needs the same class and IoU ≥ {IOU_MATCH}. Scores are model confidence, not accuracy.</small>
      </aside>

      <main>
        {busy && <div className="note">{busy} running…</div>}
        {error && <div className="note err" role="alert">{error}</div>}
        {!img && <div className="note">Upload an image to begin.</div>}
        {img && !base && !busy && <div className="note">Run baseline detection before changing the image.</div>}
        {base && base.length === 0 && <div className="note">No detections at this threshold. Try an image with common objects (people, cars, animals).</div>}

        <div className="pair">
          <figure>
            <figcaption><b style={{ color: BLUE }}>Original</b> <label><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> boxes</label></figcaption>
            <Viewer source={img} detections={base ?? []} color={BLUE} show={showBase} />
          </figure>
          <figure>
            <figcaption><b style={{ color: PINK }}>Modified</b> <label><input type="checkbox" checked={showMod} onChange={(e) => setShowMod(e.target.checked)} /> boxes</label></figcaption>
            <Viewer source={modCanvas} detections={mod ?? []} color={PINK} show={showMod} />
          </figure>
        </div>

        {metrics && (
          <section>
            <div className="cards">
              <div><b>{metrics.baselineCount} → {metrics.modifiedCount}</b><span>detections, before → after</span></div>
              <div><b>{pct(metrics.retentionRate)}</b><span>retained ({metrics.matchedCount} matched ÷ baseline)</span></div>
              <div><b>{metrics.lostCount}</b><span>lost</span></div>
              <div><b>{metrics.newCount}</b><span>new</span></div>
              <div><b>{num(metrics.meanConfidenceDelta)}</b><span>mean score change, matched</span></div>
              <div><b>{num(metrics.meanIoU, 2)}</b><span>mean IoU, matched ({metrics.localizationChangedCount} shifted)</span></div>
            </div>
            <table>
              <thead><tr><th>Status</th><th>Class</th><th>Score before</th><th>Score after</th><th>Δ score</th><th>IoU</th><th>Shift (px)</th></tr></thead>
              <tbody>
                {cmp.map((c, i) => {
                  const o = c.baseline ?? c.modified!;
                  return (
                    <tr key={i} className={c.status}>
                      <td>{c.status === "retained" && c.localizationChanged ? "retained, moved" : c.status}</td>
                      <td>{o.className}</td>
                      <td>{c.baseline ? c.baseline.score.toFixed(2) : "—"}</td>
                      <td>{c.modified ? c.modified.score.toFixed(2) : "—"}</td>
                      <td>{c.confidenceDelta !== undefined ? c.confidenceDelta.toFixed(2) : "—"}</td>
                      <td>{c.iou !== undefined ? c.iou.toFixed(2) : "—"}</td>
                      <td>{c.boxShiftPx !== undefined ? c.boxShiftPx.toFixed(0) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <small>Results describe this image ({name}) and these settings only. They do not measure accuracy.</small>
          </section>
        )}
        {points.length > 0 && <StressPanel points={points} total={CONDITIONS.length * LEVELS.length} />}
      </main>
    </div>
  );
}
