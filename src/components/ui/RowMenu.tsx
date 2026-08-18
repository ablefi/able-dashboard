"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type RowAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Renders in red — for delete and anything else you can't undo. */
  danger?: boolean;
};

/**
 * The "…" menu on a list row.
 *
 * A row of six unlabelled icons is unreadable — you have to hover each one to
 * find out what it does. Keep the one action you actually reach for as a
 * labelled button and put the rest in here, with words.
 */
export default function RowMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-white/[0.1] bg-jp-navy-card py-1 shadow-2xl shadow-black/50">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  a.onClick();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  a.danger ? "text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink"
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
