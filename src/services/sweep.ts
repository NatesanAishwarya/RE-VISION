import { detect } from "./detector";
import { applyCondition } from "./transform";
import { compare, summarize } from "./comparison";
import type { ConditionType, Detection, SweepPoint } from "../types/experiment";

export const CONDITIONS: ConditionType[] = ["brightness", "blur", "contrast", "occlusion"];
export const LEVELS = [0, 25, 50, 75, 100];

/** Every variant is rendered from the original image; failures are recorded, never faked. */
export async function runStress(
  img: HTMLImageElement, baseline: Detection[], onPoint: (p: SweepPoint) => void, shouldStop: () => boolean,
) {
  for (const condition of CONDITIONS) {
    for (const severity of LEVELS) {
      if (shouldStop()) return;
      try {
        const d = await detect(applyCondition(img, condition, severity));
        onPoint({ condition, severity, metrics: summarize(compare(baseline, d)) });
      } catch (e) {
        onPoint({ condition, severity, metrics: null, error: (e as Error).message });
      }
      await new Promise((r) => setTimeout(r)); // let the UI repaint
    }
  }
}
