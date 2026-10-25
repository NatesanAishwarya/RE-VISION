import type { ConditionType, SweepPoint } from "../types/experiment";

export type ConditionScore = {
  condition: ConditionType;
  /** 0..100: area under (retention × mean IoU) across the tested severities. null if undefined. */
  score: number | null;
  /** Lowest tested severity where retention drops below 50%, or null if it never does. */
  breakSeverity: number | null;
  tested: number;
};
export type Robustness = { overall: number | null; perCondition: ConditionScore[]; weakest: ConditionType | null };

/** Quality of one run: fraction of baseline objects kept, weighted by how well they stayed in place. */
export function pointQuality(p: SweepPoint): number | null {
  const m = p.metrics;
  if (!m || m.retentionRate === null) return null; // no baseline: undefined, not zero
  return m.retentionRate * (m.meanIoU ?? 0);
}

/** Trapezoid area under the curve divided by the severity span, so it stays within 0..1. */
export function areaUnderCurve(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null;
  let area = 0;
  for (let i = 1; i < xs.length; i++) area += ((ys[i] + ys[i - 1]) / 2) * (xs[i] - xs[i - 1]);
  const span = xs[xs.length - 1] - xs[0];
  return span > 0 ? area / span : null;
}

export const conditionsIn = (points: SweepPoint[]): ConditionType[] => [...new Set(points.map((p) => p.condition))];

export function robustness(points: SweepPoint[], conditions: ConditionType[] = conditionsIn(points)): Robustness {
  const perCondition: ConditionScore[] = conditions.map((condition) => {
    const pts = points.filter((p) => p.condition === condition && !p.error).sort((a, b) => a.severity - b.severity);
    const usable = pts.map((p) => ({ s: p.severity, q: pointQuality(p) })).filter((u): u is { s: number; q: number } => u.q !== null);
    const auc = areaUnderCurve(usable.map((u) => u.s), usable.map((u) => u.q));
    const below = pts.find((p) => p.metrics?.retentionRate != null && p.metrics.retentionRate < 0.5);
    return { condition, score: auc === null ? null : auc * 100, breakSeverity: below ? below.severity : null, tested: usable.length };
  });
  const scored = perCondition.filter((c) => c.score !== null);
  const overall = scored.length ? scored.reduce((s, c) => s + c.score!, 0) / scored.length : null;
  const weakest = scored.length ? scored.reduce((a, b) => (b.score! < a.score! ? b : a)).condition : null;
  return { overall, perCondition, weakest };
}

export function grade(score: number | null): string {
  if (score === null) return "N/A";
  return score >= 85 ? "Very robust" : score >= 65 ? "Fairly robust" : score >= 40 ? "Fragile" : "Very fragile";
}
