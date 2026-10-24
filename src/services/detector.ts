import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import type { Detection } from "../types/experiment";

export const MODEL_NAME = "COCO-SSD (lite_mobilenet_v2)";
export const SCORE_THRESHOLD = 0.4; // same for every run
let model: cocoSsd.ObjectDetection | null = null;

export async function loadDetector() {
  if (!model) model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  return model;
}

export async function detect(input: HTMLImageElement | HTMLCanvasElement): Promise<Detection[]> {
  const m = await loadDetector();
  const preds = await m.detect(input, 50, SCORE_THRESHOLD);
  return preds.map((p, i) => ({
    id: `${p.class}-${i}`, className: p.class, score: p.score,
    box: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
  }));
}
