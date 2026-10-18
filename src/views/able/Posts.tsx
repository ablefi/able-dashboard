"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import DataTable, { ColumnsButton, useTablePrefs, type Column } from "@/components/ui/DataTable";
import { PlatformBadge } from "@/components/creators/PlatformBadge";
import { fmtCompact } from "@/components/creators/PostBits";
import { STAT_NEUTRAL } from "@/lib/statColors";
import { ACCENT, CHART, TOOLTIP_STYLE, axisProps, fmtInt, fmtUsd } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  fmtDayUtc,
  platformLabel,
  updatedLabel,
  type CreatorReportPost,
  type CreatorRow,
  type CreatorsReport,
} from "./creatorTypes";

const CHART_H = 280;

/** Scraped, not approved, not excluded, and approval decides whether it counts. */
const isPending = (p: CreatorReportPost) => !p.approved && !p.excluded && !p.counts && !p.community;

function CountsBadges({ post }: { post: CreatorReportPost }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {post.excluded ? (
        <Badge>Excluded</Badge>
      ) : post.counts ? (
        <Badge variant="success">Counted</Badge>
      ) : post.community ? (
        <Badge>Community</Badge>
      ) : (
        <Badge variant="warning">Pending</Badge>
      )}
      {post.approved && <Badge variant="info">Approved</Badge>}
    </div>
  );
}

function buildColumns(byId: Map<string, CreatorRow>): Column<CreatorReportPost>[] {
  const creatorName = (p: CreatorReportPost) => byId.get(p.creatorId)?.name ?? p.creatorId;
  return [
    { key: "posted", header: "Posted", width: 130, sortValue: (p) => p.postedAt, cell: (p) => fmtDayUtc(p.postedAt) },
    { key: "creator", header: "Creator", width: 170, sortValue: (p) => creatorName(p).toLowerCase(), cell: (p) => <span className="text-ink">{creatorName(p)}</span> },
    {
      key: "platform",
      header: "Platform",
      width: 130,
      sortValue: (p) => p.platform,
      cell: (p) => <PlatformBadge platform={p.platform} size="sm" url={p.url} creatorType={byId.get(p.creatorId)?.kind} />,
    },
    {
      key: "caption",
      header: "Caption",
      width: 360,
      hideable: false,
      cell: (p) => {
        const caption = p.caption.trim();
        return (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            title={caption || `Open on ${platformLabel(p.platform)}`}
            className={cn("transition-colors hover:text-app-blue-light", caption ? "text-ink-muted" : "text-ink-faint")}
          >
            {caption || "(no caption)"}
          </a>
        );
      },
    },
    { key: "views", header: "Views", width: 100, align: "right", sortValue: (p) => p.viewCount, cell: (p) => <span className="num">{fmtInt(p.viewCount)}</span> },
    { key: "likes", header: "Likes", width: 100, align: "right", sortValue: (p) => p.likeCount, cell: (p) => <span className="num">{fmtInt(p.likeCount)}</span> },
    { key: "comments", header: "Comments", width: 110, align: "right", sortValue: (p) => p.commentCount, cell: (p) => <span className="num">{fmtInt(p.commentCount)}</span> },
    {
      key: "counts",
      header: "Counts",
      width: 170,
      sortValue: (p) => (p.excluded ? 3 : p.counts ? 0 : p.community ? 2 : 1),
      cell: (p) => <CountsBadges post={p} />,
    },
  ];
}

const viewsTooltip = (v: number) => [fmtInt(v), "Counted views"];

export default function Posts() {
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const [creatorId, setCreatorId] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  const byId = useMemo(() => new Map((data?.creators ?? []).map((c) => [c.id, c])), [data]);
  const columns = useMemo(() => buildColumns(byId), [byId]);
  const prefs = useTablePrefs("able-creator-posts", columns);

  // A creator removed since the filter was picked falls back to all creators.
  const activeCreator = creatorId && byId.has(creatorId) ? creatorId : "";
  const allPosts = useMemo(() => data?.posts ?? [], [data]);
  const rows = useMemo(
    () => allPosts.filter((p) => (!activeCreator || p.creatorId === activeCreator) && (!pendingOnly || isPending(p))),
    [allPosts, activeCreator, pendingOnly],
  );

  const viewSeries = useMemo(
    () => (data?.viewSeries ?? []).map((d) => ({ label: fmtDayUtc(d.date, { year: false }), full: fmtDayUtc(d.date), views: d.views })),
    [data],
  );
  const weekly = useMemo(
    () => (data?.weeklyViews ?? []).map((w) => ({ label: fmtDayUtc(w.weekStart, { year: false }), full: `Week of ${fmtDayUtc(w.weekStart)}`, views: w.views, posts: w.posts })),
    [data],
  );
  const platforms = useMemo(
    () => (data?.platforms ?? []).map((p) => ({ label: platformLabel(p.platform), views: p.views, posts: p.posts })),
    [data],
  );
  const hasSeries = viewSeries.some((d) => d.views > 0);
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Posts"
        subtitle={updatedLabel(at)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {!data || !t ? (
        loading || !error ? (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading posts…
          </div>
        ) : null
      ) : (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <FinCard label="Counted views" valueClass={STAT_NEUTRAL} note="Last 90 days, counted posts only">
              {fmtInt(t.countedViews)}
            </FinCard>
            <FinCard label="Counted posts" valueClass={STAT_NEUTRAL} note={`${fmtInt(allPosts.length)} scraped in total`}>
              {fmtInt(t.countedPosts)}
            </FinCard>
            <FinCard
              label="Pending decisions"
              valueClass={t.pendingPosts ? "text-app-orange" : STAT_NEUTRAL}
              note={t.pendingPosts ? "Waiting for an operator to approve or exclude" : "Nothing waiting"}
            >
              {fmtInt(t.pendingPosts)}
            </FinCard>
            <FinCard label="CPM" valueClass={STAT_NEUTRAL} note="Fees per thousand counted views, USD">
              {fmtUsd(t.cpmUsd, 2)}
            </FinCard>
          </div>

          <Card title="Counted views, last 30 days (each post's latest count carried forward)" className="chart-card">
            {hasSeries ? (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={viewSeries} margin={{ top: 6, right: 10, bottom: 0, left: 6 }}>
                  <defs>
                    <linearGradient id="ablePostsViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                  <YAxis {...axisProps} tickFormatter={fmtCompact} width={56} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    cursor={{ stroke: CHART.tick, strokeDasharray: "3 3" }}
                    labelFormatter={(_: unknown, items: Array<{ payload?: { full?: string } }>) => items?.[0]?.payload?.full ?? ""}
                    formatter={viewsTooltip}
                  />
                  <Area type="monotone" dataKey="views" stroke={ACCENT} strokeWidth={2} fill="url(#ablePostsViews)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: CHART_H }}>
                <Empty compact title="No counted views yet" description="Views appear once a counted post has been scraped." />
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Counted views by week posted" className="chart-card">
              {weekly.length ? (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={weekly} margin={{ top: 6, right: 10, bottom: 0, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={12} />
                    <YAxis {...axisProps} tickFormatter={fmtCompact} width={56} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={(_: unknown, items: Array<{ payload?: { full?: string; posts?: number } }>) => {
                        const p = items?.[0]?.payload;
                        return p ? `${p.full}, ${fmtInt(p.posts)} posts` : "";
                      }}
                      formatter={viewsTooltip}
                    />
                    <Bar dataKey="views" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: CHART_H }}>
                  <Empty compact title="No counted posts yet" />
                </div>
              )}
            </Card>

            <Card title="Counted views by platform" className="chart-card">
              {platforms.length ? (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={platforms} layout="vertical" margin={{ top: 6, right: 16, bottom: 0, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                    <XAxis type="number" {...axisProps} tickFormatter={fmtCompact} />
                    <YAxis dataKey="label" type="category" {...axisProps} width={80} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={(label: string, items: Array<{ payload?: { posts?: number } }>) => {
                        const posts = items?.[0]?.payload?.posts;
                        return posts == null ? label : `${label}, ${fmtInt(posts)} posts`;
                      }}
                      formatter={viewsTooltip}
                    />
                    <Bar dataKey="views" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: CHART_H }}>
                  <Empty compact title="No counted posts yet" />
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Scraped posts, last 90 days"
            bodyClassName="p-0"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter by creator"
                  className="rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-app-blue/45 focus:outline-none"
                  value={activeCreator}
                  onChange={(e) => setCreatorId(e.target.value)}
                >
                  <option value="">All creators</option>
                  {data.creators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                  Pending decision only
                </label>
                <ColumnsButton columns={columns} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />
              </div>
            }
          >
            {rows.length ? (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(p) => p.id}
                hidden={prefs.hidden}
                widths={prefs.widths}
                setWidths={prefs.setWidths}
                defaultSort={{ key: "posted", dir: "desc" }}
              />
            ) : (
              <Empty compact title={allPosts.length ? "No posts match the filter" : "No posts scraped yet"} />
            )}
            <div className="space-y-1.5 border-t border-white/[0.06] px-5 py-4 text-xs leading-relaxed text-ink-faint">
              <p>
                A post is approved automatically when its caption mentions one of our accounts. An operator can approve other
                posts as sponsored work for us, or exclude a post to keep it out for good, whatever later scrapes say. Community
                posts on YouTube have no view count and never count.
              </p>
              <p>Post decisions are made by an operator with the API admin token.</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
