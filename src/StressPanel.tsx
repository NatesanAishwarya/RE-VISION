import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CONDITIONS, LEVELS } from "./services/sweep";
import type { ConditionType, Metrics, SweepPoint } from "./types/experiment";

const METRICS = {
  retentionRate: { label: "Detection retention (matched ÷ baseline)", fmt: (v: number) => `${(v * 100).toFixed(0)}%`, lo: 0, hi: 1 },
  meanConfidenceDelta: { label: "Mean score change (matched)", fmt: (v: number) => v.toFixed(2), lo: -0.5, hi: 0.1 },
  meanIoU: { label: "Mean IoU (matched)", fmt: (v: number) => v.toFixed(2), lo: 0.3, hi: 1 },
} as const;
type Key = keyof typeof METRICS;
const NAMES: Record<ConditionType, string> = { brightness: "Darken", blur: "Blur", contrast: "Low contrast", occlusion: "Box cover" };

export default function StressPanel({ points, total }: { points: SweepPoint[]; total: number }) {
  const [key, setKey] = useState<Key>("retentionRate");
  const [cond, setCond] = useState<ConditionType>("blur");
  const m = METRICS[key];
  const find = (c: ConditionType, s: number) => points.find((p) => p.condition === c && p.severity === s);
  const val = (p?: SweepPoint) => (p?.metrics ? (p.metrics[key as keyof Metrics] as number | null) : null);
  const data = LEVELS.map((s) => ({ severity: s, value: val(find(cond, s)) }));
  const shade = (v: number) => `hsl(${Math.round(Math.max(0, Math.min(1, (v - m.lo) / (m.hi - m.lo))) * 140)} 60% 80%)`;

  return (
    <section>
      <h2>Stress test: {points.length} of {total} runs</h2>
      <div className="row">
        <select value={key} onChange={(e) => setKey(e.target.value as Key)} aria-label="Metric">
          {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={cond} onChange={(e) => setCond(e.target.value as ConditionType)} aria-label="Condition for chart">
          {CONDITIONS.map((c) => <option key={c} value={c}>{NAMES[c]}</option>)}
        </select>
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
            <CartesianGrid stroke="#d5dde1" />
            <XAxis dataKey="severity" type="number" domain={[0, 100]} ticks={LEVELS} label={{ value: `${NAMES[cond]} severity (0–100)`, position: "insideBottom", offset: -8 }} />
            <YAxis domain={[m.lo, m.hi]} tickFormatter={(v: number) => m.fmt(v)} width={48} />
            <Tooltip formatter={(v) => (typeof v === "number" ? m.fmt(v) : "N/A")} />
            <Line dataKey="value" stroke="#1565c0" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="heat">
        <caption>{m.label}. Same model, threshold and original image in every cell.</caption>
        <thead><tr><th>Condition</th>{LEVELS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
        <tbody>
          {CONDITIONS.map((c) => (
            <tr key={c}>
              <th>{NAMES[c]}</th>
              {LEVELS.map((s) => {
                const p = find(c, s), v = val(p);
                if (!p) return <td key={s} className="dim">Not tested</td>;
                if (p.error) return <td key={s} className="bad" title={p.error}>Failed</td>;
                return v === null ? <td key={s} className="dim">N/A</td> : <td key={s} style={{ background: shade(v) }}>{m.fmt(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <small>N/A means the metric is undefined (for example, no baseline detections or no matches). Results cover this image only.</small>
    </section>
  );
}
