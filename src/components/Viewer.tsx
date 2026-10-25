import { useEffect, useRef } from "react";
import type { Detection } from "../types/experiment";
import { drawDetections } from "../services/draw";

/** A canvas showing an image with detection boxes. Corner marks come from the .frame wrapper. */
export default function Viewer({ source, detections, color, show = true, dashed = false, empty = "Nothing here yet" }: {
  source: CanvasImageSource | null; detections: Detection[]; color: string; show?: boolean; dashed?: boolean; empty?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    const w = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width;
    const h = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    if (show) drawDetections(ctx, w, detections, color, dashed);
  }, [source, detections, color, show, dashed]);
  return source ? <canvas ref={ref} className="view" /> : <div className="view empty">{empty}</div>;
}
