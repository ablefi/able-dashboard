"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Empty from "@/components/ui/Empty";
import { CHART_H, SERIES, TOOLTIP_STYLE } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";

const DEFAULT_REFRESH_MS = 5 * 60_000;

/** Recharts legend for charts with two or more series: top right, small. */
export const LEGEND_PROPS = {
  verticalAlign: "top",
  align: "right",
  iconType: "circle",
  iconSize: 6,
  wrapperStyle: { fontSize: 11, paddingBottom: 4 },
} as const;

/**
 * Cancels the card body padding (the Density block in globals.css pins it to
 * 0.7rem 0.85rem) so a table sits flush with the card edges.
 */
export const FLUSH = "-mx-[0.85rem] -my-[0.7rem]";

/**
 * Header, refresh, error banner and first-load state for a page built on one
 * Able API report. `children` renders once data exists; a failed refresh keeps
 * the last good copy on screen under the banner.
 */
export default function ReportPage<T>({
  title,
  path,
  refreshMs = DEFAULT_REFRESH_MS,
  children,
}: {
  title: string;
  path: string;
  refreshMs?: number;
  children: (data: T) => ReactNode;
}) {
  const { data, at, error, loading, refresh } = useAbleReport<T>(path, { refreshMs });
  const updated = at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined;

  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        subtitle={updated}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-xs text-app-red-text">{error}</div>}

      {data ? (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>{children(data)}</div>
      ) : (
        !error && (
          <div className="flex items-center justify-center py-16 text-sm text-ink-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading report
          </div>
        )
      )}
    </div>
  );
}

/** A number with its currency in a smaller, muted suffix ("1,234.5 USDT"). */
export function Amount({ value, unit }: { value: string; unit: string }) {
  return (
    <>
      {value} <span className="text-[0.65em] font-medium text-ink-faint">{unit}</span>
    </>
  );
}

/** Fixed-height chart well holding a compact empty state. */
export function ChartEmpty({ title, description, height = CHART_H }: { title: string; description?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <Empty compact title={title} description={description} />
    </div>
  );
}

/**
 * Share-of-total donut with a legend list. Slices past the palette fold into
 * "Other" so colours never repeat; the list still names every row and its
 * value, and scrolls inside the chart height when it is longer.
 */
export function Donut({
  rows,
  format,
  height = CHART_H,
}: {
  rows: { name: string; value: number }[];
  format: (n: number) => string;
  height?: number;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = SERIES.length;
  const slices =
    rows.length > max
      ? [...rows.slice(0, max - 1), { name: "Other", value: rows.slice(max - 1).reduce((s, r) => s + r.value, 0) }]
      : rows;
  const colourAt = (i: number) => SERIES[Math.min(i, slices.length - 1)];

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="w-full sm:w-2/5" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={colourAt(i)} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [format(v), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1 overflow-auto" style={{ maxHeight: height }}>
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colourAt(i) }} />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{r.name}</span>
            <span className="shrink-0 text-ink num">{format(r.value)}</span>
            <span className="w-12 shrink-0 text-right text-ink-faint num">{total > 0 ? `${((r.value / total) * 100).toFixed(1)}%` : "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type MiniColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
};

/**
 * Small fixed-order table for card bodies, where sorting and column picking
 * add nothing. Sits flush with the card edges and scrolls past 28rem.
 */
export function MiniTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: MiniColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
}) {
  return (
    <div className={cn(FLUSH, "max-h-[28rem] overflow-auto")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => (
              <th key={c.header} className={cn("font-medium uppercase text-ink-faint", c.align === "right" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-ink-faint">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/[0.04] text-ink-muted last:border-0">
                {columns.map((c) => (
                  <td key={c.header} className={cn(c.align === "right" && "text-right num")}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
