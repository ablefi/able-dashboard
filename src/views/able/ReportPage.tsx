"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Empty from "@/components/ui/Empty";
import { SERIES, TOOLTIP_STYLE } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";

export const CHART_HEIGHT = 260;
const DEFAULT_REFRESH_MS = 5 * 60_000;

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
    <div className="space-y-5">
      <PageHeader
        title={title}
        subtitle={updated}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {data ? (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>{children(data)}</div>
      ) : (
        !error && (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading report…
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
      {value} <span className="text-sm font-medium text-ink-faint">{unit}</span>
    </>
  );
}

/** Fixed-height chart well holding a compact empty state. */
export function ChartEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ height: CHART_HEIGHT }}>
      <Empty compact title={title} description={description} />
    </div>
  );
}

/**
 * Share-of-total donut with a legend list. Slices past the palette fold into
 * "Other" so colours never repeat; the list still names every row and its value.
 */
export function Donut({
  rows,
  format,
}: {
  rows: { name: string; value: number }[];
  format: (n: number) => string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = SERIES.length;
  const slices =
    rows.length > max
      ? [...rows.slice(0, max - 1), { name: "Other", value: rows.slice(max - 1).reduce((s, r) => s + r.value, 0) }]
      : rows;
  const colourAt = (i: number) => SERIES[Math.min(i, slices.length - 1)];

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="w-full sm:w-1/2" style={{ height: CHART_HEIGHT }}>
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
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colourAt(i) }} />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{r.name}</span>
            <span className="shrink-0 text-ink num">{format(r.value)}</span>
            <span className="w-10 shrink-0 text-right text-ink-faint num">{total > 0 ? `${Math.round((r.value / total) * 100)}%` : "-"}</span>
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

/** Small fixed-order table for card bodies, where sorting and column picking add nothing. */
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
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => (
              <th
                key={c.header}
                className={cn("px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint", c.align === "right" ? "text-right" : "text-left")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-6 text-center text-sm text-ink-faint">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/[0.04] text-ink-muted last:border-0">
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-5 py-2.5", c.align === "right" && "text-right num")}>
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
