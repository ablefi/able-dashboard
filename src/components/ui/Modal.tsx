"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZE: Record<string, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-4xl",
  "3xl": "max-w-6xl",
};

/** Lightweight centered modal in the navy style. */
export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = "md",
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/[0.08] bg-jp-navy-card p-6 shadow-2xl shadow-black/50",
          SIZE[size]
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-faint transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-ink-muted">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
