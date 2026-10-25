import { describe, expect, it } from "vitest";
import { expectedBaseline, mapBox } from "./geometry";
import { COMBO_LEVELS, caseKey, generateCases, rankCombos } from "./combos";
import { deriveFailures, failureMix, objectReports, pickGalleryCandidates } from "./failures";
import { closestSeverity, countRetention } from "./realworld";
import { verifyReproduction } from "./repro";
import { analyse } from "./analysis";
import { compareVerdict } from "./explain";
import { robustness } from "./robustness";
import { classCounts, compare, toItems, summarize } from "./comparison";
import { describeMapping, stepsText } from "./transform";
import { CONDITIONS } from "./sweep";
import { MODEL_LIST, MODELS } from "./models";
import type { ComboResult, ConditionType, Detection, Metrics, SweepPoint } from "../types/experiment";

const det = (id: string, className: string, x: number, y: number, w = 100, h = 100, score = 0.9): Detection => ({ id, className, score, box: { x, y, width: w, height: h } });
const metrics = (ret: number | null, iouV: number | null, base = 2): Metrics => ({ baselineCount: base, modifiedCount: base, matchedCount: 0, lostCount: 0, newCount: 0, retentionRate: ret, meanConfidenceDelta: null, meanIoU: iouV, localizationChangedCount: 0 });

describe("models", () => {
  it("offers five models, exactly one open-vocabulary", () => {
    expect(MODEL_LIST).toHaveLength(5);
    expect(MODEL_LIST.filter((m) => m.kind === "open").map((m) => m.id)).toEqual(["owl-vit"]);
    for (const m of MODEL_LIST) { expect(m.default).toBeGreaterThanOrEqual(m.min); expect(m.default).toBeLessThanOrEqual(m.max); expect(m.floor).toBeLessThanOrEqual(m.min); }
    expect(MODELS["coco-lite"].base).toBe("lite_mobilenet_v2");
  });
});

describe("transform catalogue", () => {
  it("describes every condition, and severity 0 is always the untouched image", () => {
    expect(CONDITIONS).toHaveLength(13);
    for (const c of CONDITIONS) expect(typeof describeMapping[c](50)).toBe("string");
    expect(stepsText([{ condition: "blur", severity: 40 }, { condition: "lowlight", severity: 60 }])).toBe("Blur 40 + Low light 60");
  });
});

describe("geometry: where do expected objects land?", () => {
  const box = { x: 100, y: 100, width: 100, height: 100 };
  it("leaves non-geometric steps alone", () => {
    expect(mapBox(box, { condition: "blur", severity: 80 }, 1000, 800)).toEqual(box);
  });
  it("rotating by 0 changes nothing, and a centred box stays centred when rotated", () => {
    expect(mapBox(box, { condition: "rotation", severity: 0 }, 400, 400)).toEqual(box);
    const centred = { x: 150, y: 150, width: 100, height: 100 };
    const r = mapBox(centred, { condition: "rotation", severity: 100 }, 400, 400)!; // 45 degrees
    expect(r.x + r.width / 2).toBeCloseTo(200, 3);
    expect(r.y + r.height / 2).toBeCloseTo(200, 3);
    expect(r.width).toBeCloseTo(100 * Math.SQRT2, 3); // a square rotated 45 degrees has a bounding box sqrt(2) wider
  });
  it("crop scales boxes up about the centre and drops objects that leave the frame", () => {
    const c = mapBox({ x: 150, y: 150, width: 100, height: 100 }, { condition: "crop", severity: 100 }, 400, 400)!; // keeps 40%
    expect(c.width).toBeCloseTo(250, 3);
    expect(mapBox({ x: 0, y: 0, width: 40, height: 40 }, { condition: "crop", severity: 100 }, 400, 400)).toBeNull(); // corner is cropped away
  });
  it("expectedBaseline keeps ids, drops vanished objects, and is the identity for photometric steps", () => {
    const base = [det("a", "person", 150, 150), det("b", "person", 0, 0, 40, 40)];
    expect(expectedBaseline(base, [{ condition: "noise", severity: 90 }], 400, 400)).toEqual(base);
    const e = expectedBaseline(base, [{ condition: "crop", severity: 100 }], 400, 400);
    expect(e.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("combinations", () => {
  it("makes every pair at every level, and is deterministic when capped", () => {
    const all = generateCases(["blur", "noise", "haze"], 2, COMBO_LEVELS, 1000);
    expect(all).toHaveLength(3 * 9); // 3 pairs x 3 x 3 levels
    expect(new Set(all.map(caseKey)).size).toBe(all.length);
    const a = generateCases(["blur", "noise", "haze", "crop"], 2, COMBO_LEVELS, 10), b = generateCases(["blur", "noise", "haze", "crop"], 2, COMBO_LEVELS, 10);
    expect(a).toHaveLength(10);
    expect(a.map(caseKey)).toEqual(b.map(caseKey));
  });
  it("makes triples and respects the order conditions were given in", () => {
    const t = generateCases(["blur", "noise", "haze", "crop"] as ConditionType[], 3, [50], 1000);
    expect(t).toHaveLength(4);
    expect(t[0].map((s) => s.condition)).toEqual(["blur", "noise", "haze"]);
    expect(generateCases(["blur"], 2, COMBO_LEVELS, 10)).toEqual([]);
  });
  it("ranks the hardest case first and leaves failed ones out", () => {
    const rs: ComboResult[] = [
      { steps: [{ condition: "blur", severity: 30 }], metrics: metrics(1, 1) },
      { steps: [{ condition: "blur", severity: 90 }], metrics: metrics(0.2, 0.5) },
      { steps: [{ condition: "blur", severity: 60 }], metrics: null, error: "boom" },
      { steps: [{ condition: "noise", severity: 60 }], metrics: metrics(null, null, 0) },
    ];
    expect(rankCombos(rs).map((r) => caseKey(r.steps))).toEqual(["blur:90", "blur:30", "noise:60"]); // hardest first, undefined last, failed omitted
  });
});

describe("object-level failures", () => {
  const baseline = [det("person-0", "person", 10, 10, 100, 200, 0.9), det("dog-1", "dog", 300, 10, 80, 80, 0.8)];
  const ex = (expected: Detection[], found: Detection[]) => { const c = compare(expected, found); return { items: toItems(c), cmp: c }; };
  const run = (condition: ConditionType, severity: number, found: Detection[]): SweepPoint => {
    const { items, cmp } = ex(baseline, found);
    return { condition, severity, metrics: summarize(cmp), byClass: classCounts(cmp), items };
  };
  const points = [
    run("blur", 0, baseline),
    run("blur", 25, [det("x", "person", 12, 10, 100, 200, 0.5), det("y", "dog", 300, 10, 80, 80, 0.78)]), // person loses confidence
    run("blur", 50, [det("x", "person", 35, 10, 100, 200, 0.85)]), // dog lost; person still matched (IoU 0.6) but shifted 25 px
    run("noise", 75, [det("z", "cat", 600, 600, 50, 50, 0.7)]), // everything lost, one false detection
  ];
  it("classifies each kind and ignores severity 0", () => {
    const f = deriveFailures(baseline, points);
    const mix = failureMix(f);
    expect(mix.missed).toBe(1 + 2); // dog at blur 50, both at noise 75
    expect(mix.confidence_drop).toBe(1);
    expect(mix.shifted).toBe(1);
    expect(mix.false_positive).toBe(1);
    expect(f.every((x) => x.severity > 0)).toBe(true);
    const drop = f.find((x) => x.kind === "confidence_drop")!;
    expect(drop.delta).toBeCloseTo(-0.4, 2);
    expect(f.find((x) => x.kind === "shifted")!.shiftPx).toBeCloseTo(25, 0);
    expect(f.find((x) => x.kind === "shifted")!.iou).toBeCloseTo(0.6, 2);
  });
  it("reports per object: how often missed and where it first failed", () => {
    const rows = objectReports(baseline, points);
    const dog = rows.find((r) => r.bid === "dog-1")!;
    expect(dog.runs).toBe(3);
    expect(dog.missed).toBe(2);
    expect(dog.firstMiss).toEqual({ condition: "blur", severity: 50 });
    expect(rows[0].bid).toBe("dog-1"); // most fragile first
    const person = rows.find((r) => r.bid === "person-0")!;
    expect(person.worstDrop!.delta).toBeCloseTo(-0.4, 2);
  });
  it("picks a varied handful for the gallery, one per object and kind", () => {
    const picks = pickGalleryCandidates(deriveFailures(baseline, points), 4);
    const missed = picks.filter((p) => p.kind === "missed");
    expect(new Set(missed.map((m) => m.bid)).size).toBe(missed.length);
    expect(missed[0].severity).toBe(50); // dies earliest = most dramatic
    expect(new Set(picks.map((p) => p.kind)).size).toBe(4);
  });
  it("copes with experiments saved without per-object detail", () => {
    expect(deriveFailures(baseline, [{ condition: "blur", severity: 50, metrics: metrics(1, 1) }])).toEqual([]);
  });
});

describe("real-world comparison", () => {
  const base = [det("a", "person", 0, 0), det("b", "person", 0, 0), det("c", "dog", 0, 0)];
  it("counts per class without needing box overlap", () => {
    expect(countRetention(base, base)).toBe(1);
    expect(countRetention(base, [det("x", "person", 500, 500)])).toBeCloseTo(1 / 3);
    expect(countRetention(base, [det("x", "person", 0, 0), det("y", "person", 0, 0), det("z", "person", 0, 0), det("w", "cat", 0, 0)])).toBeCloseTo(2 / 3); // extra people do not earn credit
    expect(countRetention([], base)).toBeNull();
  });
  it("finds the closest simulated severity, preferring the milder one on a tie", () => {
    const sim = [0, 25, 50, 75, 100].map((severity, i) => ({ severity, countRetention: [1, 0.9, 0.6, 0.3, 0][i] }));
    expect(closestSeverity(0.58, sim)).toBe(50);
    expect(closestSeverity(0.75, sim)).toBe(25); // equidistant from 0.9? no: 0.15 vs 0.15 -> milder wins
    expect(closestSeverity(null, sim)).toBeNull();
  });
});

describe("reproducibility check", () => {
  const pts = (r: number): SweepPoint[] => [0, 50, 100].map((s) => ({ condition: "blur", severity: s, metrics: metrics(r, 0.9) }));
  it("says identical, close or different", () => {
    expect(verifyReproduction(pts(0.8), pts(0.8)).verdict).toBe("identical");
    const close = verifyReproduction(pts(0.8), pts(0.81));
    expect(close.verdict).toBe("close");
    expect(close.maxDiff).toBeCloseTo(0.01, 5);
    expect(verifyReproduction(pts(0.8), pts(0.4)).verdict).toBe("different");
  });
  it("treats a changed baseline count as different, and nothing comparable as different", () => {
    const changed = pts(0.8).map((p) => ({ ...p, metrics: { ...p.metrics!, baselineCount: 9 } }));
    expect(verifyReproduction(pts(0.8), changed).verdict).toBe("different");
    expect(verifyReproduction([], pts(0.8)).verdict).toBe("different");
  });
});

describe("explanations and summaries", () => {
  const baseline = [det("p-0", "person", 0, 0), det("p-1", "person", 200, 0)];
  const mk = (condition: ConditionType, severity: number, found: Detection[]): SweepPoint => { const c = compare(baseline, found); return { condition, severity, metrics: summarize(c), byClass: classCounts(c), items: toItems(c) }; };
  const points = [0, 50, 100].flatMap((s) => [mk("blur", s, s < 100 ? baseline : []), mk("noise", s, s === 0 ? baseline : [])]);
  const a = analyse({ title: "crowd.jpg", modelLabel: "COCO-SSD MobileNetV2", settings: { model: "coco-mnv2", tiled: false, queries: [] }, thresholds: { conf: 0.4 }, baseline, points });
  it("explains the score in terms of its parts and names the weakest condition", () => {
    expect(a.robust.weakest).toBe("noise");
    const text = a.explanation.lines.join(" ");
    expect(text).toMatch(/multiplies two things/);
    expect(text).toMatch(/Weakest: Noise/);
    expect(a.explanation.mix.missed).toBeGreaterThan(0);
  });
  it("writes a deterministic summary that states its limits", () => {
    const again = analyse({ title: "crowd.jpg", modelLabel: "COCO-SSD MobileNetV2", settings: { model: "coco-mnv2", tiled: false, queries: [] }, thresholds: { conf: 0.4 }, baseline, points });
    expect(again.summaryText).toEqual(a.summaryText);
    expect(a.summaryText[0]).toMatch(/crowd\.jpg/);
    expect(a.summaryText.join(" ")).toMatch(/Robustness score \d+ out of 100/);
    expect(a.summaryText.at(-1)).toMatch(/not accuracy/);
  });
  it("says so when there is nothing to score", () => {
    const empty = analyse({ title: "blank.jpg", modelLabel: "X", settings: { model: "coco-mnv2", tiled: false, queries: [] }, thresholds: { conf: 0.4 }, baseline: [], points: [{ condition: "blur", severity: 0, metrics: metrics(null, null, 0) }, { condition: "blur", severity: 50, metrics: metrics(null, null, 0) }] });
    expect(empty.robust.overall).toBeNull();
    expect(empty.explanation.lines[0]).toMatch(/no score/);
  });
  it("compares two experiments in words", () => {
    const strong = robustness([0, 50, 100].map((s) => ({ condition: "blur" as const, severity: s, metrics: metrics(1, 1) })));
    const weak = robustness([0, 50, 100].map((s) => ({ condition: "blur" as const, severity: s, metrics: metrics(s === 0 ? 1 : 0.2, 0.8) })));
    const v = compareVerdict({ label: "A", robust: weak }, { label: "B", robust: strong });
    expect(v[0]).toMatch(/B is more robust overall/);
    expect(v.join(" ")).toMatch(/B holds up better under blur/);
    expect(compareVerdict({ label: "A", robust: strong }, { label: "B", robust: strong })[0]).toMatch(/about equally robust/);
    expect(compareVerdict({ label: "A", robust: robustness([]) }, { label: "B", robust: strong })[0]).toMatch(/cannot be ranked/);
  });
});
