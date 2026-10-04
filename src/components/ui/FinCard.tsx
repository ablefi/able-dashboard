import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Financial stat card — title pinned to the TOP of the box (consistent
 * position whether or not a note exists), no icons, big centered number.
 * Numbers are unsigned; color carries the meaning (per Adam).
 */
export default function FinCard({
  label,
  valueClass,
  note,
  children,
}: {
  label: string;
  valueClass?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="chart-card flex flex-col items-center rounded-xl border border-slate-200 bg-white px-4 pb-4 pt-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className={cn("mt-2.5 text-[1.7rem] font-bold leading-none num", valueClass)}>{children}</div>
      {note && <div className="mt-2 text-[11px] leading-snug text-ink-faint">{note}</div>}
    </div>
  );
}
