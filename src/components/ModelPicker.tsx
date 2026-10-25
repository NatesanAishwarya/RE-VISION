import { MODEL_LIST } from "../services/models";
import type { ModelId } from "../types/experiment";

export type ModelStatus = Partial<Record<ModelId, { state: "loading" | "ready" | "failed"; pct?: number; error?: string }>>;

const dots = (n: number) => "●".repeat(n) + "○".repeat(5 - n);

export default function ModelPicker({ value, onChange, status, disabled }: { value: ModelId; onChange: (id: ModelId) => void; status: ModelStatus; disabled?: boolean }) {
  return (
    <div className="models" role="radiogroup" aria-label="Detection model">
      {MODEL_LIST.map((m) => {
        const s = status[m.id];
        return (
          <label key={m.id} className={`model ${value === m.id ? "on" : ""}`}>
            <input type="radio" name="model" checked={value === m.id} disabled={disabled} onChange={() => onChange(m.id)} />
            <span className="model-name">{m.label}</span>
            <span className="model-meta">{m.family}, {m.vocabulary}, about {m.sizeMB} MB</span>
            <span className="model-meta">
              <span title="Speed">speed <span className="dots" aria-label={`speed ${m.speed} of 5`}>{dots(m.speed)}</span></span>{" "}
              <span title="Typical accuracy">accuracy <span className="dots" aria-label={`accuracy ${m.accuracy} of 5`}>{dots(m.accuracy)}</span></span>
            </span>
            {value === m.id && <span className="model-blurb">{m.blurb}</span>}
            <span className={`model-state ${s?.state ?? "idle"}`}>
              {s?.state === "ready" ? "Ready" : s?.state === "loading" ? `Downloading${s.pct ? ` ${Math.round(s.pct)}%` : "…"}` : s?.state === "failed" ? "Failed to load" : "Downloads when selected"}
            </span>
          </label>
        );
      })}
    </div>
  );
}
