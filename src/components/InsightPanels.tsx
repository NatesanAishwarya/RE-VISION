import { useState } from "react";
import type { Analysis } from "../services/analysis";
import { KIND_LABEL, failureDetail } from "../services/failures";
import type { Failure, FailureKind } from "../services/failures";
import { CONDITION_LABEL, stepsText } from "../services/transform";
import { caseKey, comboQuality, rankCombos } from "../services/combos";
import type { ComboResult, RealWorldResult, Detection } from "../types/experiment";
import type { ThemeColors } from "../theme";
import FailureThumb from "./FailureThumb";
import Viewer from "./Viewer";

const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(0)}%`);

/** Feature: explainable score + automatic plain-language summary. */
export function ExplainPanel({ analysis }: { analysis: Analysis }) {
  const [copied, setCopied] = useState(false);
  const text = analysis.summaryText.join("\n\n");
  return (
    <section className="panel">
      <h2>What this score means</h2>
      <ul className="plain">{analysis.explanation.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <h3>Automatic summary</h3>
      {analysis.summaryText.map((p, i) => <p key={i} className="prose">{p}</p>)}
      <div className="row"><button className="btn ghost small" onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? "Copied" : "Copy summary"}</button></div>
    </section>
  );
}

const KINDS: FailureKind[] = ["missed", "confidence_drop", "shifted", "false_positive"];

/** Feature: object-level failure analysis + gallery candidates. */
export function FailurePanel({ analysis, image, colors, onPin }: {
  analysis: Analysis; image: HTMLImageElement | null; colors: ThemeColors; onPin?: (f: Failure) => void;
}) {
  const { objects, explanation, candidates } = analysis, mix = explanation.mix;
  const max = Math.max(1, ...Object.values(mix));
  return (
    <section className="panel">
      <h2>Object-level failures</h2>
      <ul className="bars mix">
        {KINDS.map((k) => (
          <li key={k}><span>{KIND_LABEL[k]}</span><i className="meter"><u className={`k-${k}`} style={{ width: `${(mix[k] / max) * 100}%` }} /></i><b>{mix[k]}</b><small /></li>
        ))}
      </ul>
      <small>Counted across every stressed run. A confidence drop is a matched object losing 0.20 or more; shifted means its box overlaps the original by less than 0.80.</small>
      {objects.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Object</th><th>Confidence</th><th>Missed in</th><th>First missed under</th><th>Worst confidence drop</th><th>Most shifted</th></tr></thead>
            <tbody>
              {objects.slice(0, 12).map((o) => (
                <tr key={o.bid}>
                  <td>{o.className} <small>at {Math.round(o.box.x)}, {Math.round(o.box.y)}</small></td>
                  <td>{pct(o.baseScore)}</td>
                  <td>{o.missed} of {o.runs} runs</td>
                  <td>{o.firstMiss ? `${CONDITION_LABEL[o.firstMiss.condition]} ${o.firstMiss.severity}` : "never"}</td>
                  <td>{o.worstDrop && o.worstDrop.delta < 0 ? `${o.worstDrop.delta.toFixed(2)} (${CONDITION_LABEL[o.worstDrop.condition]} ${o.worstDrop.severity})` : "none"}</td>
                  <td>{o.worstShift && o.worstShift.iou < 0.8 ? `IoU ${o.worstShift.iou.toFixed(2)} (${CONDITION_LABEL[o.worstShift.condition]} ${o.worstShift.severity})` : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {image && candidates.length > 0 && (
        <>
          <h3>Examples</h3>
          <div className="gallery-grid">
            {candidates.map((f, i) => (
              <article key={i} className="gcard">
                <FailureThumb image={image} failure={f} colors={colors} />
                <p><b>{KIND_LABEL[f.kind]}:</b> {f.className}, {CONDITION_LABEL[f.condition].toLowerCase()} {f.severity}</p>
                <small>{failureDetail(f)}</small>
                {onPin && <button className="btn ghost small" onClick={() => onPin(f)}>Add to gallery</button>}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Feature: automated test-case generation results. */
export function ComboPanel({ results, planned, onShow }: { results: ComboResult[]; planned: number; onShow: (c: ComboResult) => void }) {
  const ranked = rankCombos(results);
  const pairs = [...new Set(results.filter((r) => r.steps.length === 2 && !r.error).map((r) => `${r.steps[0].condition}|${r.steps[1].condition}`))];
  const [pick, setPick] = useState(pairs[0] ?? "");
  const sel = pairs.includes(pick) ? pick : pairs[0];
  const [a, b] = sel ? sel.split("|") : ["", ""];
  const grid = results.filter((r) => r.steps.length === 2 && r.steps[0].condition === a && r.steps[1].condition === b);
  const la = [...new Set(grid.map((r) => r.steps[0].severity))].sort((x, y) => x - y), lb = [...new Set(grid.map((r) => r.steps[1].severity))].sort((x, y) => x - y);
  return (
    <section className="panel">
      <h2>Combined conditions: {results.length} of {planned} cases</h2>
      <small>Cases are generated from the conditions you ticked, at fixed severities. When there are more than the limit, a seeded sample is used, so the same settings always give the same cases.</small>
      <div className="scroll">
        <table>
          <thead><tr><th>Case (applied in this order)</th><th>Retained</th><th>Mean IoU</th><th>Lost</th><th /></tr></thead>
          <tbody>
            {ranked.slice(0, 10).map((r) => (
              <tr key={caseKey(r.steps)}>
                <td>{stepsText(r.steps)}</td><td>{pct(r.metrics?.retentionRate ?? null)}</td>
                <td>{r.metrics?.meanIoU == null ? "N/A" : r.metrics.meanIoU.toFixed(2)}</td><td>{r.metrics?.lostCount ?? "N/A"}</td>
                <td><button className="btn ghost small" onClick={() => onShow(r)}>Show</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranked.length > 10 && <small>Showing the 10 hardest of {ranked.length}.</small>}
      {pairs.length > 0 && (
        <>
          <div className="row">
            <h3>Pair grid</h3>
            <select value={sel} onChange={(e) => setPick(e.target.value)} aria-label="Pair of conditions">
              {pairs.map((p) => { const [x, y] = p.split("|"); return <option key={p} value={p}>{CONDITION_LABEL[x as keyof typeof CONDITION_LABEL]} × {CONDITION_LABEL[y as keyof typeof CONDITION_LABEL]}</option>; })}
            </select>
          </div>
          <div className="scroll">
            <table className="heat">
              <caption>Retention. Rows: {CONDITION_LABEL[a as keyof typeof CONDITION_LABEL]} severity. Columns: {CONDITION_LABEL[b as keyof typeof CONDITION_LABEL]} severity.</caption>
              <thead><tr><th /> {lb.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {la.map((sa) => (
                  <tr key={sa}>
                    <th>{sa}</th>
                    {lb.map((sb) => {
                      const r = grid.find((g) => g.steps[0].severity === sa && g.steps[1].severity === sb);
                      const v = r?.metrics?.retentionRate ?? null, q = r ? comboQuality(r) : null;
                      return v === null || !r ? <td key={sb} className="dim">{r ? "N/A" : "Not tested"}</td> : <td key={sb} title={`quality ${q?.toFixed(2)}`} style={{ background: `hsl(${Math.round(v * 140)} 60% 80%)`, color: "#14232b" }}>{pct(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export type RealWorldView = { photo: HTMLImageElement; photoDets: Detection[]; sim: HTMLCanvasElement; simDets: Detection[] } | null;

/** Feature: real-world image testing. */
export function RealWorldPanel({ result, view, colors, disabled, busy, conditionLabel, dashed, onRun }: {
  result?: RealWorldResult; view: RealWorldView; colors: ThemeColors; disabled: boolean; busy: boolean; conditionLabel: string; dashed: boolean; onRun: (f: File) => void;
}) {
  return (
    <section className="panel">
      <h2>Real-world check</h2>
      <p className="muted">Photograph the same scene under a real condition, for example in dim light, then compare it with the simulated {conditionLabel.toLowerCase()} from the controls. The photo is framed differently, so objects are compared by count per class, not by box overlap.</p>
      <label className="field">Photo of the same scene
        <input type="file" accept="image/*" disabled={disabled || busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onRun(f); e.target.value = ""; }} />
      </label>
      {busy && <div className="note">Comparing the photo with 5 simulated severities…</div>}
      {result && (
        <>
          <div className="stat-grid">
            <div className="stat"><b>{pct(result.realCountRetention)}</b><span>of baseline objects found in the real photo</span></div>
            <div className="stat"><b>{result.matchedSeverity === null ? "N/A" : result.matchedSeverity}</b><span>closest simulated severity ({conditionLabel.toLowerCase()})</span></div>
          </div>
          <div className="scroll">
            <table className="heat">
              <caption>Simulated {conditionLabel.toLowerCase()}, objects found compared with the baseline (count per class).</caption>
              <thead><tr>{result.simulated.map((s) => <th key={s.severity}>{s.severity}</th>)}<th>Real photo</th></tr></thead>
              <tbody><tr>{result.simulated.map((s) => <td key={s.severity} className={s.severity === result.matchedSeverity ? "hit" : ""}>{pct(s.countRetention)}</td>)}<td className="hit">{pct(result.realCountRetention)}</td></tr></tbody>
            </table>
          </div>
          <p className="prose">{result.note}</p>
          {view && (
            <div className="pair">
              <figure className="frame mod"><figcaption>Real photo: {view.photoDets.length} detections</figcaption><Viewer source={view.photo} detections={view.photoDets} color={colors.mod} dashed={dashed} /></figure>
              <figure className="frame mod"><figcaption>Simulated, severity {result.matchedSeverity ?? "N/A"}: {view.simDets.length} detections</figcaption><Viewer source={view.sim} detections={view.simDets} color={colors.mod} dashed={dashed} /></figure>
            </div>
          )}
          <div className="scroll">
            <table>
              <thead><tr><th>Class</th><th>Baseline</th><th>Real photo</th><th>Simulated at best match</th></tr></thead>
              <tbody>{Object.entries(result.perClass).map(([c, v]) => <tr key={c}><td>{c}</td><td>{v.baseline}</td><td>{v.real}</td><td>{v.simulated}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
