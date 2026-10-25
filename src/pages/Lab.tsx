import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, applyThresholds, defaultThresholds, detectAll, loadModel, settingsKey, settingsLabel } from "../services/detector";
import { MODELS } from "../services/models";
import { parseQueries } from "../services/queries";
import { CONDITION_LABEL, applyCondition, applySteps, describeMapping, stepsText } from "../services/transform";
import { IOU_MATCH, compare, summarize } from "../services/comparison";
import { expectedBaseline } from "../services/geometry";
import { CONDITIONS, LEVELS, runCombos, runStress } from "../services/sweep";
import { COMBO_LEVELS, generateCases } from "../services/combos";
import { conditionsIn } from "../services/robustness";
import { closestSeverity, countRetention, perClass, realWorldNote } from "../services/realworld";
import { buildRepro, sha256Hex, verifyReproduction } from "../services/repro";
import type { Verification } from "../services/repro";
import { downloadReportPdf, downloadReportPng } from "../services/report";
import type { ReportInput } from "../services/report";
import { ApiError, api, saveExperiment } from "../services/api";
import type { ComboResult, ConditionType, DetectSettings, Detection, Experiment, ExperimentData, ModelId, RealWorldResult, Step, SweepPoint, Thresholds } from "../types/experiment";
import type { Failure } from "../services/failures";
import { useAnalysis } from "../useAnalysis";
import type { ThemeColors } from "../theme";
import StressPanel from "../StressPanel";
import LivePanel from "../LivePanel";
import Viewer from "../components/Viewer";
import ModelPicker from "../components/ModelPicker";
import type { ModelStatus } from "../components/ModelPicker";
import { ComboPanel, ExplainPanel, FailurePanel, RealWorldPanel } from "../components/InsightPanels";
import type { RealWorldView } from "../components/InsightPanels";

const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(0)}%`);
const num = (v: number | null, d = 3) => (v === null ? "N/A" : v.toFixed(d));
const NO_DETS: Detection[] = [];
const toImage = (blob: Blob) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image(), url = URL.createObjectURL(blob);
  im.onload = () => res(im); im.onerror = () => rej(new Error("This file could not be read as an image.")); im.src = url;
});

type Props = {
  active: boolean; colors: ThemeColors; owner: string;
  openRequest: { id: string; rerun: boolean } | null; onRequestHandled: () => void;
};

export default function Lab({ active, colors, owner, openRequest, onRequestHandled }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [hash, setHash] = useState("");

  const [model, setModel] = useState<ModelId>(DEFAULT_SETTINGS.model);
  const [tiled, setTiled] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [thr, setThr] = useState<Thresholds>(defaultThresholds(DEFAULT_SETTINGS.model));
  const queries = useMemo(() => parseQueries(queryText), [queryText]);
  const settings: DetectSettings = useMemo(() => ({ model, tiled, queries }), [model, tiled, queries]);
  const info = MODELS[model];
  const [ms, setMs] = useState<ModelStatus>({});
  const requested = useRef(new Set<ModelId>());

  const [baseRaw, setBaseRaw] = useState<Detection[] | null>(null);
  const [baseSettings, setBaseSettings] = useState<DetectSettings | null>(null);
  const [modCanvas, setModCanvas] = useState<HTMLCanvasElement | null>(null);
  const [modRaw, setModRaw] = useState<Detection[] | null>(null);
  const [modSteps, setModSteps] = useState<Step[] | null>(null);
  const [points, setPoints] = useState<SweepPoint[]>([]);
  const [combos, setCombos] = useState<ComboResult[]>([]);
  const [comboPlanned, setComboPlanned] = useState(0);
  const [realWorld, setRealWorld] = useState<RealWorldResult | undefined>();
  const [rwView, setRwView] = useState<RealWorldView>(null);
  const [sweepCfg, setSweepCfg] = useState<{ settings: DetectSettings; thr: Thresholds } | null>(null);
  const [loaded, setLoaded] = useState<Experiment | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);

  const [cond, setCond] = useState<ConditionType>("blur");
  const [sev, setSev] = useState(40);
  const [selected, setSelected] = useState<ConditionType[]>(CONDITIONS);
  const [depth, setDepth] = useState<2 | 3>(2);
  const [cap, setCap] = useState(30);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dlPct, setDlPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [showBase, setShowBase] = useState(true);
  const [showMod, setShowMod] = useState(true);
  const [liveOn, setLiveOn] = useState(false);
  const stop = useRef(false);

  // ---- derived results; thresholds only filter, so moving the slider never re-runs a model
  const base = useMemo(() => (baseRaw ? applyThresholds(baseRaw, thr) : null), [baseRaw, thr]);
  const mod = useMemo(() => (modRaw ? applyThresholds(modRaw, thr) : null), [modRaw, thr]);
  const expected = useMemo(() => (base && modSteps && img ? expectedBaseline(base, modSteps, img.naturalWidth, img.naturalHeight) : null), [base, modSteps, img]);
  const cmp = useMemo(() => (expected && mod ? compare(expected, mod) : []), [expected, mod]);
  const metrics = useMemo(() => (expected && mod ? summarize(cmp) : null), [expected, mod, cmp]);
  const activeSettings = sweepCfg?.settings ?? baseSettings ?? settings;
  const activeThr = sweepCfg?.thr ?? thr;
  const analysis = useAnalysis({
    title: title || name || "this image", modelLabel: MODELS[activeSettings.model].label, settings: activeSettings, thresholds: activeThr,
    baseline: base ?? NO_DETS, points, combos, realWorld,
  });

  // ---- models
  const startLoad = (id: ModelId) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    setMs((m) => ({ ...m, [id]: { state: "loading", pct: 0 } }));
    loadModel(id, (p) => setMs((m) => ({ ...m, [id]: { state: "loading", pct: p } })))
      .then(() => setMs((m) => ({ ...m, [id]: { state: "ready" } })))
      .catch((e: Error) => { requested.current.delete(id); setMs((m) => ({ ...m, [id]: { state: "failed", error: e.message } })); });
  };
  useEffect(() => { startLoad(DEFAULT_SETTINGS.model); }, []);
  const chooseModel = (id: ModelId) => { setModel(id); setThr(defaultThresholds(id)); setTiled(false); startLoad(id); };

  // ---- image and results
  const resetResults = () => {
    setPoints([]); setCombos([]); setComboPlanned(0); setRealWorld(undefined); setRwView(null); setSweepCfg(null); setLoaded(null); setVerification(null);
    setBaseRaw(null); setBaseSettings(null); setModCanvas(null); setModRaw(null); setModSteps(null); setOkMsg(null);
  };

  async function loadImage(blob: Blob, label: string) {
    const el = await toImage(blob);
    const h = await sha256Hex(blob);
    resetResults(); setImg(el); setName(label); setTitle(label); setFile(blob); setHash(h);
    return el;
  }
  async function onFile(f?: File) {
    setError(null);
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|bmp)$/.test(f.type)) return setError("Use a PNG, JPEG, WebP or BMP image.");
    if (f.size > 10 * 1024 * 1024) return setError("Image is over 10 MB. Choose a smaller one.");
    try { await loadImage(f, f.name); } catch (e) { setError((e as Error).message); }
  }
  function onCapture(frame: HTMLCanvasElement) {
    frame.toBlob((b) => { if (b) { loadImage(b, "webcam-capture.png").catch((e) => setError((e as Error).message)); setLiveOn(false); } else setError("Could not capture the webcam frame."); }, "image/png");
  }

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label); setError(null); setOkMsg(null);
    try { return await fn(); } catch (e) { setError(`${label} failed: ${(e as Error).message}`); } finally { setBusy(null); setDlPct(null); }
  }
  const needsQueries = info.kind === "open" && queries.length === 0;
  const modelReady = ms[model]?.state === "ready";
  const ready = modelReady && !busy && !liveOn;

  // ---- actions
  const runBaseline = () => run("Baseline detection", async () => {
    setPoints([]); setCombos([]); setComboPlanned(0); setRealWorld(undefined); setRwView(null); setSweepCfg(null); setLoaded(null); setVerification(null);
    setModCanvas(null); setModRaw(null); setModSteps(null);
    setBaseRaw(await detectAll(img!, settings));
    setBaseSettings(settings);
  });

  const showSteps = (steps: Step[]) => run("Modified detection", async () => {
    const c = await applySteps(img!, steps);
    setModRaw(await detectAll(c, baseSettings!));
    setModCanvas(c); setModSteps(steps);
  });

  const conditionsToRun = CONDITIONS.filter((c) => selected.includes(c));
  const runAll = () => run("Stress test", async () => {
    stop.current = false; setPoints([]);
    const cfg = { settings: baseSettings!, thr };
    setSweepCfg(cfg);
    await runStress(img!, base!, cfg.settings, cfg.thr, conditionsToRun, (p) => setPoints((prev) => [...prev, p]), () => stop.current);
  });

  const cases = useMemo(() => generateCases(conditionsToRun, depth, COMBO_LEVELS, cap), [selected, depth, cap]); // oxlint-disable-line
  const runCases = () => run("Combined test cases", async () => {
    stop.current = false; setCombos([]); setComboPlanned(cases.length);
    setSweepCfg((c) => c ?? { settings: baseSettings!, thr });
    await runCombos(img!, base!, baseSettings!, thr, cases, (r) => setCombos((prev) => [...prev, r]), () => stop.current);
  });

  const runRealWorld = (photo: File) => run("Real-world check", async () => {
    const el = await toImage(photo);
    const realDets = applyThresholds(await detectAll(el, baseSettings!), thr);
    const realCR = countRetention(base!, realDets);
    const sims: { severity: number; countRetention: number | null; canvas: HTMLCanvasElement; dets: Detection[] }[] = [];
    for (const severity of LEVELS) {
      const canvas = await applyCondition(img!, cond, severity);
      const dets = applyThresholds(await detectAll(canvas, baseSettings!), thr);
      sims.push({ severity, countRetention: countRetention(base!, dets), canvas, dets });
    }
    const simulated = sims.map(({ severity, countRetention: c }) => ({ severity, countRetention: c }));
    const matched = closestSeverity(realCR, simulated);
    const best = sims.find((s) => s.severity === matched) ?? sims[0];
    setRealWorld({
      condition: cond, photoName: photo.name, width: el.naturalWidth, height: el.naturalHeight, realCountRetention: realCR, simulated,
      matchedSeverity: matched, perClass: perClass(base!, realDets, best.dets), note: realWorldNote(cond, realCR, matched),
    });
    setRwView({ photo: el, photoDets: realDets, sim: best.canvas, simDets: best.dets });
  });

  const buildData = (): ExperimentData => ({
    settings: activeSettings, thresholds: activeThr, matchIoU: IOU_MATCH, baseline: base!, points, combos,
    single: modSteps ? { steps: modSteps, metrics } : undefined, realWorld,
    repro: buildRepro(activeSettings, activeThr, hash, [img!.naturalWidth, img!.naturalHeight]), summaryText: analysis.summaryText,
  });
  const save = () => run("Saving", async () => {
    const id = await saveExperiment({
      title: title.trim() || name, imageName: name, imageHash: hash, width: img!.naturalWidth, height: img!.naturalHeight,
      modelId: activeSettings.model, modelLabel: MODELS[activeSettings.model].label, overall: analysis.robust.overall, points: points.length, combos: combos.length,
    }, buildData(), file!, shared);
    setOkMsg(shared ? `Saved. Everyone signed in can now see it under Experiments (${id.slice(0, 8)}).` : "Saved privately. Only you can see it under Experiments.");
  });
  const exportJson = () => {
    const doc = { app: "RE:VISION", exportedBy: owner, title: title || name, imageName: name, ...buildData(), analysis: { robustness: analysis.robust, classes: analysis.classes, objects: analysis.objects } };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    a.download = `revision-${name.replace(/\.[^.]+$/, "")}.json`; a.click();
  };
  const reportInput = (): ReportInput => {
    const r = buildData().repro;
    return {
      title: title || name, owner: loaded?.owner, img: img!, baseline: base!, dashed: MODELS[activeSettings.model].kind === "open",
      settingsLine: `${settingsLabel(activeSettings)}. Confidence at least ${activeThr.conf.toFixed(2)}. A match needs the same class and IoU of at least ${IOU_MATCH}.`,
      reproLine: `Image SHA-256 ${hash.slice(0, 16)}…  Libraries ${Object.entries(r.libraries).map(([k, v]) => `${k.replace(/^@[^/]+\//, "")} ${v}`).join(", ")}. Backend ${r.tfBackend}.`,
      modified: modCanvas && mod && modSteps ? { canvas: modCanvas, detections: mod, steps: modSteps, metrics } : null,
      points, combos, realWorld, analysis,
    };
  };
  const exportReport = (kind: "png" | "pdf") => run("Report export", async () => { await (kind === "png" ? downloadReportPng(reportInput()) : downloadReportPdf(reportInput())); });

  // ---- open a saved experiment, optionally re-running it to verify it reproduces
  async function verifyRun(exp: Experiment, el: HTMLImageElement) {
    stop.current = false; setVerification(null); setPoints([]);
    const s = exp.settings, t = exp.thresholds;
    setBusy("Re-running to verify");
    await loadModel(s.model, setDlPct);
    const raw = await detectAll(el, s);
    setBaseRaw(raw); setBaseSettings(s);
    const b = applyThresholds(raw, t), fresh: SweepPoint[] = [];
    setSweepCfg({ settings: s, thr: t });
    await runStress(el, b, s, t, conditionsIn(exp.points), (p) => { fresh.push(p); setPoints([...fresh]); }, () => stop.current);
    setVerification(verifyReproduction(exp.points, fresh));
  }
  const openExperiment = (id: string, rerun: boolean) => run(rerun ? "Opening and re-running" : "Opening experiment", async () => {
    const exp = await api.get(id);
    const res = await fetch(api.imageUrl(id), { credentials: "same-origin" });
    if (!res.ok) throw new ApiError("This experiment's image could not be loaded.", res.status);
    const el = await loadImage(await res.blob(), exp.imageName);
    setTitle(exp.title);
    setModel(exp.settings.model); setTiled(exp.settings.tiled); setQueryText(exp.settings.queries.join(", ")); setThr(exp.thresholds);
    startLoad(exp.settings.model);
    setBaseRaw(exp.baseline); setBaseSettings(exp.settings); setPoints(exp.points); setCombos(exp.combos ?? []); setComboPlanned(exp.combos?.length ?? 0);
    setRealWorld(exp.realWorld); setLoaded(exp); setSweepCfg({ settings: exp.settings, thr: exp.thresholds });
    if (rerun) await verifyRun(exp, el);
  });
  useEffect(() => {
    if (!openRequest) return;
    const { id, rerun } = openRequest;
    onRequestHandled();
    openExperiment(id, rerun); // oxlint-disable-line react/set-state-in-effect -- a request to open an experiment arrives from another page, so it has to be an effect
  }, [openRequest]); // oxlint-disable-line react-hooks/exhaustive-deps

  // Synchronises with navigation: leaving the Lab must switch the camera off, and returning must not switch it back on.
  useEffect(() => { if (!active) setLiveOn(false); }, [active]); // oxlint-disable-line react/set-state-in-effect

  const stale = !!baseSettings && settingsKey(settings) !== settingsKey(baseSettings);
  const thrMoved = !!sweepCfg && (points.length > 0 || combos.length > 0) && sweepCfg.thr.conf !== thr.conf;
  const canRun = !!base && !stale && ready;
  const total = conditionsToRun.length * LEVELS.length;
  const dashed = MODELS[baseSettings?.model ?? model].kind === "open";
  const pinFailure = async (f: Failure) => {
    if (!loaded) return setError("Save the experiment first, then add examples to the shared gallery from the Gallery page.");
    try { await api.pin(loaded.id, f, ""); setOkMsg("Added to the gallery."); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="lab">
      <aside className="bench">
        <ol className="steps">
          <li className="step">
            <h2><span className="n">1</span>Image</h2>
            <label className="field">Choose a picture<input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} /></label>
            <button className="btn ghost" disabled={!modelReady || !!busy} onClick={() => setLiveOn((v) => !v)}>{liveOn ? "Close webcam" : "Or use the webcam"}</button>
          </li>

          <li className="step">
            <h2><span className="n">2</span>Detection model</h2>
            <ModelPicker value={model} onChange={chooseModel} status={ms} disabled={!!busy} />
            {ms[model]?.state === "failed" && <div className="note err">{ms[model]?.error ?? "This model failed to load."} <button className="btn ghost small" onClick={() => startLoad(model)}>Retry</button></div>}
            <label className="field">Confidence at least {thr.conf.toFixed(2)}
              <input type="range" min={info.min} max={info.max} step={info.kind === "open" ? 0.01 : 0.05} value={thr.conf} onChange={(e) => setThr({ conf: +e.target.value })} />
            </label>
            <label className="check" title="Splits the image into overlapping tiles and detects in each. Slower, but finds small and crowded objects.">
              <input type="checkbox" checked={tiled} onChange={(e) => setTiled(e.target.checked)} /> High-accuracy tiled mode (slower)
            </label>
            {info.kind === "open" && (
              <label className="field">What to find (separate with commas)
                <input type="text" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="e.g. rupee note, helmet" />
                <small>Describe the object, such as "Indian rupee banknote". Boxes from this model are dashed.</small>
              </label>
            )}
            <button className="btn" disabled={!img || !ready || needsQueries} onClick={runBaseline}>Run baseline detection</button>
            {needsQueries && <small>Type at least one thing to find.</small>}
          </li>

          <li className="step">
            <h2><span className="n">3</span>Change the image</h2>
            <fieldset disabled={!base || stale}>
              <select value={cond} onChange={(e) => setCond(e.target.value as ConditionType)} aria-label="Condition">
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
              </select>
              <label className="field">Severity {sev}<input type="range" min={0} max={100} value={sev} onChange={(e) => setSev(+e.target.value)} /></label>
              <small>{describeMapping[cond](sev)}</small>
            </fieldset>
            <button className="btn" disabled={!canRun} onClick={() => showSteps([{ condition: cond, severity: sev }])}>Run modified detection</button>
          </li>

          <li className="step">
            <h2><span className="n">4</span>Test many at once</h2>
            <div className="chips" role="group" aria-label="Conditions to test">
              {CONDITIONS.map((c) => (
                <button key={c} type="button" className={`chip ${selected.includes(c) ? "on" : ""}`} aria-pressed={selected.includes(c)}
                  onClick={() => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}>{CONDITION_LABEL[c]}</button>
              ))}
            </div>
            <button className="btn" disabled={!canRun || !selected.length} onClick={runAll}>Full stress test ({total} runs)</button>
            <div className="row">
              <label className="field">Combine
                <select value={depth} onChange={(e) => setDepth(+e.target.value as 2 | 3)}><option value={2}>2 conditions</option><option value={3}>3 conditions</option></select>
              </label>
              <label className="field">Up to
                <input type="number" min={1} max={120} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(120, +e.target.value || 1)))} />
              </label>
            </div>
            <button className="btn" disabled={!canRun || selected.length < depth} onClick={runCases}>Generate and run {cases.length} combined cases</button>
            {selected.length < depth && <small>Tick at least {depth} conditions to combine.</small>}
            {(busy === "Stress test" || busy === "Combined test cases" || busy === "Re-running to verify") && <button className="btn ghost" onClick={() => { stop.current = true; }}>Stop after this run</button>}
            {(settings.tiled || info.kind === "open" || info.id === "detr-r50") && <small>This model or mode is slow, so many runs will take a while.</small>}
          </li>

          <li className="step">
            <h2><span className="n">5</span>Keep and share</h2>
            <label className="field">Title<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>
            <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with everyone who signs in</label>
            <button className="btn" disabled={!base || !!busy || stale} onClick={save}>Save experiment</button>
            <div className="row">
              <button className="btn ghost" disabled={!base || !!busy} onClick={() => exportReport("png")}>Report (PNG)</button>
              <button className="btn ghost" disabled={!base || !!busy} onClick={() => exportReport("pdf")}>Report (PDF)</button>
            </div>
            <div className="row">
              <button className="btn ghost" disabled={!base || !!busy} onClick={exportJson}>Export JSON</button>
              <button className="btn ghost" disabled={!img || !!busy} onClick={resetResults}>Reset</button>
            </div>
          </li>
        </ol>
      </aside>

      <div className="stage">
        {busy && <div className="note">{busy}…{dlPct !== null && ` downloading model, ${dlPct.toFixed(0)}%`}</div>}
        {error && <div className="note err" role="alert">{error}</div>}
        {okMsg && <div className="note ok" role="status">{okMsg}</div>}
        {stale && <div className="note">Model or tiling changed since the baseline. Run baseline detection again to apply it.</div>}
        {thrMoved && <div className="note">The confidence slider moved after the results were produced. Re-run them to apply it; the results below use {activeThr.conf.toFixed(2)}.</div>}
        {!img && !liveOn && <div className="note">Choose a picture or use the webcam to begin.</div>}
        {img && !baseRaw && !busy && <div className="note">Pick a model and run baseline detection before changing the image.</div>}
        {base && base.length === 0 && <div className="note">No detections at this confidence. Lower it, try tiled mode, or choose a different model.</div>}

        {loaded && (
          <div className="note">
            Opened <b>{loaded.title}</b> from {loaded.owner}, saved {new Date(loaded.createdAt).toLocaleString()}, {loaded.modelLabel}.
            {!busy && <button className="btn ghost small" onClick={() => img && run("Re-running to verify", () => verifyRun(loaded, img))}>Re-run and verify</button>}
          </div>
        )}
        {verification && (
          <div className={`note ${verification.verdict === "different" ? "err" : "ok"}`} role="status">
            {verification.verdict === "identical" && `Reproduced exactly: ${verification.identical} of ${verification.compared} runs match the saved results.`}
            {verification.verdict === "close" && `Reproduced within rounding: ${verification.identical} of ${verification.compared} runs are identical and the largest difference is ${verification.maxDiff.toFixed(3)}. Small differences can come from a different browser or graphics backend.`}
            {verification.verdict === "different" && `Did not reproduce: the largest difference is ${verification.maxDiff.toFixed(2)} across ${verification.compared} runs${verification.missing ? ` (${verification.missing} could not be compared)` : ""}. Check that the same model, image and settings were used.`}
          </div>
        )}

        {liveOn && <LivePanel settings={settings} condition={cond} severity={sev} conf={thr.conf} colors={colors} onCapture={onCapture} onClose={() => setLiveOn(false)} />}

        <div className="pair">
          <figure className="frame orig">
            <figcaption><b>Original</b><label className="check"><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> boxes</label></figcaption>
            <Viewer source={img} detections={base ?? NO_DETS} color={colors.orig} show={showBase} dashed={dashed} />
          </figure>
          <figure className="frame mod">
            <figcaption><b>Modified{modSteps ? `: ${stepsText(modSteps)}` : ""}</b><label className="check"><input type="checkbox" checked={showMod} onChange={(e) => setShowMod(e.target.checked)} /> boxes</label></figcaption>
            <Viewer source={modCanvas} detections={mod ?? NO_DETS} color={colors.mod} show={showMod} dashed={dashed} />
          </figure>
        </div>

        {metrics && (
          <section className="panel">
            <div className="stat-grid">
              <div className="stat"><b>{metrics.baselineCount} → {metrics.modifiedCount}</b><span>expected, then found</span></div>
              <div className="stat"><b>{pct(metrics.retentionRate)}</b><span>retained ({metrics.matchedCount} matched)</span></div>
              <div className="stat"><b>{metrics.lostCount}</b><span>lost</span></div>
              <div className="stat"><b>{metrics.newCount}</b><span>new</span></div>
              <div className="stat"><b>{num(metrics.meanConfidenceDelta)}</b><span>mean score change</span></div>
              <div className="stat"><b>{num(metrics.meanIoU, 2)}</b><span>mean IoU ({metrics.localizationChangedCount} shifted)</span></div>
            </div>
            <div className="scroll">
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
            </div>
            <small>For rotation and crop the original boxes are moved the same way as the image, and objects that leave the frame are no longer expected. Results describe this image and these settings only; they do not measure accuracy.</small>
          </section>
        )}

        {points.length > 0 && (
          <>
            <StressPanel points={points} total={total || points.length} analysis={analysis} colors={colors} />
            <ExplainPanel analysis={analysis} />
            <FailurePanel analysis={analysis} image={img} colors={colors} onPin={loaded ? pinFailure : undefined} />
          </>
        )}
        {combos.length > 0 && <ComboPanel results={combos} planned={comboPlanned} onShow={(r) => showSteps(r.steps)} />}
        {base && (
          <RealWorldPanel result={realWorld} view={rwView} colors={colors} disabled={!canRun} busy={busy === "Real-world check"}
            conditionLabel={CONDITION_LABEL[realWorld?.condition ?? cond]} dashed={dashed} onRun={runRealWorld} />
        )}
      </div>
    </div>
  );
}
