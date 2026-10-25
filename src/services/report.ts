import { drawDetections } from "./draw";
import { LEVELS } from "./sweep";
import { CONDITION_LABEL, stepsText } from "./transform";
import { grade, conditionsIn } from "./robustness";
import { rankCombos } from "./combos";
import type { Analysis } from "./analysis";
import { KIND_LABEL } from "./failures";
import type { ComboResult, Detection, Metrics, RealWorldResult, Step, SweepPoint } from "../types/experiment";

export type ReportInput = {
  title: string; owner?: string; settingsLine: string; reproLine: string;
  img: HTMLImageElement; baseline: Detection[]; dashed: boolean;
  modified: { canvas: HTMLCanvasElement; detections: Detection[]; steps: Step[]; metrics: Metrics | null } | null;
  points: SweepPoint[]; combos: ComboResult[]; realWorld?: RealWorldResult; analysis: Analysis;
};

const W = 1400, PAD = 44, INK = "#14232b", MUTED = "#4d626b", BLUE = "#0a64c9", PINK = "#c2185b", LINE = "#c9d3d8";
const FONT = "system-ui, 'Segoe UI', sans-serif";
const pct = (v: number | null) => (v === null ? "N/A" : `${Math.round(v * 100)}%`);

function annotated(src: HTMLImageElement | HTMLCanvasElement, ds: Detection[], color: string, dashed: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  c.height = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  drawDetections(ctx, c.width, ds, color, dashed);
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draws the whole report and returns its height. Run once on a scratch canvas to measure, then again for real. */
function layout(ctx: CanvasRenderingContext2D, r: ReportInput): number {
  let y = PAD;
  const text = (s: string, x: number, size: number, color = INK, weight = "400") => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.fillText(s, x, y);
  };
  const para = (s: string, size = 16, color = INK, gap = 8) => {
    ctx.font = `400 ${size}px ${FONT}`;
    for (const line of wrap(ctx, s, W - PAD * 2)) { text(line, PAD, size, color); y += size * 1.45; }
    y += gap;
  };
  const rule = () => { y += 8; ctx.fillStyle = LINE; ctx.fillRect(PAD, y, W - PAD * 2, 1); y += 22; };
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, 24000);

  text("RE:VISION stress-test report", PAD, 34, INK, "700"); y += 46;
  para(`${r.title}${r.owner ? `, saved by ${r.owner}` : ""}, ${new Date().toLocaleString()}`, 16, MUTED, 2);
  para(r.settingsLine, 14, MUTED, 2);
  para(r.reproLine, 13, MUTED, 14);

  // Plain-language summary
  text("Summary", PAD, 22, INK, "700"); y += 34;
  r.analysis.summaryText.forEach((p) => para(p, 16));

  // Image pair
  rule();
  const colW = (W - PAD * 2 - 24) / 2;
  const left = annotated(r.img, r.baseline, BLUE, r.dashed);
  const lh = (left.height / left.width) * colW;
  text(`Original: ${r.baseline.length} detections`, PAD, 16, BLUE, "600");
  if (r.modified) text(`${stepsText(r.modified.steps)}: ${r.modified.detections.length} detections`, PAD + colW + 24, 16, PINK, "600");
  y += 26;
  ctx.drawImage(left, PAD, y, colW, lh);
  let rowH = lh;
  if (r.modified) {
    const right = annotated(r.modified.canvas, r.modified.detections, PINK, r.dashed);
    const rh = (right.height / right.width) * colW;
    ctx.drawImage(right, PAD + colW + 24, y, colW, rh);
    rowH = Math.max(lh, rh);
  }
  y += rowH + 16;
  if (r.modified?.metrics) {
    const m = r.modified.metrics;
    para(`Single run: ${m.baselineCount} expected, ${m.modifiedCount} found; retained ${pct(m.retentionRate)}, lost ${m.lostCount}, new ${m.newCount}, mean IoU ${m.meanIoU === null ? "N/A" : m.meanIoU.toFixed(2)}.`, 15);
  }

  if (r.points.length) {
    const a = r.analysis, conds = conditionsIn(r.points);
    rule();
    text("Robustness score", PAD, 22, INK, "700"); y += 34;
    const o = a.robust.overall;
    text(o === null ? "N/A" : `${Math.round(o)} / 100`, PAD, 54, o === null ? MUTED : o >= 65 ? "#2e7d32" : o >= 40 ? "#e65100" : "#b3261e", "700");
    text(grade(o), PAD + 250, 26, INK, "600"); y += 70;
    a.explanation.lines.forEach((l) => para(l, 15, MUTED, 4));
    y += 6;
    for (const c of a.robust.perCondition) {
      text(CONDITION_LABEL[c.condition], PAD, 15, INK);
      ctx.fillStyle = "#e8edef"; ctx.fillRect(PAD + 190, y + 2, 600, 14);
      if (c.score !== null) { ctx.fillStyle = BLUE; ctx.fillRect(PAD + 190, y + 2, 6 * c.score, 14); }
      text(c.score === null ? "N/A" : c.score.toFixed(0), PAD + 805, 15, INK, "600");
      text(c.breakSeverity === null ? "never below 50% retention" : `below 50% retention from severity ${c.breakSeverity}`, PAD + 860, 14, MUTED);
      y += 26;
    }

    y += 14; text("Detection retention (matched ÷ expected)", PAD, 18, INK, "700"); y += 30;
    const cw = 110, lw = 190;
    LEVELS.forEach((s, i) => text(String(s), PAD + lw + i * cw + 40, 14, MUTED, "600"));
    y += 22;
    for (const cond of conds) {
      text(CONDITION_LABEL[cond], PAD, 15, INK);
      LEVELS.forEach((s, i) => {
        const p = r.points.find((q) => q.condition === cond && q.severity === s);
        const v = p?.metrics?.retentionRate ?? null;
        ctx.fillStyle = !p ? "#f3f6f7" : p.error ? "#f8d7da" : v === null ? "#eceff1" : `hsl(${Math.round(v * 140)} 60% 80%)`;
        ctx.fillRect(PAD + lw + i * cw, y - 3, cw - 6, 24);
        ctx.fillStyle = INK; ctx.font = `14px ${FONT}`; ctx.fillText(!p ? "—" : p.error ? "failed" : pct(v), PAD + lw + i * cw + 34, y + 1);
      });
      y += 28;
    }

    if (a.classes.length) {
      y += 16; text("Which object types fail first", PAD, 18, INK, "700"); y += 30;
      ["Class", "Baseline", "Retention", "First falls below 50%"].forEach((h, i) => text(h, PAD + [0, 220, 330, 460][i], 14, MUTED, "600"));
      y += 24;
      for (const c of a.classes.slice(0, 12)) {
        text(c.className, PAD, 15); text(String(c.baseline), PAD + 220, 15); text(pct(c.retention), PAD + 330, 15, INK, "600");
        text(c.firstFail ? `${CONDITION_LABEL[c.firstFail.condition]} at severity ${c.firstFail.severity}` : "never", PAD + 460, 15);
        y += 24;
      }
    }

    if (a.objects.length) {
      y += 16; text("Most fragile individual objects", PAD, 18, INK, "700"); y += 30;
      ["Object", "Confidence", "Missed in", "First missed under", "Worst confidence drop"].forEach((h, i) => text(h, PAD + [0, 220, 330, 450, 800][i], 14, MUTED, "600"));
      y += 24;
      for (const o2 of a.objects.slice(0, 10)) {
        text(`${o2.className} at ${Math.round(o2.box.x)},${Math.round(o2.box.y)}`, PAD, 15); text(pct(o2.baseScore), PAD + 220, 15);
        text(`${o2.missed} of ${o2.runs} runs`, PAD + 330, 15);
        text(o2.firstMiss ? `${CONDITION_LABEL[o2.firstMiss.condition]} ${o2.firstMiss.severity}` : "never", PAD + 450, 15);
        text(o2.worstDrop && o2.worstDrop.delta < 0 ? `${o2.worstDrop.delta.toFixed(2)} at ${CONDITION_LABEL[o2.worstDrop.condition]} ${o2.worstDrop.severity}` : "none", PAD + 800, 15);
        y += 24;
      }
    }
    const mix = a.explanation.mix;
    y += 10; para(`Failure counts: ${(Object.keys(mix) as (keyof typeof mix)[]).map((k) => `${KIND_LABEL[k].toLowerCase()} ${mix[k]}`).join(", ")}.`, 14, MUTED);
  }

  const ranked = rankCombos(r.combos);
  if (ranked.length) {
    rule(); text("Combined conditions, hardest first", PAD, 18, INK, "700"); y += 30;
    for (const c of ranked.slice(0, 8)) {
      text(stepsText(c.steps), PAD, 15); text(`retained ${pct(c.metrics?.retentionRate ?? null)}`, PAD + 640, 15, INK, "600");
      text(`mean IoU ${c.metrics?.meanIoU === null || !c.metrics ? "N/A" : c.metrics.meanIoU.toFixed(2)}`, PAD + 800, 15); y += 24;
    }
  }
  if (r.realWorld) { rule(); text("Real-world check", PAD, 18, INK, "700"); y += 30; para(r.realWorld.note, 15); }
  y += 20;
  para("Scores are model confidence and overlap, not accuracy against ground truth. Results apply to this image and these settings only. Severities are not comparable across different conditions.", 13, MUTED);
  return y + 24;
}

export function renderReport(r: ReportInput): HTMLCanvasElement {
  const scratch = document.createElement("canvas");
  scratch.width = W; scratch.height = 24000;
  const height = layout(scratch.getContext("2d")!, r);
  const c = document.createElement("canvas");
  c.width = W; c.height = height;
  layout(c.getContext("2d")!, r);
  return c;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-");

export async function downloadReportPng(r: ReportInput) {
  const blob = await new Promise<Blob | null>((res) => renderReport(r).toBlob(res, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  save(blob, `revision-report-${stem(r.title)}.png`);
}

export async function downloadReportPdf(r: ReportInput) {
  const c = renderReport(r);
  const { jsPDF } = await import("jspdf"); // loaded only when a PDF is requested
  const pdf = new jsPDF({ orientation: c.width > c.height ? "l" : "p", unit: "px", format: [c.width, c.height], hotfixes: ["px_scaling"] });
  pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, c.width, c.height);
  save(pdf.output("blob"), `revision-report-${stem(r.title)}.pdf`);
}

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
