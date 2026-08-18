"use client";

import Tabs from "@/components/ui/Tabs";

export type DateRange = { from: string | null; to: string | null; preset: string };

function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function presetRange(preset: string): DateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: null, preset };
    case "last_month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))), preset };
    case "90d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { from: iso(d), to: null, preset };
    }
    case "ytd":
      return { from: `${y}-01-01`, to: null, preset };
    default:
      return { from: null, to: null, preset: "all" };
  }
}

const PRESETS: { key: string; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90d" },
  { key: "ytd", label: "YTD" },
];

const inputCls =
  "rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-jp-blue/45 focus:outline-none";

/** Preset pills + custom from/to date inputs. */
export default function DatePresets({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs size="sm" active={value.preset} onChange={(k) => onChange(presetRange(k))} tabs={PRESETS.map((p) => ({ key: p.key, label: p.label }))} />
      <input
        type="date"
        className={inputCls}
        value={value.from || ""}
        onChange={(e) => onChange({ from: e.target.value || null, to: value.to, preset: "custom" })}
        title="From"
      />
      <span className="text-xs text-ink-faint">→</span>
      <input
        type="date"
        className={inputCls}
        value={value.to || ""}
        onChange={(e) => onChange({ from: value.from, to: e.target.value || null, preset: "custom" })}
        title="To"
      />
    </div>
  );
}
