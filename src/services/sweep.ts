import { applyThresholds, detectAll } from "./detector";
import { applySteps } from "./transform";
import { classCounts, compare, summarize, toItems } from "./comparison";
import { expectedBaseline } from "./geometry";
import type { ComboResult, ConditionType, DetectSettings, Detection, Step, SweepPoint, Thresholds } from "../types/experiment";

export const CONDITIONS: ConditionType[] = [
  "brightness", "blur", "contrast", "occlusion", "noise", "rotation", "jpeg", "lowlight",
  "motionblur", "crop", "resize", "haze", "colorshift",
];
export const LEVELS = [0, 25, 50, 75, 100];

/** Modify the original, detect, and compare against the baseline objects we expect to still be there. */
export async function evaluate(img: HTMLImageElement, baseline: Detection[], settings: DetectSettings, thr: Thresholds, steps: Step[]) {
  const canvas = await applySteps(img, steps);
  const detections = applyThresholds(await detectAll(canvas, settings), thr);
  const expected = expectedBaseline(baseline, steps, img.naturalWidth, img.naturalHeight);
  const cmp = compare(expected, detections);
  return { canvas, detections, expected, cmp, metrics: summarize(cmp) };
}

const tick = () => new Promise((r) => setTimeout(r)); // let the UI repaint

/** Every variant is rendered from the original image; failures are recorded, never faked. */
export async function runStress(
  img: HTMLImageElement, baseline: Detection[], settings: DetectSettings, thr: Thresholds, conditions: ConditionType[],
  onPoint: (p: SweepPoint) => void, shouldStop: () => boolean,
) {
  for (const condition of conditions) {
    for (const severity of LEVELS) {
      if (shouldStop()) return;
      try {
        const r = await evaluate(img, baseline, settings, thr, [{ condition, severity }]);
        onPoint({ condition, severity, metrics: r.metrics, byClass: classCounts(r.cmp), items: toItems(r.cmp) });
      } catch (e) {
        onPoint({ condition, severity, metrics: null, error: (e as Error).message });
      }
      await tick();
    }
  }
}

export async function runCombos(
  img: HTMLImageElement, baseline: Detection[], settings: DetectSettings, thr: Thresholds, cases: Step[][],
  onResult: (r: ComboResult) => void, shouldStop: () => boolean,
) {
  for (const steps of cases) {
    if (shouldStop()) return;
    try {
      const r = await evaluate(img, baseline, settings, thr, steps);
      onResult({ steps, metrics: r.metrics, byClass: classCounts(r.cmp) });
    } catch (e) {
      onResult({ steps, metrics: null, error: (e as Error).message });
    }
    await tick();
  }
}
