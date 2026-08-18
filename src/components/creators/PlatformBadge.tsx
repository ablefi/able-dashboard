import type { Platform } from "@/lib/creators";

/**
 * Inline SVG glyphs for IG/TT/YT — ported verbatim from jp-creators.
 * Lucide doesn't ship brand icons, so these are single-colour
 * (currentColor) so we can tint via Tailwind text-color utilities.
 */
function IGGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function TTGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.5 2h-3.2v13.4a2.6 2.6 0 11-2.6-2.6c.32 0 .63.06.92.17V9.71A6 6 0 1016.7 15.6V8.92a7.66 7.66 0 004.5 1.42V7.16A4.69 4.69 0 0116.5 2z" />
    </svg>
  );
}

function YTGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 00-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 001.76-1.77A26 26 0 0022 12a26 26 0 00-.4-4.8z M10 15.5v-7l5.5 3.5z" />
    </svg>
  );
}

interface Palette {
  Glyph: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  bg: string;
  fg: string;
  ring: string;
  label: string;
}

const PALETTE: Record<Platform, Palette> = {
  instagram: { Glyph: IGGlyph, bg: "bg-fuchsia-500/15", fg: "text-fuchsia-300", ring: "ring-fuchsia-500/25", label: "Instagram" },
  tiktok:    { Glyph: TTGlyph, bg: "bg-jp-cyan/15",     fg: "text-jp-cyan",     ring: "ring-jp-cyan/25",    label: "TikTok"    },
  youtube:   { Glyph: YTGlyph, bg: "bg-red-500/15",     fg: "text-red-400",     ring: "ring-red-500/25",    label: "YouTube"   },
};

/**
 * For YT posts the badge label swaps between "Short" / "Video" /
 * "Community" by URL shape + creator type (non-youtuber YT posts are
 * always Shorts — we never pull long-form for them).
 */
export function PlatformBadge({
  platform,
  size = "md",
  url,
  creatorType,
}: {
  platform: Platform;
  size?: "sm" | "md";
  url?: string | null;
  creatorType?: string;
}) {
  const p = PALETTE[platform];
  if (!p) return null;
  const sm = size === "sm";
  let label = p.label;
  if (platform === "youtube") {
    if (url && url.includes("/post/")) {
      label = "Community";
    } else if (creatorType && creatorType !== "youtuber") {
      label = "Short";
    } else if (url) {
      label = url.includes("/shorts/") ? "Short" : "Video";
    }
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 ${p.bg} ${p.fg} ring-1 ${p.ring} ${sm ? "text-[11px]" : "text-xs"} font-medium`}>
      <p.Glyph className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}

/** Square icon-only pill (handles row, account cards). */
export function PlatformPill({ platform }: { platform: Platform }) {
  const p = PALETTE[platform];
  if (!p) return null;
  return (
    <span title={p.label} className={`inline-flex h-5 w-5 items-center justify-center rounded ring-1 ${p.ring} ${p.bg} ${p.fg}`}>
      <p.Glyph className="h-3 w-3" />
    </span>
  );
}
