"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import { fmtCompact } from "@/components/creators/PostBits";
import { fmtInt } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  fmtDayUtc,
  platformLabel,
  postState,
  todayUtc,
  updatedLabel,
  type CreatorReportPost,
  type CreatorsReport,
} from "./creatorTypes";

/** The API's REPORT_POST_DAYS: older posts are not in the report. */
const REPORT_DAYS = 90;
const CHIPS_PER_DAY = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const selectCls =
  "rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 py-1 text-xs text-ink focus:border-app-blue/45 focus:outline-none";

type Month = { y: number; m: number }; // m is 0-11, UTC

const monthKey = ({ y, m }: Month) => `${y}-${String(m + 1).padStart(2, "0")}`;
const shift = ({ y, m }: Month, by: number): Month => {
  const d = new Date(Date.UTC(y, m + by, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
};
const monthLabel = ({ y, m }: Month) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function currentMonth(): Month {
  const d = new Date();
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}

/** Mon-start weeks covering the month; null pads the days outside it. */
function monthCells({ y, m }: Month): Array<string | null> {
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${monthKey({ y, m })}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function PostChip({ post, creatorName }: { post: CreatorReportPost; creatorName: string }) {
  const state = postState(post);
  const counted = post.counts;
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${creatorName}, ${platformLabel(post.platform)}, ${fmtInt(post.viewCount)} views. ${state}.${post.caption.trim() ? ` ${post.caption.trim().slice(0, 140)}` : ""}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] leading-tight ring-1 transition-colors",
        counted
          ? "bg-app-green/10 text-ink ring-app-green/25 hover:bg-app-green/20"
          : "bg-white/[0.02] text-ink-faint ring-white/[0.06] hover:text-ink-muted",
        post.excluded && "line-through",
      )}
    >
      <span className="shrink-0 scale-90">
        <PlatformPill platform={post.platform} />
      </span>
      <span className="min-w-0 flex-1 truncate">{creatorName}</span>
      <span className="num shrink-0">{post.community ? "-" : fmtCompact(post.viewCount)}</span>
    </a>
  );
}

export default function CreatorCalendar() {
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const [month, setMonth] = useState<Month>(currentMonth);
  const [creatorId, setCreatorId] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const byId = useMemo(() => new Map((data?.creators ?? []).map((c) => [c.id, c])), [data]);
  const activeCreator = creatorId && byId.has(creatorId) ? creatorId : "";
  const key = monthKey(month);

  // Posts in the viewed month by UTC posted day, counted first then by views.
  const { byDay, totals } = useMemo(() => {
    const byDay = new Map<string, CreatorReportPost[]>();
    const totals = { posts: 0, counted: 0, views: 0 };
    for (const p of data?.posts ?? []) {
      if (activeCreator && p.creatorId !== activeCreator) continue;
      const day = p.postedAt.slice(0, 10);
      if (day.slice(0, 7) !== key) continue;
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(p);
      totals.posts++;
      if (p.counts) {
        totals.counted++;
        totals.views += p.viewCount;
      }
    }
    for (const list of byDay.values()) list.sort((a, b) => Number(b.counts) - Number(a.counts) || b.viewCount - a.viewCount);
    return { byDay, totals };
  }, [data, activeCreator, key]);

  const cells = useMemo(() => monthCells(month), [month]);
  const today = todayUtc();
  const isCurrent = key === monthKey(currentMonth());
  const cutoffDay = data ? new Date(Date.parse(data.generatedAt) - REPORT_DAYS * 86_400_000).toISOString().slice(0, 10) : null;
  const olderThanReport = cutoffDay != null && `${key}-01` < cutoffDay;

  const toggleDay = (day: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Calendar"
        subtitle={updatedLabel(at)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-sm text-app-red-text">{error}</div>}

      {!data ? (
        loading || !error ? (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading posts…
          </div>
        ) : null
      ) : (
        <Card
          className={cn("transition-opacity", loading && "opacity-60")}
          bodyClassName="p-0"
          title={
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span>{monthLabel(month)}, posts by UTC day posted</span>
              <span className="num normal-case tracking-normal text-ink-muted">
                {fmtInt(totals.posts)} posts, {fmtInt(totals.counted)} counted, {fmtInt(totals.views)} counted views
              </span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Filter by creator" className={selectCls} value={activeCreator} onChange={(e) => setCreatorId(e.target.value)}>
                <option value="">All creators</option>
                {data.creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 px-0" aria-label="Previous month" title="Previous month" onClick={() => setMonth((m) => shift(m, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isCurrent} onClick={() => setMonth(currentMonth())}>
                  This month
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 px-0"
                  aria-label="Next month"
                  title="Next month"
                  disabled={isCurrent}
                  onClick={() => setMonth((m) => shift(m, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <div className="grid min-w-[52rem] grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div key={d} className="border-b border-white/[0.06] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} className="min-h-[6.5rem] border-b border-r border-white/[0.04] bg-white/[0.01]" />;
                const posts = byDay.get(day) ?? [];
                const open = expanded.has(day);
                const shown = open ? posts : posts.slice(0, CHIPS_PER_DAY);
                const views = posts.reduce((n, p) => n + (p.counts ? p.viewCount : 0), 0);
                const isToday = day === today;
                const beforeReport = cutoffDay != null && day < cutoffDay;
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex min-h-[6.5rem] min-w-0 flex-col gap-0.5 border-b border-r border-white/[0.04] p-1",
                      isToday && "bg-app-blue/[0.06] ring-1 ring-inset ring-app-blue/30",
                      beforeReport && "bg-white/[0.01]",
                    )}
                  >
                    <div className="flex items-center justify-between px-0.5 text-[11px]">
                      <span className={cn("num", isToday ? "font-semibold text-app-blue-light" : "text-ink-faint")}>{Number(day.slice(8))}</span>
                      {views > 0 && (
                        <span className="num text-[10px] text-ink-faint" title={`${fmtInt(views)} counted views on posts from ${fmtDayUtc(day)}`}>
                          {fmtCompact(views)}
                        </span>
                      )}
                    </div>
                    {shown.map((p) => (
                      <PostChip key={p.id} post={p} creatorName={byId.get(p.creatorId)?.name ?? "Unknown"} />
                    ))}
                    {posts.length > CHIPS_PER_DAY && (
                      <button
                        type="button"
                        onClick={() => toggleDay(day)}
                        className="px-1 text-left text-[11px] text-ink-faint transition-colors hover:text-app-blue-light"
                      >
                        {open ? "Show less" : `+${posts.length - CHIPS_PER_DAY} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-3 py-2 text-[11px] leading-snug text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-app-green/20 ring-1 ring-app-green/30" /> Counted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-white/[0.04] ring-1 ring-white/[0.08]" /> Not counted: pending, excluded (struck through) or community
            </span>
            <span>Figures on chips are latest scraped views.</span>
            {olderThanReport && cutoffDay && <span>The report carries only the last 90 days of posts, so days before {fmtDayUtc(cutoffDay)} show none.</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
