"use client";

/**
 * Runtime palette, so the look can be dialled in by eye instead of guessed at
 * in a commit.
 *
 * The surfaces are DERIVED, not picked one by one: a single hue, saturation
 * and base lightness generate the whole ramp with fixed steps between them.
 * That's the thing that keeps a dark UI coherent — hand-picking four navies
 * independently is how you end up with surfaces that don't sit in the same
 * family. You move three numbers, the relationships hold.
 *
 * Stored in localStorage and applied over the CSS custom properties Tailwind
 * emits, so it survives navigation and needs no rebuild.
 */

export type ThemeSettings = {
  /** Surface hue, 0-360. ~220 is the navy we ship. */
  hue: number;
  /** Surface saturation %, 0-60. Higher = more colourful, less grey. */
  sat: number;
  /** Lightness % of the page background — everything else steps up from it. */
  light: number;
  /** Accent hue, 0-360. ~217 is the brand blue. */
  accentHue: number;
  /** Accent saturation %, gives the blue its punch. */
  accentSat: number;
  /** Root font scale %, since "make it bigger" is a look decision too. */
  scale: number;
};

/**
 * The shipped palette, mirrored from globals.css.
 *
 * These two MUST stay in step: this is what Reset returns to and what the
 * "Current" preset means, so if they drift, resetting lands somewhere that
 * isn't what everyone else sees.
 */
export const DEFAULT_THEME: ThemeSettings = {
  hue: 236, sat: 60, light: 18, accentHue: 236, accentSat: 100, scale: 94,
};

// v2: saved themes carried scale 87, which set the root font to 87% and made
// every rem-based size render 13% smaller. applyTheme is the only thing that
// sets that, ThemePicker is the only caller, and it returns early on
// production, so the shrink only ever happened on staging. Staging was
// therefore showing smaller text than the real dashboard. Bumped so saved
// themes are dropped and both environments render the same size.
export const STORAGE_KEY = "app-theme-v2";

/** How far each surface sits above the page, in lightness points. */
const STEPS = { navy: 0, light: 3.5, card: 8, raised: 13 };

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${Math.max(0, Math.min(100, l))}%)`;
}

/** The full set of CSS custom properties for a given setting. */
export function themeVars(t: ThemeSettings): Record<string, string> {
  const { hue: h, sat: s, light: l } = t;
  return {
    "--color-app-navy": hsl(h, s, l + STEPS.navy),
    "--color-app-navy-light": hsl(h, s, l + STEPS.light),
    "--color-app-navy-card": hsl(h, s - 4, l + STEPS.card),
    "--color-app-navy-raised": hsl(h, s - 6, l + STEPS.raised),
    "--color-app-blue": hsl(t.accentHue, t.accentSat, 60),
    "--color-app-blue-light": hsl(t.accentHue, t.accentSat, 69),
    "--color-app-blue-dark": hsl(t.accentHue, t.accentSat - 10, 40),
    // Headline numbers ride the accent hue so they stay part of the family
    // whatever it's set to.
    "--color-stat": hsl(t.accentHue, 58, 87),
    // Categorical chart ramp — one hue, stepping lightness, so charts move
    // with the accent instead of drifting off on their own palette.
    "--color-cat-1": hsl(t.accentHue, 42, 78),
    "--color-cat-2": hsl(t.accentHue, 52, 70),
    "--color-cat-3": hsl(t.accentHue, 62, 62),
    "--color-cat-4": hsl(t.accentHue, 72, 54),
    "--color-cat-5": hsl(t.accentHue, 80, 46),
    "--color-cat-6": hsl(t.accentHue, 86, 38),
  };
}

export function applyTheme(t: ThemeSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  root.style.fontSize = `${t.scale}%`;
}

export function clearTheme(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const k of Object.keys(themeVars(DEFAULT_THEME))) root.style.removeProperty(k);
  root.style.removeProperty("font-size");
}

export function readTheme(): ThemeSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<ThemeSettings>;
    // Merge over defaults so a stored theme from an older shape can't leave
    // a field undefined and blank out a colour.
    return { ...DEFAULT_THEME, ...t };
  } catch {
    return null;
  }
}

export function writeTheme(t: ThemeSettings | null): void {
  if (typeof window === "undefined") return;
  try {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private window / quota — the theme just won't persist */
  }
}

/** Resolved hex values, for pasting into globals.css once one is chosen. */
export function themeHex(t: ThemeSettings): Record<string, string> {
  if (typeof document === "undefined") return {};
  const probe = document.createElement("div");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(themeVars(t))) {
    probe.style.color = v;
    const rgb = getComputedStyle(probe).color.match(/\d+/g);
    out[k] = rgb
      ? "#" + rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")
      : v;
  }
  probe.remove();
  return out;
}

/** A few starting points worth trying, rather than a blank set of sliders. */
export const PRESETS: { name: string; theme: ThemeSettings }[] = [
  { name: "Current", theme: DEFAULT_THEME },
  /**
   * The app's own colourway, not an approximation of it.
   *
   * Checked against Assets.xcassets/ColorPalette: the generator at hue 210,
   * saturation 100, lightness 7 lands on #000f24, and the app's Background is
   * #000f25. The rest of the ramp follows from the same steps, and the accent
   * is the brand blue. Far darker and far bluer than anything else here, because
   * the app is near-black where the dashboard is indigo.
   */
  { name: "Brand", theme: { hue: 210, sat: 100, light: 7, accentHue: 205, accentSat: 100, scale: 87 } },
  { name: "Deeper", theme: { ...DEFAULT_THEME, light: 11, sat: 40 } },
  { name: "Midnight", theme: { ...DEFAULT_THEME, hue: 230, sat: 48, light: 13 } },
  { name: "Slate", theme: { ...DEFAULT_THEME, hue: 215, sat: 18, light: 18 } },
  { name: "Ink", theme: { ...DEFAULT_THEME, hue: 224, sat: 30, light: 9 } },
  { name: "Airy", theme: { ...DEFAULT_THEME, light: 21, sat: 34 } },
  { name: "Teal-lean", theme: { ...DEFAULT_THEME, hue: 200, sat: 44, accentHue: 195 } },
  { name: "Violet-lean", theme: { ...DEFAULT_THEME, hue: 245, sat: 40, accentHue: 250 } },
];
