import { useEffect, useState } from "react";
import { api } from "./services/api";

/** Loads an authenticated experiment image. Returns null while loading or on failure. */
export function useImage(experimentId: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<{ id: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!experimentId) return;
    let live = true;
    let objectUrl: string | undefined;
    api.imageBlob(experimentId).then((blob) => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      const el = new Image();
      el.onload = () => live && setImg({ id: experimentId, el });
      el.src = objectUrl;
    }).catch(() => { if (live) setImg(null); });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [experimentId]);
  return experimentId && img?.id === experimentId ? img.el : null;
}

export function useHashRoute(): string {
  const [h, setH] = useState(() => window.location.hash || "#/lab");
  useEffect(() => {
    const f = () => setH(window.location.hash || "#/lab");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}
