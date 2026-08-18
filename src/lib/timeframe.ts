/**
 * Timeframe model for the Creators screens — ported from jp-creators'
 * lib/timeframe. The admin views are client-fetching components, so instead
 * of URL params the filter holds a `Timeframe` value in state and
 * `resolveTimeframe` turns it into the fromISO/toISO pair for API calls.
 */

export type TimeframeKey = "today" | "this_month" | "7d" | "30d" | "90d" | "all" | "custom";

/** Client-side filter value. `from`/`to` are YYYY-MM-DD, set when key=custom. */
export interface Timeframe {
  key: TimeframeKey;
  from?: string;
  to?: string;
}

export const TIMEFRAME_PRESETS: { key: TimeframeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_month", label: "This month" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}
export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rangeFromKey(key: TimeframeKey): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case "today":
      return { from: today, to: endOfDay(today) };
    case "this_month":
      // 1st of the current month at 00:00 → end of today (e.g. Jun 1 → Jun 17).
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: endOfDay(now) };
    case "7d":
      return { from: startOfDay(new Date(today.getTime() - 6 * 86400_000)), to: endOfDay(now) };
    case "90d":
      return { from: startOfDay(new Date(today.getTime() - 89 * 86400_000)), to: endOfDay(now) };
    case "all":
      return { from: new Date("2024-01-01T00:00:00Z"), to: endOfDay(now) };
    case "30d":
    default:
      return { from: startOfDay(new Date(today.getTime() - 29 * 86400_000)), to: endOfDay(now) };
  }
}

/**
 * Detect whether a (from, to) YYYY-MM-DD pair covers exactly one full
 * calendar month. Returns {year, month (1-based)} if so — used to label a
 * month-picked custom range as "June 2026" and highlight its chip.
 */
export function isFullMonth(fromStr: string, toStr: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}-01$/.test(fromStr)) return null;
  const y = parseInt(fromStr.slice(0, 4), 10);
  const m = parseInt(fromStr.slice(5, 7), 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const expectedTo = `${fromStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  if (toStr !== expectedTo) return null;
  return { year: y, month: m };
}

export interface ParsedTimeframe {
  fromISO: string;
  toISO: string;
  label: string;
}

export function resolveTimeframe(tf: Timeframe): ParsedTimeframe {
  if (tf.key === "custom" && tf.from && tf.to) {
    const from = new Date(tf.from + "T00:00:00Z");
    const to = endOfDay(new Date(tf.to + "T00:00:00Z"));
    const fm = isFullMonth(tf.from, tf.to);
    const label = fm
      ? new Date(Date.UTC(fm.year, fm.month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : `${tf.from} – ${tf.to}`;
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label };
  }
  const key = TIMEFRAME_PRESETS.some((p) => p.key === tf.key) ? tf.key : "30d";
  const { from, to } = rangeFromKey(key);
  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    label: TIMEFRAME_PRESETS.find((p) => p.key === key)?.label ?? "Last 30 days",
  };
}

export interface MonthPreset {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** The last N calendar months ending with the current month, newest first. */
export function lastNMonths(n: number = 12): MonthPreset[] {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  const out: MonthPreset[] = [];
  for (let i = 0; i < n; i++) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    out.push({
      key: `${y}-${mm}`,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
