import type { ConditionType, Step } from "../types/experiment";
import { CROP_MAX_LOSS, ROTATION_MAX_DEG } from "./geometry";

export const CONDITION_LABEL: Record<ConditionType, string> = {
  brightness: "Darken", blur: "Blur", contrast: "Low contrast", occlusion: "Box cover",
  noise: "Noise", rotation: "Rotation", jpeg: "JPEG compression", lowlight: "Low light",
  motionblur: "Motion blur", crop: "Crop", resize: "Low resolution", haze: "Haze", colorshift: "Colour shift",
};
export const NOISE_SEEDS: Record<string, number> = { noise: 1337, lowlight: 4242 };

/** Severity 0..100 -> real parameter. Always rendered from the ORIGINAL image. Severity 0 is always the untouched image. */
export const describeMapping: Record<ConditionType, (s: number) => string> = {
  brightness: (s) => `brightness ×${(1 - s / 100 * 0.9).toFixed(2)} (darker as severity rises)`,
  blur: (s) => `Gaussian blur ${(s / 100 * 12).toFixed(1)} px`,
  contrast: (s) => `contrast ×${(1 - s / 100 * 0.9).toFixed(2)} (flatter as severity rises)`,
  occlusion: (s) => `grey box covering ${(Math.sqrt(s / 100) * 100).toFixed(0)}% of width and height, image centre`,
  noise: (s) => `Gaussian noise, σ = ${(s / 100 * 90).toFixed(0)} of 255 per colour channel`,
  rotation: (s) => `rotated ${(s / 100 * ROTATION_MAX_DEG).toFixed(1)}° about the centre, corners filled grey; expected boxes rotate too`,
  jpeg: (s) => (s === 0 ? "original (no re-encoding)" : `re-encoded as JPEG at quality ${Math.round(Math.max(0.02, 1 - s / 100 * 0.98) * 100)}%`),
  lowlight: (s) => `brightness ×${(1 - s / 100 * 0.85).toFixed(2)}, colour ×${(1 - s / 100 * 0.6).toFixed(2)}, sensor noise σ = ${(s / 100 * 35).toFixed(0)}`,
  motionblur: (s) => `linear motion blur over ${(s / 100 * 6).toFixed(1)}% of the image width, at 30°`,
  crop: (s) => `centre crop keeping ${Math.round((1 - s / 100 * CROP_MAX_LOSS) * 100)}% of each side, scaled back up; objects mostly cut off are no longer expected`,
  resize: (s) => `downscaled to ${Math.round((1 - s / 100 * 0.92) * 100)}% of its size, then scaled back up`,
  haze: (s) => `contrast ×${(1 - s / 100 * 0.5).toFixed(2)} with a pale veil of ${Math.round(s / 100 * 70)}% opacity`,
  colorshift: (s) => `hue rotated ${Math.round(s / 100 * 90)}°, sepia ${Math.round(s / 100 * 60)}%`,
};
export const stepText = (s: Step) => `${CONDITION_LABEL[s.condition]} ${s.severity}`;
export const stepsText = (steps: Step[]) => steps.map(stepText).join(" + ");

type Src = HTMLImageElement | HTMLCanvasElement;
const dims = (src: Src) => (src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height });

/** Small seeded PRNG so the same severity always produces the same noise (runs stay comparable). */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addGaussianNoise(ctx: CanvasRenderingContext2D, w: number, h: number, sigma: number, seed = 1337) {
  if (sigma <= 0) return;
  const img = ctx.getImageData(0, 0, w, h), px = img.data, rnd = mulberry32(seed);
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const g = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); // Box-Muller
      px[i + c] = Math.max(0, Math.min(255, px[i + c] + g * sigma));
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function applyCondition(src: Src, condition: ConditionType, severity: number): Promise<HTMLCanvasElement> {
  const { w, h } = dims(src);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const t = severity / 100;

  if (condition === "rotation") {
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2); ctx.rotate((t * ROTATION_MAX_DEG * Math.PI) / 180);
    ctx.drawImage(src, -w / 2, -h / 2);
    return c;
  }
  if (condition === "crop") {
    const f = 1 - t * CROP_MAX_LOSS;
    ctx.drawImage(src, (w - w * f) / 2, (h - h * f) / 2, w * f, h * f, 0, 0, w, h);
    return c;
  }
  if (condition === "resize") {
    const s = 1 - t * 0.92, sw = Math.max(8, Math.round(w * s)), sh = Math.max(8, Math.round(h * s));
    const small = document.createElement("canvas");
    small.width = sw; small.height = sh;
    small.getContext("2d")!.drawImage(src, 0, 0, sw, sh);
    ctx.drawImage(small, 0, 0, w, h);
    return c;
  }
  if (condition === "motionblur") {
    const len = t * 0.06 * w, a = (30 * Math.PI) / 180, n = 24;
    for (let i = 0; i < n; i++) { // running average of shifted copies = a linear motion blur
      const k = i / (n - 1) - 0.5;
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(src, Math.cos(a) * len * k, Math.sin(a) * len * k);
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (condition === "brightness") ctx.filter = `brightness(${1 - t * 0.9})`;
  if (condition === "contrast") ctx.filter = `contrast(${1 - t * 0.9})`;
  if (condition === "blur") ctx.filter = `blur(${t * 12}px)`;
  if (condition === "lowlight") ctx.filter = `brightness(${1 - t * 0.85}) saturate(${1 - t * 0.6})`;
  if (condition === "haze") ctx.filter = `contrast(${1 - t * 0.5})`;
  if (condition === "colorshift") ctx.filter = `hue-rotate(${t * 90}deg) sepia(${t * 0.6})`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";

  if (condition === "haze") { ctx.fillStyle = `rgba(222,228,234,${t * 0.7})`; ctx.fillRect(0, 0, w, h); }
  if (condition === "occlusion") {
    const f = Math.sqrt(t), bw = w * f, bh = h * f;
    ctx.fillStyle = "#808080";
    ctx.fillRect((w - bw) / 2, (h - bh) / 2, bw, bh);
  }
  if (condition === "noise") addGaussianNoise(ctx, w, h, t * 90, NOISE_SEEDS.noise);
  if (condition === "lowlight") addGaussianNoise(ctx, w, h, t * 35, NOISE_SEEDS.lowlight);
  if (condition === "jpeg" && severity > 0) {
    const quality = Math.max(0.02, 1 - t * 0.98);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("This browser could not re-encode the image as JPEG.");
    const bmp = await createImageBitmap(blob);
    ctx.clearRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0); bmp.close();
  }
  return c;
}

/** Apply several steps in order; each step starts from the previous result. */
export async function applySteps(src: Src, steps: Step[]): Promise<HTMLCanvasElement> {
  let cur: Src = src;
  const active = steps.filter((s) => s.severity > 0);
  if (!active.length) return applyCondition(src, steps[0]?.condition ?? "blur", 0);
  for (const s of active) cur = await applyCondition(cur, s.condition, s.severity);
  return cur as HTMLCanvasElement;
}
