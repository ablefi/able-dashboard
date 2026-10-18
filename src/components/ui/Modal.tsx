"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZE: Record<string, string> = {
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-3xl",
  "2xl": "max-w-5xl",
  "3xl": "max-w-6xl",
  // For a working surface rather than a dialog: translating is a side by side
  // comparison and it was being done in a 512px column.
  wide: "max-w-[80vw]",
};

/**
 * Centred modal in the navy style.
 *
 * Sizes were bumped a step across the board: dialogs were coming out cramped,
 * with content squeezed into a column far narrower than the screen could hold.
 * Body text is a step up too — these are working surfaces you read from, not
 * captions.
 *
 * Header and footer are pinned so long content scrolls between them, rather
 * than the whole dialog scrolling and taking the title and buttons off screen.
 *
 * `tall` fixes the height instead of letting it hug the content. A dialog that
 * sizes to its content is right for a confirmation and wrong for an editor:
 * the panes you are typing into end up as tall as whatever happens to be in
 * them, so a short quote gives you a two line box to write a paragraph in.
 */
export default function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  size = "md",
  tall = false,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  /** Fill the height rather than hugging the content. For editors. */
  tall?: boolean;
}) {
  // Escape closes, and the page behind doesn't scroll while it's up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-app-navy/70 backdrop-blur-md animate-[jpFade_140ms_ease-out]" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl",
          "border border-white/[0.09] bg-app-navy-card shadow-2xl shadow-black/50",
          "animate-[jpRise_160ms_cubic-bezier(0.16,1,0.3,1)]",
          tall && "h-[85vh]",
          SIZE[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-7 pb-4 pt-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[0.8125rem] text-ink-faint">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.07] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={cn(
            "flex-1 px-7 py-5 text-[0.9375rem] leading-relaxed text-ink-muted",
            // A tall dialog hands its height to the content, which does its own
            // scrolling. Otherwise the body scrolls, as before.
            tall ? "min-h-0 overflow-hidden" : "overflow-y-auto"
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-white/[0.06] px-7 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
