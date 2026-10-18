/**
 * The typeface the dashboard wears.
 *
 * Stored per-browser like the rest of the theme, so a font can be judged by
 * reading real screens in it rather than argued about from a specimen.
 *
 * Every option except System is loaded through next/font in `layout.tsx`, with
 * preload off for the non-default ones — otherwise picking one font would cost
 * the download of all five on every page load.
 */

export type FontKey = "inter" | "system" | "manrope" | "plex" | "figtree";

export const FONTS: { value: FontKey; label: string; hint: string; stack: string }[] = [
  { value: "inter", label: "Inter", hint: "What we use today. Neutral, dense, made for screens.", stack: "var(--font-inter)" },
  { value: "system", label: "System", hint: "The OS font: SF on a Mac, Segoe on Windows. Nothing to download.", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  { value: "manrope", label: "Manrope", hint: "Rounder and wider. Softer than Inter without being playful.", stack: "var(--font-manrope)" },
  { value: "plex", label: "IBM Plex", hint: "Squarer, a little mechanical. Numbers read very clearly.", stack: "var(--font-plex)" },
  { value: "figtree", label: "Figtree", hint: "Geometric and friendly. The most character of the five.", stack: "var(--font-figtree)" },
];

export const DEFAULT_FONT: FontKey = "inter";
export const FONT_KEY = "app-font-v1";

export function stackFor(f: FontKey): string {
  return (FONTS.find((x) => x.value === f) ?? FONTS[0]).stack;
}

export function readFont(): FontKey {
  if (typeof window === "undefined") return DEFAULT_FONT;
  try {
    const raw = localStorage.getItem(FONT_KEY);
    if (FONTS.some((f) => f.value === raw)) return raw as FontKey;
  } catch {
    /* private mode or blocked storage — fall through to the default */
  }
  return DEFAULT_FONT;
}

export function applyFont(f: FontKey): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--font-sans", stackFor(f));
}

export function writeFont(f: FontKey): void {
  try {
    localStorage.setItem(FONT_KEY, f);
  } catch {
    /* nothing to do — the choice just will not persist */
  }
  applyFont(f);
  window.dispatchEvent(new CustomEvent("app-font-change", { detail: f }));
}
