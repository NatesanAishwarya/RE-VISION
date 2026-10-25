import type { BoundingBox, ConditionType, Detection, Step } from "../types/experiment";

export const ROTATION_MAX_DEG = 45;
export const CROP_MAX_LOSS = 0.6; // at severity 100 only 40% of each side remains
export const MIN_VISIBLE = 0.35; // an object less than this visible is no longer expected to be found

export const isGeometric = (c: ConditionType) => c === "rotation" || c === "crop";

/** Where the original box lands after a geometric step, clipped to the frame. null = mostly out of frame. */
export function mapBox(b: BoundingBox, step: Step, w: number, h: number): BoundingBox | null {
  const t = step.severity / 100;
  let xs: number[], ys: number[];
  if (step.condition === "rotation") {
    const a = (t * ROTATION_MAX_DEG * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), cx = w / 2, cy = h / 2;
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
    xs = pts.map(([x, y]) => cx + (x - cx) * cos - (y - cy) * sin);
    ys = pts.map(([x, y]) => cy + (x - cx) * sin + (y - cy) * cos);
  } else if (step.condition === "crop") {
    const f = 1 - t * CROP_MAX_LOSS, x0 = (w - w * f) / 2, y0 = (h - h * f) / 2, s = 1 / f;
    xs = [(b.x - x0) * s, (b.x + b.width - x0) * s]; ys = [(b.y - y0) * s, (b.y + b.height - y0) * s];
  } else return b;
  const fx = Math.min(...xs), fy = Math.min(...ys), fw = Math.max(...xs) - fx, fh = Math.max(...ys) - fy;
  const x1 = Math.max(0, fx), y1 = Math.max(0, fy), x2 = Math.min(w, fx + fw), y2 = Math.min(h, fy + fh);
  if (x2 <= x1 || y2 <= y1 || fw * fh <= 0) return null;
  if (((x2 - x1) * (y2 - y1)) / (fw * fh) < MIN_VISIBLE) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** The baseline objects we should expect to find in the modified image, in the modified image's coordinates. */
export function expectedBaseline(base: Detection[], steps: Step[], w: number, h: number): Detection[] {
  let cur = base;
  for (const s of steps) {
    if (!isGeometric(s.condition) || s.severity === 0) continue;
    cur = cur.flatMap((d) => { const m = mapBox(d.box, s, w, h); return m ? [{ ...d, box: m }] : []; });
  }
  return cur;
}
