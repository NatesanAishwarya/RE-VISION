import type { BoundingBox, Detection } from "../types/experiment";
import { iou } from "./comparison";

const area = (b: BoundingBox) => b.width * b.height;

function intersection(a: BoundingBox, b: BoundingBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Class-aware non-max suppression used to merge detections from several tiles.
 * Besides plain IoU, a box mostly contained in a higher-scoring box of the same
 * class is dropped too: a tile that cuts an object in half yields a small box
 * inside the full-image box, and IoU alone would keep both.
 */
export function mergeDetections(all: Detection[], iouThreshold = 0.5, containThreshold = 0.85): Detection[] {
  const sorted = [...all].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    const dup = kept.some((k) => {
      if (k.className !== d.className) return false;
      if (iou(k.box, d.box) >= iouThreshold) return true;
      const inter = intersection(k.box, d.box);
      return area(d.box) <= area(k.box) && inter / Math.max(area(d.box), 1e-9) >= containThreshold;
    });
    if (!dup) kept.push(d);
  }
  return kept;
}
