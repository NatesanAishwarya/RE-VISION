import { useEffect, useState } from "react";

export type ThemeId = "daylight" | "cyanotype" | "darkroom" | "prism";
export const THEMES: { id: ThemeId; label: string; swatch: [string, string, string] }[] = [
  { id: "daylight", label: "Daylight", swatch: ["#e8edf0", "#12324a", "#0a64c9"] },
  { id: "cyanotype", label: "Cyanotype", swatch: ["#0d2f4f", "#eaf4ff", "#7cc4ff"] },
  { id: "darkroom", label: "Darkroom", swatch: ["#1d171a", "#ff6a4d", "#f2e2d8"] },
  { id: "prism", label: "Prism", swatch: ["#f3f2fb", "#5b3df5", "#e0267b"] },
];
const KEY = "revision.theme";

export function initialTheme(): ThemeId {
  try { const s = localStorage.getItem(KEY) as ThemeId | null; if (s && THEMES.some((t) => t.id === s)) return s; } catch { /* storage blocked */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "darkroom" : "daylight";
}

export type ThemeColors = { orig: string; mod: string; ink: string; muted: string; line: string; accent: string };
/** Mirrors the CSS variables, for charts and canvas drawing that cannot read them. Keep in step with index.css. */
export const THEME_COLORS: Record<ThemeId, ThemeColors> = {
  daylight: { orig: "#0a5fc2", mod: "#c0175d", ink: "#10202c", muted: "#4a5f6d", line: "#bcc9d2", accent: "#12324a" },
  cyanotype: { orig: "#7cc4ff", mod: "#ff9ec0", ink: "#eaf4ff", muted: "#a9c4de", line: "#5f86ab", accent: "#eaf4ff" },
  darkroom: { orig: "#62b4ff", mod: "#ff7ab0", ink: "#f4e6e1", muted: "#c1a9a3", line: "#4a3a3d", accent: "#ff6a4d" },
  prism: { orig: "#0b7fc0", mod: "#d4206f", ink: "#1b1740", muted: "#55507a", line: "#d4d0ec", accent: "#5b3df5" },
};

/** Applies the theme to the page and returns its colours. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, setTheme, colors: THEME_COLORS[theme] };
}
