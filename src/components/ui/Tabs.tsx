"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented pill control with a sliding indicator.
 *
 * The highlight is a single absolutely-positioned block that animates to the
 * active tab, rather than each pill toggling its own background. That's the
 * difference between the control feeling like one thing that moves and a row
 * of buttons that blink.
 *
 * Position is measured from the DOM (not computed from widths) so it stays
 * correct when labels change length — e.g. counts going from "All (9)" to
 * "All (10)".
 */
export default function Tabs({
  tabs,
  active,
  onChange,
  size = "md",
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  /** "sm" matches the compact controls that sit inside page headers. */
  size?: "sm" | "md";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = btnRefs.current[active];
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const a = el.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    setBox({ left: a.left - b.left, width: a.width });
  }, [active]);

  // Measured in a LAYOUT effect, so the indicator is already in the right
  // place on first paint — no entrance animation to suppress, which is why
  // there's no "have we settled yet" flag here.
  useLayoutEffect(() => {
    measure();
  }, [measure, tabs.map((t) => t.label).join("|")]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div ref={wrapRef} className={cn("relative inline-flex gap-1 rounded-xl border border-white/[0.08] bg-jp-navy-card/50", size === "sm" ? "p-1" : "p-1")}>
      {box && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-jp-blue/15 ring-1 ring-inset ring-jp-blue/20 transition-[left,width] duration-200 ease-out"
          style={{ left: box.left, width: box.width }}
        />
      )}
      {tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => {
            btnRefs.current[t.key] = el;
          }}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative z-10 rounded-lg font-medium transition-colors duration-150",
            size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
            active === t.key ? "text-jp-blue-light" : "text-ink-muted hover:text-ink"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
