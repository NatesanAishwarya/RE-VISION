import { describe, expect, it } from "vitest";
import { mergeDetections } from "./nms";
import { makeTiles, touchesInteriorEdge, MAX_TILES } from "./tiles";
import { areaUnderCurve, pointQuality, robustness } from "./robustness";
import { classBreakdown } from "./breakdown";
import { classCounts, compare } from "./comparison";
import { parseQueries } from "./queries";
import type { ConditionType, Detection, Metrics, SweepPoint } from "../types/experiment";

const det = (className: string, x: number, y: number, w: number, h: number, score = 0.9): Detection =>
  ({ id: "", className, score, box: { x, y, width: w, height: h } });

describe("tiles", () => {
  it("covers every pixel and stays under the cap", () => {
    for (const [w, h] of [[4000, 3000], [1200, 800], [300, 300], [200, 5000], [8000, 8000]]) {
      const tiles = makeTiles(w, h);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
      expect(Math.min(...tiles.map((t) => t.x))).toBe(0);
      expect(Math.max(...tiles.map((t) => t.x + t.w))).toBe(w);
      expect(Math.max(...tiles.map((t) => t.y + t.h))).toBe(h);
      // neighbouring tiles must overlap so an object is whole in at least one of them
      const xs = [...new Set(tiles.map((t) => t.x))].sort((a, b) => a - b);
      xs.slice(1).forEach((x, i) => expect(x).toBeLessThan(xs[i] + tiles[0].w));
    }
  });
  it("uses one tile for an image smaller than a tile", () => {
    expect(makeTiles(250, 200)).toEqual([{ x: 0, y: 0, w: 250, h: 200 }]);
  });
  it("flags only boxes cut by an interior tile edge", () => {
    const tile = { x: 300, y: 0, w: 400, h: 400 };
    expect(touchesInteriorEdge({ x: 0, y: 50, width: 80, height: 100 }, tile, 1000, 400)).toBe(true); // left edge is interior
    expect(touchesInteriorEdge({ x: 100, y: 0, width: 80, height: 100 }, tile, 1000, 400)).toBe(false); // top edge IS the image edge
    expect(touchesInteriorEdge({ x: 100, y: 300, width: 80, height: 100 }, tile, 1000, 400)).toBe(false); // bottom is image edge
    expect(touchesInteriorEdge({ x: 320, y: 50, width: 80, height: 100 }, tile, 1000, 400)).toBe(true); // right edge is interior
  });
});

describe("mergeDetections", () => {
  it("keeps the higher-scoring duplicate", () => {
    const r = mergeDetections([det("person", 0, 0, 100, 200, 0.6), det("person", 5, 5, 100, 200, 0.9)]);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(0.9);
  });
  it("drops a fragment contained in a bigger box of the same class only", () => {
    expect(mergeDetections([det("person", 0, 0, 100, 200), det("person", 0, 0, 100, 90, 0.7)])).toHaveLength(1);
    expect(mergeDetections([det("person", 0, 0, 100, 200), det("dog", 0, 0, 100, 90, 0.7)])).toHaveLength(2);
  });
  it("keeps neighbouring people", () => {
    expect(mergeDetections([det("person", 0, 0, 100, 200), det("person", 110, 0, 100, 200), det("person", 220, 0, 100, 200)])).toHaveLength(3);
  });
});

const metrics = (retention: number | null, meanIoU: number | null): Metrics => ({
  baselineCount: 4, modifiedCount: 4, matchedCount: 0, lostCount: 0, newCount: 0,
  retentionRate: retention, meanConfidenceDelta: null, meanIoU, localizationChangedCount: 0,
});
const pt = (condition: ConditionType, severity: number, retention: number | null, iouV: number | null, byClass?: SweepPoint["byClass"]): SweepPoint =>
  ({ condition, severity, metrics: metrics(retention, iouV), byClass });

describe("robustness", () => {
  it("integrates a curve", () => {
    expect(areaUnderCurve([0, 100], [1, 1])).toBe(1);
    expect(areaUnderCurve([0, 100], [1, 0])).toBeCloseTo(0.5);
    expect(areaUnderCurve([0], [1])).toBeNull();
  });
  it("scores a perfect detector 100 and a total failure 0", () => {
    const perfect = [0, 25, 50, 75, 100].map((s) => pt("blur", s, 1, 1));
    expect(robustness(perfect, ["blur"]).overall).toBeCloseTo(100);
    const dead = [0, 25, 50, 75, 100].map((s) => pt("blur", s, 0, null));
    expect(robustness(dead, ["blur"]).overall).toBe(0);
  });
  it("is N/A, not 0, when there is no baseline", () => {
    const none = [0, 50, 100].map((s) => pt("blur", s, null, null));
    expect(pointQuality(none[0])).toBeNull();
    expect(robustness(none, ["blur"]).overall).toBeNull();
  });
  it("finds the weakest condition and break severity", () => {
    const pts = [
      ...[0, 25, 50, 75, 100].map((s) => pt("blur", s, 1, 1)),
      ...[[0, 1], [25, 0.8], [50, 0.4], [75, 0.2], [100, 0]].map(([s, r]) => pt("noise", s, r, r ? 0.9 : null)),
    ];
    const r = robustness(pts, ["blur", "noise"]);
    expect(r.weakest).toBe("noise");
    expect(r.perCondition.find((c) => c.condition === "noise")!.breakSeverity).toBe(50);
    expect(r.perCondition.find((c) => c.condition === "blur")!.breakSeverity).toBeNull();
  });
  it("ignores failed runs", () => {
    const pts: SweepPoint[] = [pt("blur", 0, 1, 1), { condition: "blur", severity: 50, metrics: null, error: "boom" }, pt("blur", 100, 1, 1)];
    expect(robustness(pts, ["blur"]).overall).toBeCloseTo(100);
  });
});

describe("class breakdown", () => {
  it("counts baseline and retained per class", () => {
    const c = compare([det("person", 0, 0, 100, 100), det("person", 300, 0, 100, 100), det("book", 600, 0, 100, 100)], [det("person", 2, 0, 100, 100)]);
    expect(classCounts(c)).toEqual({ person: { baseline: 2, retained: 1 }, book: { baseline: 1, retained: 0 } });
  });
  it("ranks the most fragile class first and reports where it fails", () => {
    const mk = (severity: number, person: number, book: number) =>
      pt("blur", severity, 1, 1, { person: { baseline: 2, retained: person }, book: { baseline: 1, retained: book } });
    const rows = classBreakdown([mk(0, 2, 1), mk(25, 2, 0), mk(50, 1, 0), mk(100, 0, 0)]);
    expect(rows.map((r) => r.className)).toEqual(["book", "person"]);
    expect(rows[0].firstFail).toEqual({ condition: "blur", severity: 25 });
    expect(rows[1].firstFail).toEqual({ condition: "blur", severity: 100 }); // 1/2 at severity 50 is not below 50%
    expect(rows[0].retention).toBe(0);
    expect(rows[1].retention).toBeCloseTo(3 / 6);
  });
  it("excludes severity 0 and old runs without byClass", () => {
    expect(classBreakdown([pt("blur", 0, 1, 1), pt("blur", 50, 1, 1)])).toEqual([]);
  });
});

describe("parseQueries", () => {
  it("splits, trims, dedupes and caps", () => {
    expect(parseQueries(" rupee note, helmet ,, rupee note ")).toEqual(["rupee note", "helmet"]);
    expect(parseQueries("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
    expect(parseQueries("  ")).toEqual([]);
  });
});
