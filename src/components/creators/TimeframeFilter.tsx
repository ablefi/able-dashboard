"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import {
  TIMEFRAME_PRESETS,
  isFullMonth,
  isoDateOnly,
  lastNMonths,
  rangeFromKey,
  type Timeframe,
  type TimeframeKey,
} from "@/lib/timeframe";

/**
 * Timeframe dropdown — ported from jp-creators. Presets (Today / 7 / 30 /
 * 90 / All time), a 12-month "By month" grid, and a custom from–to range
 * with Apply. Props-driven (value/onChange) instead of URL-driven since the
 * admin views fetch client-side.
 */
export function TimeframeFilter({
  value,
  onChange,
  defaultKey = "30d",
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  /** The page's "resting" key — the button only lights up when it differs. */
  defaultKey?: TimeframeKey;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const customMonth = value.key === "custom" && value.from && value.to ? isFullMonth(value.from, value.to) : null;
  const currentLabel = customMonth
    ? new Date(Date.UTC(customMonth.year, customMonth.month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : value.key === "custom" && value.from && value.to
      ? `${value.from} – ${value.to}`
      : (TIMEFRAME_PRESETS.find((p) => p.key === value.key)?.label ?? "Last 30 days");

  const monthOptions = lastNMonths(12);
  const activeMonthKey = customMonth ? `${customMonth.year}-${String(customMonth.month).padStart(2, "0")}` : null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickPreset(key: TimeframeKey) {
    onChange({ key });
    setOpen(false);
  }
  function applyCustom(from: string, to: string) {
    onChange({ key: "custom", from, to });
    setOpen(false);
  }

  const defaults =
    value.key === "custom" && value.from && value.to
      ? { from: value.from, to: value.to }
      : (() => {
          const { from, to } = rangeFromKey(value.key);
          return { from: isoDateOnly(from), to: isoDateOnly(to) };
        })();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all " +
          (value.key !== defaultKey
            ? "border-jp-blue/40 bg-jp-blue/15 text-jp-blue-light"
            : "border-jp-blue/20 bg-jp-navy-card/50 text-ink hover:border-jp-blue/35 hover:bg-jp-navy-card")
        }
      >
        <Calendar className="h-3.5 w-3.5" />
        {currentLabel}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-jp-blue/20 bg-jp-navy-card/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="space-y-0.5">
            {TIMEFRAME_PRESETS.map((p) => {
              const active = value.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pickPreset(p.key)}
                  className={
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors " +
                    (active ? "bg-jp-blue/15 text-jp-blue-light" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")
                  }
                >
                  <span>{p.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-jp-blue-light" />}
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-jp-blue/10 pt-2">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">By month</div>
            <div className="grid grid-cols-3 gap-1 px-1">
              {monthOptions.map((mo) => {
                const active = activeMonthKey === mo.key;
                return (
                  <button
                    key={mo.key}
                    type="button"
                    onClick={() => applyCustom(mo.from, mo.to)}
                    className={
                      "rounded-lg px-1.5 py-1.5 text-[11px] font-medium tabular-nums transition-colors " +
                      (active
                        ? "bg-jp-blue/15 text-jp-blue-light ring-1 ring-inset ring-jp-blue/30"
                        : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")
                    }
                  >
                    {mo.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-1 border-t border-jp-blue/10 pt-2">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Custom range</div>
            <CustomRangeForm defaults={defaults} onApply={applyCustom} />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomRangeForm({ defaults, onApply }: { defaults: { from: string; to: string }; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  return (
    <div className="px-2 pb-1">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-jp-blue/15 bg-jp-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-jp-blue/45 focus:outline-none"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-jp-blue/15 bg-jp-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-jp-blue/45 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => from && to && onApply(from, to)}
        disabled={!from || !to}
        className="mt-2 w-full rounded-lg bg-jp-blue px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-jp-blue-light disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}
