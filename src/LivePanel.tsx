import { useEffect, useRef, useState } from "react";
import { applyThresholds, detectModel } from "./services/detector";
import { drawDetections } from "./services/draw";
import { CONDITION_LABEL, applyCondition } from "./services/transform";
import { MODELS } from "./services/models";
import type { ConditionType, DetectSettings, Detection } from "./types/experiment";
import type { ThemeColors } from "./theme";

type Props = { settings: DetectSettings; condition: ConditionType; severity: number; conf: number; colors: ThemeColors; onCapture: (frame: HTMLCanvasElement) => void; onClose: () => void };

/** Live webcam: left is the raw frame, right is the same frame after the chosen stress, each run through the selected model. */
export default function LivePanel({ settings, condition, severity, conf, colors, onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const rawCanvas = useRef<HTMLCanvasElement>(null);
  const modCanvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ condition, severity, conf, colors, settings });
  const [status, setStatus] = useState("Starting camera…");
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ raw: number; mod: number; fps: number } | null>(null);

  useEffect(() => { live.current = { condition, severity, conf, colors, settings }; }, [condition, severity, conf, colors, settings]);

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | undefined;
    const paint = (target: HTMLCanvasElement | null, src: HTMLCanvasElement, ds: Detection[], color: string, dashed: boolean) => {
      if (!target) return;
      target.width = src.width; target.height = src.height;
      const ctx = target.getContext("2d")!;
      ctx.drawImage(src, 0, 0);
      drawDetections(ctx, src.width, ds, color, dashed);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera access (it also needs https or localhost).");
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream; await v.play();
        setStatus("Live");
        while (alive) {
          const t0 = performance.now();
          if (v.videoWidth) {
            const f = document.createElement("canvas");
            f.width = v.videoWidth; f.height = v.videoHeight;
            f.getContext("2d")!.drawImage(v, 0, 0);
            frame.current = f;
            const L = live.current, dashed = MODELS[L.settings.model].kind === "open";
            const thr = { conf: L.conf };
            const rawDet = applyThresholds(await detectModel(L.settings.model, f, false, L.settings.queries), thr);
            if (!alive) break;
            paint(rawCanvas.current, f, rawDet, L.colors.orig, dashed);
            const m = await applyCondition(f, L.condition, L.severity);
            const modDet = applyThresholds(await detectModel(L.settings.model, m, false, L.settings.queries), thr);
            if (!alive) break;
            paint(modCanvas.current, m, modDet, L.colors.mod, dashed);
            setCounts({ raw: rawDet.length, mod: modDet.length, fps: 1000 / (performance.now() - t0) });
          }
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      } catch (e) {
        const err = e as Error;
        setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow it in the browser address bar and try again." : err.name === "NotFoundError" ? "No camera was found on this device." : err.message);
      }
    })();
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <section className="panel">
      <div className="row">
        <h2>Webcam: {error ? "unavailable" : status}</h2>
        <button className="btn ghost small" disabled={!counts || !!error} onClick={() => frame.current && onCapture(frame.current)}>Use this frame as the image</button>
        <button className="btn ghost small" onClick={onClose}>Close webcam</button>
      </div>
      {error && <div className="note err" role="alert">{error}</div>}
      <video ref={video} playsInline muted style={{ display: "none" }} />
      <div className="pair">
        <figure className="frame orig"><figcaption><b>Live original</b>{counts && <span>{counts.raw} detections</span>}</figcaption><canvas ref={rawCanvas} className="view" /></figure>
        <figure className="frame mod"><figcaption><b>Live: {CONDITION_LABEL[condition]} {severity}</b>{counts && <span>{counts.mod} detections</span>}</figcaption><canvas ref={modCanvas} className="view" /></figure>
      </div>
      {counts && <small>About {counts.fps.toFixed(1)} frames per second (two detections per frame) with {MODELS[settings.model].label}. Tiling is off in live mode. Change the model, condition and severity in the sidebar while it runs.</small>}
    </section>
  );
}
