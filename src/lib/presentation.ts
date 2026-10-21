/**
 * How densely the screens present themselves.
 *
 * The bottom bar gave every page back ~256px of width, and the screens were
 * laid out for the narrower canvas: four stat cards stretched across a full
 * window leave each number floating in space, which reads as sparse rather
 * than informed.
 *
 * Rather than rewrite 35 views, this sets `data-presentation` on the shell
 * root and the shared primitives restyle underneath it. `PageHeader` alone is
 * in 31 files, so the leverage is in the primitives, not the pages — and it
 * also means "uniform" is enforced by them instead of being re-decided per
 * screen.
 *
 * `classic` is the default. Focused stays selectable in the picker — it was
 * tried as the default on 11 Sep and the owner did not want it, so it is an opt-in
 * rather than a direction we are heading in.
 */

export type Presentation = "classic" | "focused" | "brand";

export const PRESENTATIONS: { value: Presentation; label: string; hint: string }[] = [
  { value: "classic", label: "Classic", hint: "How the screens look today. Centred stats, 4 across, roomy headers." },
  { value: "focused", label: "Focused", hint: "Left-aligned stats that fit more across, tighter headers, aligned figures." },
  // Not a colourway. It repaints the surfaces with the app's own values AND
  // restyles the primitives — the onboarding gradient and starfield, the glass
  // stroke, the app's radii and the glow on the accent.
  { value: "brand", label: "Able", hint: "White canvas, black controls and a floating monochrome tab bar." },
];

export const DEFAULT_PRESENTATION: Presentation = "brand";
// v3: the default became "brand". Browsers that had used the
// dashboard before that have "classic" stored and would keep it forever, so
// the key is bumped to move everyone onto the new default. That does discard a
// deliberate choice of Classic, which is the intent: this is the look now, not
// one of three.
export const PRESENTATION_KEY = "able-presentation-v4";

export function readPresentation(): Presentation {
  if (typeof window === "undefined") return DEFAULT_PRESENTATION;
  try {
    const raw = localStorage.getItem(PRESENTATION_KEY);
    if (PRESENTATIONS.some((p) => p.value === raw)) return raw as Presentation;
  } catch {
    /* blocked storage — fall through */
  }
  return DEFAULT_PRESENTATION;
}

export function writePresentation(next: Presentation | null): void {
  if (typeof window === "undefined") return;
  try {
    if (next) localStorage.setItem(PRESENTATION_KEY, next);
    else localStorage.removeItem(PRESENTATION_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("app-presentation", { detail: next ?? DEFAULT_PRESENTATION }));
}
