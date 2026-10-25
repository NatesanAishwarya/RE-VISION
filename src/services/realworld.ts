import type { ConditionType, Detection, RealWorldResult } from "../types/experiment";

/**
 * IoU-free comparison, for a photo that is framed differently from the original.
 * Per class, min(count found, count in baseline) summed, divided by the baseline total.
 */
export function countRetention(baseline: Detection[], found: Detection[]): number | null {
  if (!baseline.length) return null;
  const count = (ds: Detection[]) => ds.reduce<Record<string, number>>((m, d) => ((m[d.className] = (m[d.className] ?? 0) + 1), m), {});
  const b = count(baseline), f = count(found);
  const kept = Object.keys(b).reduce((s, c) => s + Math.min(b[c], f[c] ?? 0), 0);
  return kept / baseline.length;
}

/** The simulated severity whose count retention is closest to the real photo's. Ties go to the milder severity. */
export function closestSeverity(real: number | null, simulated: { severity: number; countRetention: number | null }[]): number | null {
  if (real === null) return null;
  let best: { s: number; d: number } | null = null;
  for (const p of [...simulated].sort((a, b) => a.severity - b.severity)) {
    if (p.countRetention === null) continue;
    const d = Math.abs(p.countRetention - real);
    if (!best || d < best.d - 1e-9) best = { s: p.severity, d };
  }
  return best ? best.s : null;
}

export function perClass(baseline: Detection[], real: Detection[], simulated: Detection[]): RealWorldResult["perClass"] {
  const out: RealWorldResult["perClass"] = {};
  const add = (ds: Detection[], key: "baseline" | "real" | "simulated") =>
    ds.forEach((d) => { (out[d.className] ??= { baseline: 0, real: 0, simulated: 0 })[key]++; });
  add(baseline, "baseline"); add(real, "real"); add(simulated, "simulated");
  return out;
}

export function realWorldNote(condition: ConditionType, real: number | null, matched: number | null): string {
  if (real === null) return "The baseline had no detections, so there is nothing to compare against.";
  if (matched === null) return "No simulated severity could be scored.";
  return matched === 0
    ? `The real photo kept ${(real * 100).toFixed(0)}% of the baseline objects, about what the unmodified image gives. The real condition barely hurt the model.`
    : `The real photo kept ${(real * 100).toFixed(0)}% of the baseline objects. That is closest to the simulated ${condition} at severity ${matched}, so that is how hard this real condition was for the model.`;
}
