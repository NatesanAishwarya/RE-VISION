import type { ClassCounts, ComboResult, Detection, ExperimentData, RealWorldResult, SweepPoint } from "../types/experiment";
import type { Robustness } from "./robustness";
import { grade } from "./robustness";
import type { ClassRow } from "./breakdown";
import type { Failure, FailureKind, ObjectReport } from "./failures";
import { KIND_LABEL, failureMix } from "./failures";
import { CONDITION_LABEL, stepsText } from "./transform";
import { rankCombos } from "./combos";

const pct = (v: number | null, d = 0) => (v === null ? "N/A" : `${(v * 100).toFixed(d)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type ScoreExplanation = {
  /** The two things the score multiplies: how many objects survive, and how well their boxes stay put. */
  retention: number | null; localization: number | null;
  mix: Record<FailureKind, number>; lines: string[];
};

export function explainScore(robust: Robustness, points: SweepPoint[], failures: Failure[], objects: ObjectReport[]): ScoreExplanation {
  const used = points.filter((p) => p.severity > 0 && p.metrics);
  const retention = mean(used.flatMap((p) => (p.metrics!.retentionRate === null ? [] : [p.metrics!.retentionRate])));
  const localization = mean(used.flatMap((p) => (p.metrics!.meanIoU === null ? [] : [p.metrics!.meanIoU])));
  const mix = failureMix(failures), total = Object.values(mix).reduce((a, b) => a + b, 0);
  const lines: string[] = [];
  if (robust.overall === null) {
    lines.push("There is no score because the baseline found no objects, so there was nothing to lose.");
    return { retention, localization, mix, lines };
  }
  lines.push(`The score multiplies two things: how many baseline objects survive each change (${pct(retention)} on average) and how well their boxes stay in place (average overlap ${localization === null ? "N/A" : localization.toFixed(2)}).`);
  const scored = robust.perCondition.filter((c) => c.score !== null).sort((a, b) => a.score! - b.score!);
  if (scored.length >= 2) {
    const w = scored[0], s = scored[scored.length - 1];
    lines.push(`Weakest: ${CONDITION_LABEL[w.condition]} (${w.score!.toFixed(0)}/100)${w.breakSeverity !== null ? `, where more than half the objects are gone by severity ${w.breakSeverity}` : ""}. Strongest: ${CONDITION_LABEL[s.condition]} (${s.score!.toFixed(0)}/100).`);
  }
  if (total > 0) {
    const top = (Object.entries(mix) as [FailureKind, number][]).sort((a, b) => b[1] - a[1])[0];
    lines.push(`Of ${total} individual failures, ${(Object.entries(mix) as [FailureKind, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`).join(", ")}. The most common failure is "${KIND_LABEL[top[0]].toLowerCase()}".`);
  } else lines.push("No individual failures were recorded, so every object survived every change.");
  const weakObj = objects[0];
  if (weakObj && weakObj.missed > 0) lines.push(`The most fragile object is the ${weakObj.className} detected at ${pct(weakObj.baseScore)} confidence; it was missed in ${weakObj.missed} of ${weakObj.runs} runs.`);
  return { retention, localization, mix, lines };
}

export type SummaryInput = {
  title: string; modelLabel: string; settings: ExperimentData["settings"]; thresholds: ExperimentData["thresholds"];
  baseline: Detection[]; points: SweepPoint[]; combos?: ComboResult[]; robust: Robustness; classes: ClassRow[];
  failures: Failure[]; objects: ObjectReport[]; realWorld?: RealWorldResult;
};

/** A plain-language summary of the whole experiment. Deterministic: the same data always gives the same text. */
export function autoSummary(i: SummaryInput): string[] {
  const out: string[] = [];
  const conds = new Set(i.points.map((p) => p.condition)), levels = new Set(i.points.map((p) => p.severity));
  out.push(`${i.modelLabel}${i.settings.tiled ? " in tiled mode" : ""} was tested on ${i.title} (confidence at least ${i.thresholds.conf.toFixed(2)}). The unmodified image gave ${i.baseline.length} detection${i.baseline.length === 1 ? "" : "s"}${i.points.length ? `, then ${i.points.length} modified versions were run (${conds.size} condition${conds.size === 1 ? "" : "s"} at ${levels.size} severity levels)` : ""}.`);
  if (i.points.length) {
    const ex = explainScore(i.robust, i.points, i.failures, i.objects);
    out.push(i.robust.overall === null
      ? "No robustness score could be computed because nothing was detected in the baseline."
      : `Robustness score ${Math.round(i.robust.overall)} out of 100, rated "${grade(i.robust.overall).toLowerCase()}". ${ex.lines.slice(1, 3).join(" ")}`);
    const hard = i.classes[0];
    if (hard && hard.retention !== null) out.push(`The least robust object type is ${hard.className}: ${pct(hard.retention)} of its baseline detections survive on average${hard.firstFail ? `, first dropping below half under ${CONDITION_LABEL[hard.firstFail.condition].toLowerCase()} at severity ${hard.firstFail.severity}` : ""}.`);
  }
  const worst = rankCombos(i.combos ?? [])[0];
  if (worst && worst.metrics) out.push(`Combined changes were also tested (${i.combos!.length} cases). The hardest was ${stepsText(worst.steps)}, which kept ${pct(worst.metrics.retentionRate)} of the objects.`);
  if (i.realWorld) out.push(i.realWorld.note);
  out.push("Scores describe this image and these settings only. They are model confidence and overlap, not accuracy against ground truth.");
  return out;
}

/** For comparing two experiments in plain words. */
export function compareVerdict(a: { label: string; robust: Robustness }, b: { label: string; robust: Robustness }): string[] {
  const out: string[] = [];
  const oa = a.robust.overall, ob = b.robust.overall;
  if (oa === null || ob === null) return ["At least one experiment has no score (no baseline detections), so they cannot be ranked."];
  const d = ob - oa;
  out.push(Math.abs(d) < 3 ? `${a.label} and ${b.label} are about equally robust overall (${oa.toFixed(0)} and ${ob.toFixed(0)}).` : `${d > 0 ? b.label : a.label} is more robust overall, ${Math.max(oa, ob).toFixed(0)} against ${Math.min(oa, ob).toFixed(0)}.`);
  const aw: string[] = [], bw: string[] = [];
  for (const ca of a.robust.perCondition) {
    const cb = b.robust.perCondition.find((c) => c.condition === ca.condition);
    if (!cb || ca.score === null || cb.score === null || Math.abs(ca.score - cb.score) < 8) continue;
    (ca.score > cb.score ? aw : bw).push(CONDITION_LABEL[ca.condition].toLowerCase());
  }
  if (aw.length) out.push(`${a.label} holds up better under ${aw.join(", ")}.`);
  if (bw.length) out.push(`${b.label} holds up better under ${bw.join(", ")}.`);
  if (!aw.length && !bw.length) out.push("No single condition separates them by more than 8 points.");
  return out;
}

export const classTotals = (c?: ClassCounts) => Object.values(c ?? {}).reduce((s, x) => s + x.baseline, 0);
