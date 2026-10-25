import type { BoundingBox, ClassCounts, Detection, DetectionComparison, Item, Metrics } from "../types/experiment";

export const IOU_MATCH = 0.5; // min IoU to count as the same object
export const LOCALIZATION_IOU = 0.8; // matched pairs below this IoU are flagged "localization changed"

export function iou(a: BoundingBox, b: BoundingBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

const centre = (b: BoundingBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Class-aware, one-to-one greedy matching: highest-IoU pairs first. */
export function compare(baseline: Detection[], modified: Detection[], threshold = IOU_MATCH): DetectionComparison[] {
  const pairs: { b: number; m: number; iou: number }[] = [];
  baseline.forEach((bd, b) =>
    modified.forEach((md, m) => {
      if (bd.className !== md.className) return;
      const v = iou(bd.box, md.box);
      if (v >= threshold) pairs.push({ b, m, iou: v });
    }),
  );
  pairs.sort((p, q) => q.iou - p.iou);
  const usedB = new Set<number>(), usedM = new Set<number>();
  const out: DetectionComparison[] = [];
  for (const p of pairs) {
    if (usedB.has(p.b) || usedM.has(p.m)) continue;
    usedB.add(p.b); usedM.add(p.m);
    const bd = baseline[p.b], md = modified[p.m];
    const cb = centre(bd.box), cm = centre(md.box);
    out.push({
      status: "retained", baseline: bd, modified: md, iou: p.iou,
      confidenceDelta: md.score - bd.score,
      boxShiftPx: Math.hypot(cm.x - cb.x, cm.y - cb.y),
      localizationChanged: p.iou < LOCALIZATION_IOU,
    });
  }
  baseline.forEach((d, i) => { if (!usedB.has(i)) out.push({ status: "lost", baseline: d }); });
  modified.forEach((d, i) => { if (!usedM.has(i)) out.push({ status: "new", modified: d }); });
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function summarize(c: DetectionComparison[]): Metrics {
  const kept = c.filter((x) => x.status === "retained");
  const lost = c.filter((x) => x.status === "lost").length;
  const added = c.filter((x) => x.status === "new").length;
  const baselineCount = kept.length + lost;
  return {
    baselineCount, modifiedCount: kept.length + added, matchedCount: kept.length,
    lostCount: lost, newCount: added,
    retentionRate: baselineCount === 0 ? null : kept.length / baselineCount, // N/A, not 0, with no baseline
    meanConfidenceDelta: mean(kept.map((x) => x.confidenceDelta!)),
    meanIoU: mean(kept.map((x) => x.iou!)),
    localizationChangedCount: kept.filter((x) => x.localizationChanged).length,
  };
}

/** Per-class counts of baseline detections and how many were retained. */
export function classCounts(c: DetectionComparison[]): ClassCounts {
  const out: ClassCounts = {};
  for (const x of c) {
    if (!x.baseline) continue; // "new" detections have no baseline
    const row = (out[x.baseline.className] ??= { baseline: 0, retained: 0 });
    row.baseline++;
    if (x.status === "retained") row.retained++;
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const boxOf = (d: Detection): [number, number, number, number] => [r1(d.box.x), r1(d.box.y), r1(d.box.width), r1(d.box.height)];

/** Compact, storable record of every object in a run. Lets failures be analysed later without re-running the model. */
export function toItems(c: DetectionComparison[]): Item[] {
  return c.map((x): Item => {
    if (x.status === "lost") return { st: "l", cls: x.baseline!.className, bid: x.baseline!.id };
    if (x.status === "new") return { st: "n", cls: x.modified!.className, box: boxOf(x.modified!), score: Math.round(x.modified!.score * 1000) / 1000 };
    return { st: "r", cls: x.baseline!.className, bid: x.baseline!.id, box: boxOf(x.modified!), score: Math.round(x.modified!.score * 1000) / 1000, iou: Math.round(x.iou! * 1000) / 1000 };
  });
}
