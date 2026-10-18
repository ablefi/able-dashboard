/**
 * One way to write a date.
 *
 * There were eight across the dashboard: DD/MM/YYYY HH:mm, "Sep 15, 2026",
 * "Sep 26", "DD MMM YY", and a bare toLocaleDateString() that rendered
 * differently depending on the viewer's machine. the owner picked the long form,
 * with a time only when the time actually matters.
 *
 * Locale is pinned to en-GB so it never shifts under whoever is looking at it.
 * That was the real bug in the bare call: the same row read differently on two
 * machines, which makes a date column useless for comparing anything.
 */

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

type In = string | number | Date | null | undefined;

function toDate(v: In): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "15 September 2026". The default: use this unless the time is meaningful. */
export function fmtDate(v: In, fallback = "-"): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-GB", DATE) : fallback;
}

/** "15 September 2026, 18:28". For anything where the hour carries information:
 *  when a code was sent, when an account was created, when a run finished. */
export function fmtDateTime(v: In, fallback = "-"): string {
  const d = toDate(v);
  if (!d) return fallback;
  return `${d.toLocaleDateString("en-GB", DATE)}, ${d.toLocaleTimeString("en-GB", TIME)}`;
}

/** "September 2026". For month buckets and ledger groupings. */
export function fmtMonth(v: In, fallback = "-"): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : fallback;
}

/** Filenames want something sortable and punctuation-free, not prose. */
export function fmtFileStamp(v: In = new Date()): string {
  const d = toDate(v) ?? new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}
