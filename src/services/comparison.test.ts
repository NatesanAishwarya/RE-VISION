import { describe, expect, it } from "vitest";
import { compare, iou, summarize } from "./comparison";
import type { Detection } from "../types/experiment";

const d = (id: string, className: string, x: number, score = 0.9, w = 100): Detection =>
  ({ id, className, score, box: { x, y: 0, width: w, height: 100 } });

describe("iou", () => {
  it("is 1 for identical, 0 for disjoint, 1/3 for half overlap", () => {
    expect(iou(d("a", "x", 0).box, d("b", "x", 0).box)).toBe(1);
    expect(iou(d("a", "x", 0).box, d("b", "x", 500).box)).toBe(0);
    expect(iou(d("a", "x", 0).box, d("b", "x", 50).box)).toBeCloseTo(1 / 3);
  });
});

describe("compare", () => {
  it("retains, loses and adds", () => {
    const m = summarize(compare([d("1", "dog", 0), d("2", "cat", 300)], [d("3", "dog", 5, 0.7), d("4", "car", 700)]));
    expect([m.matchedCount, m.lostCount, m.newCount]).toEqual([1, 1, 1]);
    expect(m.retentionRate).toBe(0.5);
    expect(m.meanConfidenceDelta).toBeCloseTo(-0.2);
  });
  it("never matches one detection twice", () => {
    const r = compare([d("1", "dog", 0), d("2", "dog", 10)], [d("3", "dog", 5)]);
    expect(r.filter((x) => x.status === "retained")).toHaveLength(1);
    expect(r.filter((x) => x.status === "lost")).toHaveLength(1);
  });
  it("requires same class", () => {
    expect(compare([d("1", "dog", 0)], [d("2", "cat", 0)]).map((x) => x.status).sort()).toEqual(["lost", "new"]);
  });
  it("flags localization change", () => {
    const r = compare([d("1", "dog", 0)], [d("2", "dog", 30)]);
    expect(r[0].status).toBe("retained");
    expect(r[0].localizationChanged).toBe(true);
  });
  it("reports N/A with no baseline or matches", () => {
    const m = summarize(compare([], [d("1", "dog", 0)]));
    expect(m.retentionRate).toBeNull();
    expect(m.meanConfidenceDelta).toBeNull();
  });
});
