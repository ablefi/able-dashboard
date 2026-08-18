"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string; hint?: string };

/**
 * Searchable multi-select in the navy style. Selected values show as
 * removable chips; the dropdown filters on label OR value so typing "US"
 * finds the United States as fast as typing "United".
 *
 * Empty selection deliberately means "everyone" to the callers here — an
 * audience filter with no values set is not sent to the backend at all.
 */
export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Everyone",
  searchPlaceholder = "Search…",
  maxChips = 8,
}: {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Collapse to "+N more" past this many chips. */
  maxChips?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options.slice(0, 300);
    return options.filter((o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)).slice(0, 300);
  }, [options, q]);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const chips = value.slice(0, maxChips);
  const overflow = value.length - chips.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 w-full items-center gap-2 rounded-xl border border-white/[0.12] bg-jp-navy-card/60 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:border-white/[0.22]"
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {value.length === 0 && <span className="text-ink-faint">{placeholder}</span>}
          {chips.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-jp-blue/15 px-1.5 py-0.5 text-xs text-jp-blue-light"
            >
              {byValue.get(v)?.label ?? v}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${byValue.get(v)?.label ?? v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                className="cursor-pointer text-jp-blue-light/60 hover:text-jp-blue-light"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))}
          {overflow > 0 && <span className="text-xs text-ink-faint">+{overflow} more</span>}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.1] bg-jp-navy-card shadow-2xl shadow-black/50">
          <div className="border-b border-white/[0.06] p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-white/[0.1] bg-jp-navy/60 px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-jp-blue/50"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-faint">No matches</div>}
            {filtered.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      on ? "border-jp-blue bg-jp-blue text-white" : "border-white/25"
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[10px] text-ink-faint">{o.hint}</span>}
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="border-t border-white/[0.06] p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-white/[0.04] hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
