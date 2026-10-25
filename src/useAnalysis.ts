import { useMemo } from "react";
import { analyse } from "./services/analysis";
import type { AnalysisInput } from "./services/analysis";

export const useAnalysis = (i: AnalysisInput) =>
  // eslint-friendly: depend on the individual inputs, not the freshly built object
  useMemo(() => analyse(i), [i.title, i.modelLabel, i.settings, i.thresholds, i.baseline, i.points, i.combos, i.realWorld]); // oxlint-disable-line
