import type { ConditionType } from "../types/experiment";

/** Severity 0..100 -> real parameter. Always rendered from the ORIGINAL image. */
export const describeMapping: Record<ConditionType, (s: number) => string> = {
  brightness: (s) => `brightness ×${(1 - s / 100 * 0.9).toFixed(2)} (darker as severity rises)`,
  blur: (s) => `Gaussian blur ${(s / 100 * 12).toFixed(1)} px`,
  contrast: (s) => `contrast ×${(1 - s / 100 * 0.9).toFixed(2)} (flatter as severity rises)`,
  occlusion: (s) => `grey box covering ${(Math.sqrt(s / 100) * 100).toFixed(0)}% of width and height, image centre`,
};

export function applyCondition(src: HTMLImageElement, condition: ConditionType, severity: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.naturalWidth; c.height = src.naturalHeight;
  const ctx = c.getContext("2d")!;
  const t = severity / 100;
  if (condition === "brightness") ctx.filter = `brightness(${1 - t * 0.9})`;
  if (condition === "contrast") ctx.filter = `contrast(${1 - t * 0.9})`;
  if (condition === "blur") ctx.filter = `blur(${t * 12}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  if (condition === "occlusion") {
    const f = Math.sqrt(t), w = c.width * f, h = c.height * f;
    ctx.fillStyle = "#808080";
    ctx.fillRect((c.width - w) / 2, (c.height - h) / 2, w, h);
  }
  return c;
}
