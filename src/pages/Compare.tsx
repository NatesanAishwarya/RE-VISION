import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/api";
import { analyse } from "../services/analysis";
import { compareVerdict } from "../services/explain";
import { grade } from "../services/robustness";
import { LEVELS } from "../services/sweep";
import { caseKey, comboQuality } from "../services/combos";
import { CONDITION_LABEL, applyCondition, stepsText } from "../services/transform";
import { MODELS } from "../services/models";
import { useImage } from "../hooks";
import Viewer from "../components/Viewer";
import type { ConditionType, Detection, Experiment, ExperimentSummary, Item } from "../types/experiment";
import type { ThemeColors } from "../theme";

const itemsToDets = (items: Item[] = []): Detection[] =>
  items.flatMap((it, i) => (it.box ? [{ id: `i${i}`, className: it.cls, score: it.score ?? 0, box: { x: it.box[0], y: it.box[1], width: it.box[2], height: it.box[3] } }] : []));
const pct = (v: number | null | undefined) => (v == null ? "N/A" : `${Math.round(v * 100)}%`);

function Side({ exp, label, colors, cond, sev, tone }: { exp: Experiment; label: string; colors: ThemeColors; cond: ConditionType; sev: number; tone: "orig" | "mod" }) {
  const img = useImage(exp.id);
  const [modCanvas, setModCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!img) return;
    let live = true;
    applyCondition(img, cond, sev).then((c) => live && setModCanvas(c)).catch(() => live && setModCanvas(null));
    return () => { live = false; };
  }, [img, cond, sev]);
  const point = exp.points.find((p) => p.condition === cond && p.severity === sev);
  const dashed = MODELS[exp.settings.model].kind === "open";
  return (
    <div className="cmp-side">
      <h3>{label}: {exp.modelLabel}</h3>
      <figure className="frame orig"><figcaption><b>Original</b><span>{exp.baseline.length} detections</span></figcaption><Viewer source={img} detections={exp.baseline} color={colors.orig} dashed={dashed} empty="Loading image…" /></figure>
      <figure className="frame mod"><figcaption><b>{CONDITION_LABEL[cond]} {sev}</b><span>{point?.items ? `${itemsToDets(point.items).length} detections` : "not tested"}</span></figcaption>
        <Viewer source={point?.items ? modCanvas : null} detections={itemsToDets(point?.items)} color={tone === "orig" ? colors.orig : colors.mod} dashed={dashed} empty={point ? "Loading image…" : "This experiment did not test this condition and severity."} /></figure>
    </div>
  );
}

export default function Compare({ aId, bId, goto, colors }: { aId?: string; bId?: string; goto: (h: string) => void; colors: ThemeColors }) {
  const [list, setList] = useState<ExperimentSummary[]>([]);
  const [A, setA] = useState<Experiment | null>(null);
  const [B, setB] = useState<Experiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cond, setCond] = useState<ConditionType | "">("");
  const [sev, setSev] = useState(50);

  useEffect(() => { api.list().then(setList).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([aId ? api.get(aId) : null, bId ? api.get(bId) : null]);
        if (live) { setError(null); setA(a); setB(b); }
      } catch (e) { if (live) setError((e as Error).message); }
    })();
    return () => { live = false; };
  }, [aId, bId]);

  const an = useMemo(() => (A ? analyse({ title: A.title, modelLabel: A.modelLabel, settings: A.settings, thresholds: A.thresholds, baseline: A.baseline, points: A.points, combos: A.combos, realWorld: A.realWorld }) : null), [A]);
  const bn = useMemo(() => (B ? analyse({ title: B.title, modelLabel: B.modelLabel, settings: B.settings, thresholds: B.thresholds, baseline: B.baseline, points: B.points, combos: B.combos, realWorld: B.realWorld }) : null), [B]);

  const shared = useMemo(() => (A && B ? [...new Set(A.points.map((p) => p.condition))].filter((c) => B.points.some((p) => p.condition === c)) : []), [A, B]);
  const condition = shared.includes(cond as ConditionType) ? (cond as ConditionType) : shared[0];
  const pair = (id?: string, other?: string) => goto(`#/compare/${id ?? "-"}/${other ?? "-"}`);
  const label = (e: ExperimentSummary) => `${e.title}, ${e.modelLabel}, ${e.owner}`;
  const sameImage = A && B ? A.imageHash === B.imageHash : null;

  const barData = A && B && an && bn ? an.robust.perCondition.filter((c) => bn.robust.perCondition.some((d) => d.condition === c.condition)).map((c) => ({
    name: CONDITION_LABEL[c.condition], A: c.score === null ? 0 : Math.round(c.score), B: Math.round(bn.robust.perCondition.find((d) => d.condition === c.condition)!.score ?? 0),
  })) : [];
  const lineData = A && B && condition ? LEVELS.map((s) => ({
    severity: s, A: A.points.find((p) => p.condition === condition && p.severity === s)?.metrics?.retentionRate ?? null,
    B: B.points.find((p) => p.condition === condition && p.severity === s)?.metrics?.retentionRate ?? null,
  })) : [];
  const comboRows = A && B ? (A.combos ?? []).flatMap((a) => { const b = (B.combos ?? []).find((x) => caseKey(x.steps) === caseKey(a.steps)); return b ? [{ a, b }] : []; }) : [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Compare experiments</h1>
        <p className="muted">Put two saved experiments next to each other. Choose the same image tested with two different models to see which holds up better, or the same model under different settings.</p>
      </header>
      <div className="toolbar">
        <label className="field">Experiment A<select value={aId ?? ""} onChange={(e) => pair(e.target.value || undefined, bId)}><option value="">Choose…</option>{list.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}</select></label>
        <label className="field">Experiment B<select value={bId ?? ""} onChange={(e) => pair(aId, e.target.value || undefined)}><option value="">Choose…</option>{list.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}</select></label>
      </div>
      {error && <div className="note err" role="alert">{error}</div>}
      {(!A || !B) && !error && <div className="empty-state"><h2>Choose two experiments</h2><p>Pick them above, or tick two on the Experiments page.</p></div>}

      {A && B && an && bn && (
        <>
          <div className={`note ${sameImage ? "ok" : ""}`}>{sameImage ? "Both experiments used exactly the same image, so differences come from the model and settings." : "These experiments used different images, so differences may come from the image as much as the model."}</div>
          <section className="panel vs">
            {[{ e: A, a: an, l: "A", tone: "orig" }, { e: B, a: bn, l: "B", tone: "mod" }].map(({ e, a, l, tone }) => (
              <div key={l} className={`vs-card ${tone}`}>
                <h2>{l}: {e.title}</h2>
                <p className="muted">{e.modelLabel}{e.settings.tiled ? ", tiled" : ""}, confidence at least {e.thresholds.conf.toFixed(2)}, by {e.owner}</p>
                <p className="big-num">{a.robust.overall === null ? "N/A" : Math.round(a.robust.overall)}<small> / 100, {grade(a.robust.overall).toLowerCase()}</small></p>
                <p className="muted">{e.baseline.length} baseline detections, {e.points.length} stress runs</p>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Verdict</h2>
            {compareVerdict({ label: `A (${A.modelLabel})`, robust: an.robust }, { label: `B (${B.modelLabel})`, robust: bn.robust }).map((t, i) => <p key={i} className="prose">{t}</p>)}
          </section>

          {barData.length > 0 && (
            <section className="panel">
              <h2>Robustness by condition</h2>
              <div style={{ height: 300 }}>
                <ResponsiveContainer><BarChart data={barData} margin={{ left: 0, right: 8, top: 8, bottom: 40 }}>
                  <CartesianGrid stroke={colors.line} vertical={false} />
                  <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={70} stroke={colors.muted} fontSize={12} />
                  <YAxis domain={[0, 100]} stroke={colors.muted} width={36} />
                  <Tooltip /><Legend />
                  <Bar dataKey="A" fill={colors.orig} isAnimationActive={false} /><Bar dataKey="B" fill={colors.mod} isAnimationActive={false} />
                </BarChart></ResponsiveContainer>
              </div>
            </section>
          )}

          {condition && (
            <section className="panel">
              <div className="row"><h2>Look closely</h2>
                <select value={condition} onChange={(e) => setCond(e.target.value as ConditionType)} aria-label="Condition">{shared.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}</select>
                <label className="field inline">Severity {sev}<input type="range" min={0} max={100} step={25} value={sev} onChange={(e) => setSev(+e.target.value)} /></label>
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer><LineChart data={lineData} margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
                  <CartesianGrid stroke={colors.line} />
                  <XAxis dataKey="severity" type="number" domain={[0, 100]} ticks={LEVELS} stroke={colors.muted} />
                  <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={44} stroke={colors.muted} />
                  <Tooltip formatter={(v) => (typeof v === "number" ? pct(v) : "N/A")} /><Legend />
                  <Line dataKey="A" name="A retention" stroke={colors.orig} strokeWidth={2.5} isAnimationActive={false} />
                  <Line dataKey="B" name="B retention" stroke={colors.mod} strokeWidth={2.5} isAnimationActive={false} />
                </LineChart></ResponsiveContainer>
              </div>
              <div className="cmp-grid"><Side exp={A} label="A" colors={colors} cond={condition} sev={sev} tone="orig" /><Side exp={B} label="B" colors={colors} cond={condition} sev={sev} tone="mod" /></div>
            </section>
          )}

          {comboRows.length > 0 && (
            <section className="panel">
              <h2>Combined cases both ran</h2>
              <div className="scroll"><table>
                <thead><tr><th>Case</th><th>A retained</th><th>B retained</th><th>Better</th></tr></thead>
                <tbody>{comboRows.map(({ a, b }) => { const qa = comboQuality(a), qb = comboQuality(b); return (
                  <tr key={caseKey(a.steps)}><td>{stepsText(a.steps)}</td><td>{pct(a.metrics?.retentionRate)}</td><td>{pct(b.metrics?.retentionRate)}</td><td>{qa === null || qb === null || Math.abs(qa - qb) < 0.03 ? "about equal" : qa > qb ? "A" : "B"}</td></tr>
                ); })}</tbody>
              </table></div>
            </section>
          )}
          <p><button className="btn ghost small" onClick={() => pair(bId, aId)}>Swap A and B</button></p>
        </>
      )}
    </div>
  );
}
