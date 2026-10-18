/**
 * Which navigation shell the dashboard wears.
 *
 * Stored per-browser like the theme, and picked from the same control, so the
 * layout can be judged by using it rather than argued about in a commit.
 *
 * `bottom` is the default as of 10 Sep 2026 — the owner picked it after trying all
 * four. ⚠️ That means it is what a fresh browser gets, production included
 * once `main` ships, not just an opt-in.
 */

export type NavMode = "sidebar" | "rail" | "bottom" | "top";

export const NAV_MODES: { value: NavMode; label: string; hint: string }[] = [
  { value: "sidebar", label: "Sidebar", hint: "What we have today. 16rem of the window, always." },
  { value: "rail", label: "Icon rail", hint: "48px of icons, section opens on hover. Recovers 208px." },
  { value: "bottom", label: "Bottom bar", hint: "iOS-style, sections at the bottom. Full width, nothing on the sides." },
  { value: "top", label: "Top bar", hint: "Sections across the top, pages on a second row. Full width." },
];

export const DEFAULT_NAV_MODE: NavMode = "sidebar";
export const NAV_MODE_KEY = "app-nav-mode-v1";

export function readNavMode(): NavMode {
  if (typeof window === "undefined") return DEFAULT_NAV_MODE;
  try {
    const raw = localStorage.getItem(NAV_MODE_KEY);
    if (NAV_MODES.some((m) => m.value === raw)) return raw as NavMode;
  } catch {
    /* private mode, blocked storage — fall through */
  }
  return DEFAULT_NAV_MODE;
}

export function writeNavMode(mode: NavMode | null): void {
  if (typeof window === "undefined") return;
  try {
    if (mode) localStorage.setItem(NAV_MODE_KEY, mode);
    else localStorage.removeItem(NAV_MODE_KEY);
  } catch {
    /* ignore */
  }
  // The shell reads this on mount, so tell any listener to re-read rather
  // than requiring a reload to see the change.
  window.dispatchEvent(new CustomEvent("app-nav-mode", { detail: mode ?? DEFAULT_NAV_MODE }));
}
