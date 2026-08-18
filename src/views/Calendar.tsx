"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DayCreator = { id: string; name: string; profile_image_url: string | null; slug: string };
interface CalendarData {
  month: string; label: string; prev: string; next: string;
  totalPosts: number; totalCreators: number;
  days: Record<string, DayCreator[]>;
}
interface GridCell { day: number; inMonth: boolean; iso: string; creators: DayCreator[] }

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildGrid(monthStr: string, days: Record<string, DayCreator[]>): GridCell[] {
  const [y, m] = monthStr.split("-").map((n) => parseInt(n, 10));
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - firstWeekday));
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    cells.push({ day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1, iso, creators: days[iso] ?? [] });
  }
  return cells;
}

export default function Calendar() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creators/calendar?month=${month}`, { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const cells = data ? buildGrid(data.month, data.days) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => data && setMonth(data.prev)} disabled={!data} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-jp-navy-card/50 text-ink-muted transition-colors hover:border-jp-blue/30 hover:text-ink disabled:opacity-40" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[150px] text-center">
            <div className="text-base font-semibold text-ink">{data?.label ?? "…"}</div>
            {data && <div className="text-[11px] text-ink-faint">{data.totalPosts} post{data.totalPosts === 1 ? "" : "s"} · {data.totalCreators} creator{data.totalCreators === 1 ? "" : "s"}</div>}
          </div>
          <button onClick={() => data && setMonth(data.next)} disabled={!data} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-jp-navy-card/50 text-ink-muted transition-colors hover:border-jp-blue/30 hover:text-ink disabled:opacity-40" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading calendar…</div>
      ) : (
        <div className={cn("overflow-hidden rounded-xl border border-white/[0.08] bg-jp-navy-card/30", loading && "opacity-60 transition-opacity")}>
          <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.02]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => (
              <div key={i} className={cn("min-h-[140px] border-b border-r border-white/[0.04] p-2.5 last:border-r-0", cell.inMonth ? "bg-transparent" : "bg-white/[0.015] opacity-50")}>
                <div className={cn("text-[11px] font-medium", cell.inMonth ? "text-ink-muted" : "text-ink-faint/60")}>{cell.day}</div>
                {cell.creators.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cell.creators.map((c) => (
                      <Link key={c.id} href={`/creators/${c.slug}`} title={`${c.name} — posted ${cell.iso}`} className="block transition-transform hover:scale-110">
                        <DayAvatar name={c.name} src={c.profile_image_url} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayAvatar({ name, src }: { name: string; src: string | null }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={() => setErr(true)} className="h-7 w-7 rounded-full object-cover ring-1 ring-white/[0.08]" />;
  }
  return <div className="flex h-7 w-7 items-center justify-center rounded-full bg-jp-blue/15 text-[10px] font-semibold text-jp-blue-light ring-1 ring-white/[0.08]">{name.charAt(0).toUpperCase()}</div>;
}
