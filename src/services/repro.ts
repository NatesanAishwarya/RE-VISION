import type { DetectSettings, ReproInfo, SweepPoint, Thresholds } from "../types/experiment";
import { IOU_MATCH, LOCALIZATION_IOU } from "./comparison";
import { CONDITIONS, LEVELS } from "./sweep";
import { COMBO_SEED } from "./combos";
import { MODELS } from "./models";
import { TILE_MAX, TILE_MIN, TILE_OVERLAP, MAX_TILES } from "./tiles";
import { NOISE_SEEDS, describeMapping } from "./transform";
import { tfBackend } from "./detector";

declare const __VERSIONS__: Record<string, string>;
const versions = (): Record<string, string> => (typeof __VERSIONS__ === "undefined" ? {} : __VERSIONS__);

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Everything that decides what an experiment produced, so it can be repeated or audited later. */
export function buildRepro(settings: DetectSettings, thresholds: Thresholds, imageHash: string, size: [number, number]): ReproInfo {
  const m = MODELS[settings.model], v = versions();
  return {
    appVersion: v.app ?? "dev", createdAt: new Date().toISOString(), modelId: m.id, modelLabel: m.label,
    modelSource: m.lib === "coco" ? `@tensorflow-models/coco-ssd, base ${m.base}` : `Hugging Face ${m.hfId} (via Transformers.js)`,
    libraries: v, tfBackend: tfBackend(), userAgent: navigator.userAgent,
    settings, thresholds, matchIoU: IOU_MATCH, localizationIoU: LOCALIZATION_IOU,
    tiling: { min: TILE_MIN, max: TILE_MAX, overlap: TILE_OVERLAP, maxTiles: MAX_TILES },
    imageHash, imageSize: size, levels: LEVELS,
    conditions: Object.fromEntries(CONDITIONS.map((c) => [c, LEVELS.map((s) => describeMapping[c](s))])),
    comboSeed: COMBO_SEED, noiseSeeds: NOISE_SEEDS,
  };
}

export type Verification = { compared: number; identical: number; maxDiff: number; missing: number; verdict: "identical" | "close" | "different" };

/** Compare a fresh run with a stored one, point by point, on retention and IoU. Tiny float drift is "close", not "different". */
export function verifyReproduction(stored: SweepPoint[], fresh: SweepPoint[], tolerance = 0.02): Verification {
  let compared = 0, identical = 0, maxDiff = 0, missing = 0;
  for (const f of fresh) {
    const s = stored.find((p) => p.condition === f.condition && p.severity === f.severity);
    if (!s || !s.metrics || !f.metrics) { missing++; continue; }
    compared++;
    const d = Math.max(
      Math.abs((s.metrics.retentionRate ?? 0) - (f.metrics.retentionRate ?? 0)),
      Math.abs((s.metrics.meanIoU ?? 0) - (f.metrics.meanIoU ?? 0)),
      s.metrics.baselineCount === f.metrics.baselineCount ? 0 : 1,
    );
    maxDiff = Math.max(maxDiff, d);
    if (d < 1e-9) identical++;
  }
  return { compared, identical, maxDiff, missing, verdict: compared === 0 || maxDiff > tolerance ? "different" : identical === compared ? "identical" : "close" };
}
