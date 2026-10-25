import { useEffect, useState } from "react";

/** Loads an image from a same-origin URL. Returns null while loading or on failure. */
export function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<{ url: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const el = new Image();
    el.onload = () => live && setImg({ url, el });
    el.src = url;
    return () => { live = false; };
  }, [url]);
  return url && img?.url === url ? img.el : null;
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
