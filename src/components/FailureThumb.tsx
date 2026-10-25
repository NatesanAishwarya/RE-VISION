import { useEffect, useRef, useState } from "react";
import type { Failure } from "../services/failures";
import { applyCondition } from "../services/transform";
import type { BoundingBox } from "../types/experiment";
import type { ThemeColors } from "../theme";

const cache = new WeakMap<HTMLImageElement, Map<string, Promise<HTMLCanvasElement>>>();
const modified = (img: HTMLImageElement, f: Failure) => {
  let m = cache.get(img);
  if (!m) cache.set(img, (m = new Map()));
  const key = `${f.condition}:${f.severity}`;
  if (!m.has(key)) m.set(key, applyCondition(img, f.condition, f.severity));
  return m.get(key)!;
};

const union = (a?: BoundingBox, b?: BoundingBox): BoundingBox => {
  if (!a) return b!; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** Before and after crops around one failure, regenerated from the stored image: no extra data is saved. */
export default function FailureThumb({ image, failure, colors }: { image: HTMLImageElement; failure: Failure; colors: ThemeColors }) {
  const a = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mod = await modified(image, failure);
        if (!live) return;
        const u = union(failure.baseBox, failure.modBox);
        const padX = Math.max(u.width * 0.35, 24), padY = Math.max(u.height * 0.35, 24);
        const x = Math.max(0, u.x - padX), y = Math.max(0, u.y - padY);
        const w = Math.min(image.naturalWidth - x, u.width + padX * 2), h = Math.min(image.naturalHeight - y, u.height + padY * 2);
        const k = Math.min(1, 260 / Math.max(w, h));
        const draw = (cv: HTMLCanvasElement | null, src: CanvasImageSource, box: BoundingBox | undefined, color: string, dashed: boolean) => {
          if (!cv) return;
          cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
          const ctx = cv.getContext("2d")!;
          ctx.drawImage(src, x, y, w, h, 0, 0, cv.width, cv.height);
          if (box) {
            ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.setLineDash(dashed ? [6, 4] : []);
            ctx.strokeRect((box.x - x) * k, (box.y - y) * k, box.width * k, box.height * k);
          }
        };
        draw(a.current, image, failure.baseBox, colors.orig, false);
        // For a missed object the box is where it used to be: dashed, because nothing was found there now.
        draw(b.current, mod, failure.modBox ?? failure.baseBox, colors.mod, !failure.modBox);
      } catch { if (live) setErr(true); }
    })();
    return () => { live = false; };
  }, [image, failure, colors]);
  if (err) return <div className="note err">Could not render this example.</div>;
  return (
    <div className="thumb">
      <figure><canvas ref={a} /><figcaption>Original</figcaption></figure>
      <figure><canvas ref={b} /><figcaption>Modified</figcaption></figure>
    </div>
  );
}
