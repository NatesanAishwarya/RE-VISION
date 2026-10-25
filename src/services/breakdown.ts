import type { ConditionType, SweepPoint } from "../types/experiment";

export type ClassRow = {
  className: string;
  baseline: number;
  /** Pooled retention across every stressed run (severity > 0). */
  retention: number | null;
  firstFail: { condition: ConditionType; severity: number } | null;
};

/** Which object types fail first? Sorted most fragile first. */
export function classBreakdown(points: SweepPoint[]): ClassRow[] {
  const names = new Set<string>();
  points.forEach((p) => p.byClass && Object.keys(p.byClass).forEach((n) => names.add(n)));
  const rows: ClassRow[] = [];
  for (const className of names) {
    let baseline = 0, kept = 0, total = 0;
    let first: ClassRow["firstFail"] = null;
    for (const p of [...points].sort((a, b) => a.severity - b.severity)) {
      const c = p.byClass?.[className];
      if (!c || c.baseline === 0) continue;
      baseline = Math.max(baseline, c.baseline);
      if (p.severity === 0) continue; // severity 0 is the unmodified image
      kept += c.retained; total += c.baseline;
      if (c.retained / c.baseline < 0.5 && (!first || p.severity < first.severity)) first = { condition: p.condition, severity: p.severity };
    }
    rows.push({ className, baseline, retention: total ? kept / total : null, firstFail: first });
  }
  return rows.sort((a, b) => (a.retention ?? 2) - (b.retention ?? 2) || a.className.localeCompare(b.className));
}
