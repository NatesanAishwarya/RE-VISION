import type { ComboResult, ConditionType, Step } from "../types/experiment";
import { mulberry32 } from "./transform";

export const COMBO_SEED = 20260;
export const COMBO_LEVELS = [30, 60, 90];

const combinations = <T,>(xs: T[], k: number): T[][] =>
  k === 0 ? [[]] : xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
const product = (levels: number[], k: number): number[][] =>
  k === 0 ? [[]] : levels.flatMap((l) => product(levels, k - 1).map((rest) => [l, ...rest]));

/**
 * Every combination of `depth` different conditions at every severity level, capped at `cap`.
 * Over the cap, a seeded shuffle picks the sample, so the same inputs always give the same cases.
 * Steps always run in the order the conditions are listed in `conditions`.
 */
export function generateCases(conditions: ConditionType[], depth: 2 | 3, levels = COMBO_LEVELS, cap = 30, seed = COMBO_SEED): Step[][] {
  const cases: Step[][] = combinations(conditions, depth).flatMap((cs) =>
    product(levels, depth).map((ls) => cs.map((condition, i) => ({ condition, severity: ls[i] }))),
  );
  if (cases.length <= cap) return cases;
  const rnd = mulberry32(seed), idx = cases.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, cap).sort((a, b) => a - b).map((i) => cases[i]);
}

export const caseKey = (steps: Step[]) => steps.map((s) => `${s.condition}:${s.severity}`).join("+");
export const comboQuality = (r: ComboResult): number | null =>
  r.metrics && r.metrics.retentionRate !== null ? r.metrics.retentionRate * (r.metrics.meanIoU ?? 0) : null;

/** Worst first. Cases without a defined quality (no baseline) go last. */
export const rankCombos = (rs: ComboResult[]) =>
  [...rs].filter((r) => !r.error).sort((a, b) => (comboQuality(a) ?? 2) - (comboQuality(b) ?? 2));
