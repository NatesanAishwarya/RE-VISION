import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVELS } from "./services/sweep";
import { CONDITION_LABEL } from "./services/transform";
import { conditionsIn, grade } from "./services/robustness";
import type { Analysis } from "./services/analysis";
import type { ConditionType, Metrics, SweepPoint } from "./types/experiment";
import type { ThemeColors } from "./theme";
import Rosette from "./components/Rosette";

const METRICS = {
  retentionRate: { label: "Detection retention (matched ÷ expected)", fmt: (v: number) => `${(v * 100).toFixed(0)}%`, lo: 0, hi: 1 },
  meanConfidenceDelta: { label: "Mean score change (matched)", fmt: (v: number) => v.toFixed(2), lo: -0.5, hi: 0.1 },
  meanIoU: { label: "Mean IoU (matched)", fmt: (v: number) => v.toFixed(2), lo: 0.3, hi: 1 },
} as const;
type Key = keyof typeof METRICS;

export default function StressPanel({ points, total, analysis, colors }: { points: SweepPoint[]; total: number; analysis: Analysis; colors: ThemeColors }) {
  const conds = conditionsIn(points);
  const [key, setKey] = useState<Key>("retentionRate");
  const [picked, setPicked] = useState<ConditionType>("blur");
  const cond = conds.includes(picked) ? picked : conds[0];
  const m = METRICS[key];
  const find = (c: ConditionType, s: number) => points.find((p) => p.condition === c && p.severity === s);
  const val = (p?: SweepPoint) => (p?.metrics ? (p.metrics[key as keyof Metrics] as number | null) : null);
  const data = LEVELS.map((s) => ({ severity: s, value: val(find(cond, s)) }));
  const shade = (v: number) => `hsl(${Math.round(Math.max(0, Math.min(1, (v - m.lo) / (m.hi - m.lo))) * 140)} 60% 80%)`;
  const o = analysis.robust.overall, complete = points.length >= total;

  return (
    <section className="panel">
      <h2>Stress test: {points.length} of {total} runs</h2>

      <div className="score-hero">
        <Rosette scores={analysis.robust.perCondition} overall={o} />
        <div className="score-words">
          <p className={`grade ${o === null ? "" : o >= 65 ? "good" : o >= 40 ? "mid" : "bad"}`}>{grade(o)}{!complete && " (partial)"}</p>
          <p className="muted">The farther a spoke reaches, the better the model held up under that change. The score is the area under (retention × mean IoU) across the tested severities, averaged over conditions.</p>
          <ul className="bars">
            {analysis.robust.perCondition.map((c) => (
              <li key={c.condition}>
                <span>{CONDITION_LABEL[c.condition]}</span>
                <i className="meter"><u style={{ width: `${c.score ?? 0}%` }} /></i>
                <b>{c.score === null ? "N/A" : c.score.toFixed(0)}</b>
                <small>{c.score === null ? "" : c.breakSeverity === null ? "holds above 50%" : `under 50% from ${c.breakSeverity}`}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="row">
        <select value={key} onChange={(e) => setKey(e.target.value as Key)} aria-label="Metric">
          {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={cond} onChange={(e) => setPicked(e.target.value as ConditionType)} aria-label="Condition for chart">
          {conds.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
        </select>
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
            <CartesianGrid stroke={colors.line} />
            <XAxis dataKey="severity" type="number" domain={[0, 100]} ticks={LEVELS} stroke={colors.muted} label={{ value: `${CONDITION_LABEL[cond]} severity (0–100)`, position: "insideBottom", offset: -8, fill: colors.muted }} />
            <YAxis domain={[m.lo, m.hi]} tickFormatter={(v: number) => m.fmt(v)} width={48} stroke={colors.muted} />
            <Tooltip formatter={(v) => (typeof v === "number" ? m.fmt(v) : "N/A")} />
            <Line dataKey="value" stroke={colors.orig} strokeWidth={2.5} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="scroll">
        <table className="heat">
          <caption>{m.label}. Same model, threshold and original image in every cell.</caption>
          <thead><tr><th>Condition</th>{LEVELS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {conds.map((c) => (
              <tr key={c}>
                <th>{CONDITION_LABEL[c]}</th>
                {LEVELS.map((s) => {
                  const p = find(c, s), v = val(p);
                  if (!p) return <td key={s} className="dim">Not tested</td>;
                  if (p.error) return <td key={s} className="bad" title={p.error}>Failed</td>;
                  return v === null ? <td key={s} className="dim">N/A</td> : <td key={s} style={{ background: shade(v), color: "#14232b" }}>{m.fmt(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis.classes.length > 0 ? (
        <>
          <h3>Which object types fail first</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Class</th><th>In baseline</th><th>Kept under stress</th><th>First drops below 50%</th></tr></thead>
              <tbody>
                {analysis.classes.map((c) => (
                  <tr key={c.className}>
                    <td>{c.className}</td><td>{c.baseline}</td>
                    <td>{c.retention === null ? "N/A" : <><i className="meter inline"><u style={{ width: `${c.retention * 100}%` }} /></i> {(c.retention * 100).toFixed(0)}%</>}</td>
                    <td>{c.firstFail ? `${CONDITION_LABEL[c.firstFail.condition]}, severity ${c.firstFail.severity}` : "never in the tested range"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>Pooled over every stressed run (severity above 0). Severities are on different scales for different conditions, so compare classes under the same condition, not across conditions.</small>
        </>
      ) : points.some((p) => p.metrics) && <small>No per-class data in this experiment.</small>}
      <small>N/A means the metric is undefined (for example, no baseline detections or no matches). Results cover this image only.</small>
    </section>
  );
}
