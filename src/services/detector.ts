import "@tensorflow/tfjs";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import type { DetectSettings, Detection, ModelId, Thresholds } from "../types/experiment";
import { mergeDetections } from "./nms";
import { MODELS } from "./models";
import type { ModelInfo } from "./models";
import { makeTiles, touchesInteriorEdge } from "./tiles";

export const MAX_BOXES = 100;
export const DEFAULT_SETTINGS: DetectSettings = { model: "coco-mnv2", tiled: false, queries: [] };
export const defaultThresholds = (m: ModelId): Thresholds => ({ conf: MODELS[m].default });
export type Source = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
export type Progress = (pct: number) => void;

type HfRaw = { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } };
type HfRunner = (url: string, queries: string[], floor: number) => Promise<HfRaw[]>;

const coco = new Map<ModelId, Promise<cocoSsd.ObjectDetection>>();
const hf = new Map<ModelId, Promise<HfRunner>>();

function getCoco(info: ModelInfo) {
  let p = coco.get(info.id);
  if (!p) { p = cocoSsd.load({ base: info.base }); coco.set(info.id, p); p.catch(() => coco.delete(info.id)); }
  return p;
}

function getHf(info: ModelInfo, onProgress?: Progress) {
  let p = hf.get(info.id);
  if (!p) {
    const open = info.kind === "open";
    p = import("@huggingface/transformers").then(async ({ pipeline }) => {
      const make = (dtype?: string) =>
        (pipeline as unknown as (t: string, id: string, o: object) => Promise<unknown>)(
          open ? "zero-shot-object-detection" : "object-detection", info.hfId!,
          { ...(dtype ? { dtype } : {}), progress_callback: (e: { status?: string; progress?: number }) => { if (e.status === "progress" && typeof e.progress === "number") onProgress?.(e.progress); } },
        );
      let pipe: unknown;
      try { pipe = await make("q8"); } catch { pipe = await make(); } // some repos lack a quantised file
      const fn = pipe as (...a: unknown[]) => Promise<HfRaw[]>;
      return ((url, queries, floor) => (open ? fn(url, queries, { threshold: floor, top_k: 60 }) : fn(url, { threshold: floor }))) as HfRunner;
    });
    hf.set(info.id, p); p.catch(() => hf.delete(info.id));
  }
  return p;
}

/** Download and warm a model. Safe to call repeatedly. */
export async function loadModel(id: ModelId, onProgress?: Progress): Promise<void> {
  const info = MODELS[id];
  if (info.lib === "coco") await getCoco(info); else await getHf(info, onProgress);
}
export const tfBackend = () => tf.getBackend() ?? "unknown";

const sizeOf = (s: Source) =>
  s instanceof HTMLImageElement ? { w: s.naturalWidth, h: s.naturalHeight }
  : s instanceof HTMLVideoElement ? { w: s.videoWidth, h: s.videoHeight }
  : { w: s.width, h: s.height };

const HF_MAX_SIDE = 1280; // these models resize internally; do not ship huge images

async function detectHf(info: ModelInfo, input: Source, queries: string[]): Promise<Detection[]> {
  if (info.kind === "open" && !queries.length) return [];
  const run = await getHf(info);
  const { w, h } = sizeOf(input);
  const k = Math.min(1, HF_MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(input, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not prepare the image for this model.");
  const url = URL.createObjectURL(blob);
  try {
    const res = await run(url, queries, info.floor);
    const dets: Detection[] = res.map((r) => ({
      id: "", className: r.label, score: r.score,
      box: { x: Math.max(0, r.box.xmin / k), y: Math.max(0, r.box.ymin / k), width: Math.min(w, (r.box.xmax - r.box.xmin) / k), height: Math.min(h, (r.box.ymax - r.box.ymin) / k) },
    }));
    return info.kind === "open" ? mergeDetections(dets, 0.3) : dets; // OWL-ViT emits many overlapping boxes per object
  } finally { URL.revokeObjectURL(url); }
}

/** One model, one image, no tiling. Scores are kept down to the model's floor. */
export async function detectOne(id: ModelId, input: Source, queries: string[] = []): Promise<Detection[]> {
  const info = MODELS[id];
  if (info.lib === "hf") return detectHf(info, input, queries);
  const m = await getCoco(info);
  return (await m.detect(input, MAX_BOXES, info.floor)).map((p) => ({
    id: "", className: p.class, score: p.score, box: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
  }));
}

/** One pass over the whole image, plus (if tiled) a pass over every overlapping tile, merged with NMS. */
export async function detectModel(id: ModelId, input: Source, tiled: boolean, queries: string[] = []): Promise<Detection[]> {
  const whole = await detectOne(id, input, queries);
  let all = whole;
  if (tiled && !(input instanceof HTMLVideoElement)) {
    const { w, h } = sizeOf(input);
    all = [...whole];
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    for (const t of makeTiles(w, h)) {
      c.width = t.w; c.height = t.h;
      ctx.drawImage(input, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
      for (const d of await detectOne(id, c, queries)) {
        // A box cut by an inner tile edge is a fragment: the neighbouring tile sees the whole object.
        if (!touchesInteriorEdge(d.box, t, w, h)) all.push({ ...d, box: { ...d.box, x: d.box.x + t.x, y: d.box.y + t.y } });
      }
      await new Promise((r) => setTimeout(r)); // keep the UI responsive between tiles
    }
    all = mergeDetections(all);
  }
  return all.map((d, i) => ({ ...d, id: `${d.className}-${i}` }));
}

export const detectAll = (input: HTMLImageElement | HTMLCanvasElement, s: DetectSettings) => detectModel(s.model, input, s.tiled, s.queries);
export const applyThresholds = (ds: Detection[], t: Thresholds): Detection[] => ds.filter((d) => d.score >= t.conf);
export const settingsKey = (s: DetectSettings) => JSON.stringify([s.model, s.tiled, s.queries]);
export const settingsLabel = (s: DetectSettings) => `${MODELS[s.model].label}${s.tiled ? ", tiled" : ""}${s.queries.length ? `: ${s.queries.join(", ")}` : ""}`;
