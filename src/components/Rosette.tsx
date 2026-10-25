import type { ConditionScore } from "../services/robustness";
import { CONDITION_LABEL } from "../services/transform";

const SHORT: Record<string, string> = {
  brightness: "Dark", blur: "Blur", contrast: "Contrast", occlusion: "Cover", noise: "Noise", rotation: "Rotate", jpeg: "JPEG",
  lowlight: "Low light", motionblur: "Motion", crop: "Crop", resize: "Low res", haze: "Haze", colorshift: "Colour",
};

/** One spoke per tested condition, reaching further out the more robust the model is. */
export default function Rosette({ scores, overall, size = 360 }: { scores: ConditionScore[]; overall: number | null; size?: number }) {
  const n = scores.length, c = size / 2, R = size / 2 - 52;
  const pt = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const shape = scores.map((s, i) => pt(i, R * ((s.score ?? 0) / 100)).join(",")).join(" ");
  const label = `Robustness by condition. ${scores.map((s) => `${CONDITION_LABEL[s.condition]} ${s.score === null ? "not available" : Math.round(s.score)}`).join(", ")}.`;
  return (
    <svg className="rosette" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {[25, 50, 75, 100].map((g) => (
        <polygon key={g} points={scores.map((_, i) => pt(i, (R * g) / 100).join(",")).join(" ")} className={g === 50 ? "ring half" : "ring"} />
      ))}
      {scores.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="spoke" />; })}
      {n >= 3 && <polygon points={shape} className="shape" />}
      {scores.map((s, i) => {
        const [x, y] = pt(i, R * ((s.score ?? 0) / 100)), [lx, ly] = pt(i, R + 22);
        return (
          <g key={s.condition}>
            {s.score !== null && <circle cx={x} cy={y} r={3.5} className="dot" />}
            <text x={lx} y={ly} textAnchor={lx < c - 8 ? "end" : lx > c + 8 ? "start" : "middle"} dominantBaseline="middle" className="spoke-label">{SHORT[s.condition]}</text>
          </g>
        );
      })}
      <text x={c} y={c - 2} textAnchor="middle" className="rosette-num">{overall === null ? "N/A" : Math.round(overall)}</text>
      <text x={c} y={c + 20} textAnchor="middle" className="rosette-sub">out of 100</text>
    </svg>
  );
}
