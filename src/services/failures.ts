import type { BoundingBox, ConditionType, Detection, Item, SweepPoint } from "../types/experiment";

export type FailureKind = "missed" | "confidence_drop" | "shifted" | "false_positive";
export const KIND_LABEL: Record<FailureKind, string> = {
  missed: "Missed", confidence_drop: "Confidence drop", shifted: "Box shifted", false_positive: "False detection",
};
export const CONF_DROP = 0.2; // a matched object losing this much confidence counts as a drop
export const SHIFT_IOU = 0.8; // matched pairs below this IoU count as shifted

export type Failure = {
  kind: FailureKind; className: string; condition: ConditionType; severity: number;
  bid?: string; baseScore?: number; modScore?: number; baseBox?: BoundingBox; modBox?: BoundingBox;
  iou?: number; delta?: number; shiftPx?: number;
};

const toBox = (b: [number, number, number, number]): BoundingBox => ({ x: b[0], y: b[1], width: b[2], height: b[3] });
const centre = (b: BoundingBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const stressed = (p: SweepPoint) => p.severity > 0 && !p.error && !!p.items;

/** Every individual failure across all stressed runs. */
export function deriveFailures(baseline: Detection[], points: SweepPoint[]): Failure[] {
  const byId = new Map(baseline.map((d) => [d.id, d]));
  const out: Failure[] = [];
  for (const p of points.filter(stressed)) {
    for (const it of p.items!) {
      const base = it.bid ? byId.get(it.bid) : undefined;
      const common = { className: it.cls, condition: p.condition, severity: p.severity, bid: it.bid };
      if (it.st === "l" && base) out.push({ ...common, kind: "missed", baseScore: base.score, baseBox: base.box });
      else if (it.st === "n" && it.box) out.push({ ...common, kind: "false_positive", modScore: it.score, modBox: toBox(it.box) });
      else if (it.st === "r" && base && it.box && it.score !== undefined) {
        const mb = toBox(it.box), cb = centre(base.box), cm = centre(mb), delta = it.score - base.score;
        const f = { ...common, baseScore: base.score, modScore: it.score, baseBox: base.box, modBox: mb, iou: it.iou, delta, shiftPx: Math.hypot(cm.x - cb.x, cm.y - cb.y) };
        if (delta <= -CONF_DROP) out.push({ ...f, kind: "confidence_drop" });
        if (it.iou !== undefined && it.iou < SHIFT_IOU) out.push({ ...f, kind: "shifted" });
      }
    }
  }
  return out;
}

export type ObjectReport = {
  bid: string; className: string; baseScore: number; box: BoundingBox;
  runs: number; missed: number; drops: number; shifted: number;
  firstMiss: { condition: ConditionType; severity: number } | null;
  worstDrop: { delta: number; condition: ConditionType; severity: number } | null;
  worstShift: { iou: number; condition: ConditionType; severity: number } | null;
};

/** One row per baseline object: how often and where it was missed, lost confidence, or moved. */
export function objectReports(baseline: Detection[], points: SweepPoint[]): ObjectReport[] {
  const rows = new Map<string, ObjectReport>(baseline.map((d) => [d.id, {
    bid: d.id, className: d.className, baseScore: d.score, box: d.box, runs: 0, missed: 0, drops: 0, shifted: 0,
    firstMiss: null, worstDrop: null, worstShift: null,
  }]));
  const sorted = [...points.filter(stressed)].sort((a, b) => a.severity - b.severity);
  for (const p of sorted) {
    for (const it of p.items as Item[]) {
      const row = it.bid ? rows.get(it.bid) : undefined;
      if (!row) continue;
      row.runs++;
      if (it.st === "l") { row.missed++; if (!row.firstMiss) row.firstMiss = { condition: p.condition, severity: p.severity }; }
      if (it.st === "r" && it.score !== undefined) {
        const delta = it.score - row.baseScore;
        if (delta <= -CONF_DROP) row.drops++;
        if (!row.worstDrop || delta < row.worstDrop.delta) row.worstDrop = { delta, condition: p.condition, severity: p.severity };
        if (it.iou !== undefined) {
          if (it.iou < SHIFT_IOU) row.shifted++;
          if (!row.worstShift || it.iou < row.worstShift.iou) row.worstShift = { iou: it.iou, condition: p.condition, severity: p.severity };
        }
      }
    }
  }
  return [...rows.values()].filter((r) => r.runs > 0).sort((a, b) => b.missed / b.runs - a.missed / a.runs || b.drops + b.shifted - (a.drops + a.shifted) || a.baseScore - b.baseScore);
}

/** A varied handful for the gallery: the most dramatic example of each kind, never the same object twice per kind. */
export function pickGalleryCandidates(failures: Failure[], perKind = 4): Failure[] {
  const score: Record<FailureKind, (f: Failure) => number> = {
    missed: (f) => 100 - f.severity + (f.baseScore ?? 0), // dies earliest, and was confident
    confidence_drop: (f) => -(f.delta ?? 0),
    shifted: (f) => 1 - (f.iou ?? 1),
    false_positive: (f) => f.modScore ?? 0,
  };
  const out: Failure[] = [];
  for (const kind of Object.keys(score) as FailureKind[]) {
    const seen = new Set<string>();
    for (const f of failures.filter((x) => x.kind === kind).sort((a, b) => score[kind](b) - score[kind](a))) {
      const key = f.bid ?? `${f.className}@${f.modBox?.x}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(f);
      if (seen.size >= perKind) break;
    }
  }
  return out;
}

export function failureMix(failures: Failure[]): Record<FailureKind, number> {
  const m: Record<FailureKind, number> = { missed: 0, confidence_drop: 0, shifted: 0, false_positive: 0 };
  failures.forEach((f) => m[f.kind]++);
  return m;
}

const pctText = (v: number | null | undefined) => (v == null ? "N/A" : `${Math.round(v * 100)}%`);
/** One plain sentence describing a failure. */
export function failureDetail(f: Failure): string {
  if (f.kind === "missed") return `Found at ${pctText(f.baseScore)} confidence before, not found now.`;
  if (f.kind === "false_positive") return `Nothing was here before; found now at ${pctText(f.modScore)}.`;
  if (f.kind === "confidence_drop") return `Confidence ${pctText(f.baseScore)} to ${pctText(f.modScore)}.`;
  return `Box overlap with the original dropped to ${(f.iou ?? 0).toFixed(2)}; centre moved ${Math.round(f.shiftPx ?? 0)} px.`;
}
