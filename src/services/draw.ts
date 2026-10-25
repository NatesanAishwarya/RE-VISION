import type { Detection } from "../types/experiment";

/** Draw boxes + labels onto a canvas that already holds the image. Dashed boxes mark open-vocabulary search. */
export function drawDetections(ctx: CanvasRenderingContext2D, w: number, detections: Detection[], color: string, dashed = false) {
  const lw = Math.max(2, w / 250);
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.font = `${Math.max(12, w / 45)}px system-ui`;
  for (const d of detections) {
    ctx.setLineDash(dashed ? [lw * 3, lw * 2] : []);
    ctx.strokeRect(d.box.x, d.box.y, d.box.width, d.box.height);
    const label = `${d.className} ${(d.score * 100).toFixed(0)}%`;
    const tw = ctx.measureText(label).width + 8, th = Math.max(16, w / 38);
    ctx.fillRect(d.box.x, Math.max(0, d.box.y - th), tw, th);
    ctx.fillStyle = "#fff"; ctx.fillText(label, d.box.x + 4, Math.max(th - 4, d.box.y - 4)); ctx.fillStyle = color;
  }
  ctx.setLineDash([]);
}
