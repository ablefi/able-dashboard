"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-hand slide-in panel.
 *
 * Used instead of a centred modal for anything with more than a couple of
 * fields: a dialog that blocks the middle of the screen reads as an
 * interruption, where a drawer reads as part of the page. It also gives a
 * multi-step flow somewhere consistent to put Back/Next.
 *
 * Mounts hidden and animates in on the next frame, so the transition runs on
 * open rather than snapping into place.
 */
export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "xl",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl" | "2xl";
}) {
  // `mounted` keeps the panel in the DOM for the closing animation; `shown`
  // drives the transform so it slides rather than appears.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const W = { md: "max-w-md", lg: "max-w-xl", xl: "max-w-3xl", "2xl": "max-w-5xl" }[width];

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/[0.08] bg-jp-navy shadow-2xl shadow-black/60 transition-transform duration-200 ease-out",
          W,
          shown ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
