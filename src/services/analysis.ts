import type { ComboResult, DetectSettings, Detection, RealWorldResult, SweepPoint, Thresholds } from "../types/experiment";
import { classBreakdown } from "./breakdown";
import type { ClassRow } from "./breakdown";
import { autoSummary, explainScore } from "./explain";
import type { ScoreExplanation } from "./explain";
import { deriveFailures, objectReports, pickGalleryCandidates } from "./failures";
import type { Failure, ObjectReport } from "./failures";
import { robustness } from "./robustness";
import type { Robustness } from "./robustness";

export type Analysis = {
  robust: Robustness; classes: ClassRow[]; failures: Failure[]; objects: ObjectReport[];
  candidates: Failure[]; explanation: ScoreExplanation; summaryText: string[];
};

export type AnalysisInput = {
  title: string; modelLabel: string; settings: DetectSettings; thresholds: Thresholds;
  baseline: Detection[]; points: SweepPoint[]; combos?: ComboResult[]; realWorld?: RealWorldResult;
};

/** Everything derived from an experiment's raw results. Pure, so the same data always gives the same analysis. */
export function analyse(i: AnalysisInput): Analysis {
  const robust = robustness(i.points);
  const classes = classBreakdown(i.points);
  const failures = deriveFailures(i.baseline, i.points);
  const objects = objectReports(i.baseline, i.points);
  const explanation = explainScore(robust, i.points, failures, objects);
  const summaryText = autoSummary({ ...i, robust, classes, failures, objects });
  return { robust, classes, failures, objects, candidates: pickGalleryCandidates(failures), explanation, summaryText };
}
