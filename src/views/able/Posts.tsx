"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { ACCENT, CHART, CHART_H, TOOLTIP_STYLE, axisProps, fmtInt, fmtUsd } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useCreatorEditor } from "./CreatorForm";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  OUTLIER_RULE,
  PLATFORM_LABEL,
  fmtDayUtc,
  isPendingPost,
  medianViewsByCreator,
  outlierMultiple,
  platformLabel,
  updatedLabel,
  type CreatorReportPost,
  type CreatorRow,
  type CreatorsReport,
  type PostFlagAction,
  type PostPlatform,
} from "./creatorTypes";

export function CountsBadges({ post }: { post: CreatorReportPost }) {
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

const actionBtn = "h-6 rounded-lg px-2 text-[11px]";

function PostActions({
  post,
  busy,
  onFlag,
}: {
  post: CreatorReportPost;
  busy: boolean;
  onFlag: (post: CreatorReportPost, action: PostFlagAction) => void;
}) {
  if (busy) return <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" aria-label="Saving" />;
  if (post.excluded) {
    return (
      <Button variant="ghost" size="sm" className={actionBtn} onClick={() => onFlag(post, "restore")} title="Bring the post back under the counting rules">
        Restore
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {post.approved ? (
        <Button variant="ghost" size="sm" className={actionBtn} onClick={() => onFlag(post, "unapprove")}>
          Unapprove
        </Button>
      ) : (
        <Button variant="secondary" size="sm" className={actionBtn} onClick={() => onFlag(post, "approve")} title="Count it as sponsored work for us">
          Approve
        </Button>
      )}
      <Button variant="ghost" size="sm" className={actionBtn} onClick={() => onFlag(post, "exclude")} title="Keep it out for good, whatever later scrapes say">
        Exclude
      </Button>
    </div>
  );
}

/** Post table columns shared by the Posts page and a creator's page. */
export function buildPostColumns({
  byId,
  medians,
  showCreator = true,
  edit,
}: {
  byId: Map<string, CreatorRow>;
  medians: Map<string, number>;
  showCreator?: boolean;
  /** Present when the viewer may make post decisions. */
  edit?: { busy: ReadonlySet<string>; onFlag: (post: CreatorReportPost, action: PostFlagAction) => void };
}): Column<CreatorReportPost>[] {
  const creatorName = (p: CreatorReportPost) => byId.get(p.creatorId)?.name ?? p.creatorId;
  const cols: Column<CreatorReportPost>[] = [
    { key: "posted", header: "Posted", width: 105, sortValue: (p) => p.postedAt, cell: (p) => fmtDayUtc(p.postedAt) },
  ];
  if (showCreator) {
    cols.push({
      key: "creator",
      header: "Creator",
      width: 150,
      sortValue: (p) => creatorName(p).toLowerCase(),
      cell: (p) =>
        byId.has(p.creatorId) ? (
          <Link href={`/creators/${encodeURIComponent(p.creatorId)}`} className="text-ink transition-colors hover:text-app-blue-light">
            {creatorName(p)}
          </Link>
        ) : (
          <span className="text-ink">{creatorName(p)}</span>
        ),
    });
  }
  cols.push(
    {
      key: "platform",
      header: "Platform",
      width: 115,
      sortValue: (p) => p.platform,
      cell: (p) => <PlatformBadge platform={p.platform} size="sm" url={p.url} creatorType={byId.get(p.creatorId)?.kind} />,
    },
    {
      key: "caption",
      header: "Caption",
      width: 340,
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
    {
      key: "views",
      header: "Views",
      width: 120,
      align: "right",
      sortValue: (p) => p.viewCount,
      cell: (p) => {
        const x = outlierMultiple(p, medians);
        return (
          <span className="inline-flex items-center gap-1.5">
            {x != null && (
              <span className="rounded bg-app-orange/15 px-1 text-[10px] font-medium text-app-orange" title={`${x.toFixed(1)} times this creator's median views. ${OUTLIER_RULE}`}>
                {x.toFixed(1)}x
              </span>
            )}
            <span className="num">{fmtInt(p.viewCount)}</span>
          </span>
        );
      },
    },
    { key: "likes", header: "Likes", width: 85, align: "right", sortValue: (p) => p.likeCount, cell: (p) => <span className="num">{fmtInt(p.likeCount)}</span> },
    { key: "comments", header: "Comments", width: 95, align: "right", sortValue: (p) => p.commentCount, cell: (p) => <span className="num">{fmtInt(p.commentCount)}</span> },
    {
      key: "counts",
      header: "Counts",
      width: 150,
      sortValue: (p) => (p.excluded ? 3 : p.counts ? 0 : p.community ? 2 : 1),
      cell: (p) => <CountsBadges post={p} />,
    },
  );
  if (edit) {
    cols.push({
      key: "actions",
      header: "Decision",
      width: 165,
      clip: false,
      hideable: false,
      cell: (p) => <PostActions post={p} busy={edit.busy.has(p.id)} onFlag={edit.onFlag} />,
    });
  }
  return cols;
}

const viewsTooltip = (v: number) => [fmtInt(v), "Counted views"];
const selectCls =
  "rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 py-1 text-xs text-ink focus:border-app-blue/45 focus:outline-none";
const PLATFORMS = Object.keys(PLATFORM_LABEL) as PostPlatform[];

export default function Posts() {
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const canEdit = useAuth().can("creators:write");
  const editor = useCreatorEditor({ report: data, refresh });
  const [creatorId, setCreatorId] = useState("");
  const [platform, setPlatform] = useState<"" | PostPlatform>("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [outliersOnly, setOutliersOnly] = useState(false);

  const byId = useMemo(() => new Map((data?.creators ?? []).map((c) => [c.id, c])), [data]);
  const allPosts = useMemo(() => data?.posts ?? [], [data]);
  const medians = useMemo(() => medianViewsByCreator(allPosts), [allPosts]);
  const { setPostFlag, postBusy } = editor;
  const columns = useMemo(
    () =>
      buildPostColumns({
        byId,
        medians,
        edit: canEdit ? { busy: postBusy, onFlag: (p, a) => void setPostFlag(p, a) } : undefined,
      }),
    [byId, medians, canEdit, postBusy, setPostFlag],
  );
  const prefs = useTablePrefs("able-creator-posts", columns);

  // A creator removed since the filter was picked falls back to all creators.
  const activeCreator = creatorId && byId.has(creatorId) ? creatorId : "";
  const rows = useMemo(
    () =>
      allPosts.filter(
        (p) =>
          (!activeCreator || p.creatorId === activeCreator) &&
          (!platform || p.platform === platform) &&
          (!pendingOnly || isPendingPost(p)) &&
          (!outliersOnly || outlierMultiple(p, medians) != null),
      ),
    [allPosts, activeCreator, platform, pendingOnly, outliersOnly, medians],
  );
  const outlierCount = useMemo(() => allPosts.filter((p) => outlierMultiple(p, medians) != null).length, [allPosts, medians]);

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
    <div className="space-y-3">
      <PageHeader
        title="Posts"
        subtitle={updatedLabel(at)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-sm text-app-red-text">{error}</div>}

      {!data || !t ? (
        loading || !error ? (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading posts…
          </div>
        ) : null
      ) : (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          <div className="app-stat-grid grid">
            <FinCard label="Counted views" valueClass={STAT_NEUTRAL} note="Counted posts, last 90 days">
              {fmtInt(t.countedViews)}
            </FinCard>
            <FinCard label="Counted posts" valueClass={STAT_NEUTRAL} note="Last 90 days">
              {fmtInt(t.countedPosts)}
            </FinCard>
            <FinCard label="Scraped posts" valueClass={STAT_NEUTRAL} note="Last 90 days, any decision">
              {fmtInt(allPosts.length)}
            </FinCard>
            <FinCard label="Pending decisions" valueClass={t.pendingPosts ? "text-app-orange" : STAT_NEUTRAL} note={t.pendingPosts ? "Approve or exclude" : "Nothing waiting"}>
              {fmtInt(t.pendingPosts)}
            </FinCard>
            <FinCard label="Outliers" valueClass={STAT_NEUTRAL} note="3x or more the creator's median views">
              {fmtInt(outlierCount)}
            </FinCard>
            <FinCard label="CPM" valueClass={STAT_NEUTRAL} note="USD fees per 1,000 counted views">
              {fmtUsd(t.cpmUsd, 2)}
            </FinCard>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Counted views, last 30 UTC days" className="chart-card">
              {hasSeries ? (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <AreaChart data={viewSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="ablePostsViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                    <YAxis {...axisProps} tickFormatter={fmtCompact} width={44} />
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

            <Card title="Counted views by week posted" className="chart-card">
              {weekly.length ? (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={weekly} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={12} />
                    <YAxis {...axisProps} tickFormatter={fmtCompact} width={44} />
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
                  <BarChart data={platforms} layout="vertical" margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                    <XAxis type="number" {...axisProps} tickFormatter={fmtCompact} />
                    <YAxis dataKey="label" type="category" {...axisProps} width={72} />
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
            title={`Scraped posts, last 90 days (${fmtInt(rows.length)} shown)`}
            bodyClassName="p-0"
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
                <select aria-label="Filter by platform" className={selectCls} value={platform} onChange={(e) => setPlatform(e.target.value as "" | PostPlatform)}>
                  <option value="">All platforms</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABEL[p]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                  Pending only
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink-muted" title={OUTLIER_RULE}>
                  <input type="checkbox" checked={outliersOnly} onChange={(e) => setOutliersOnly(e.target.checked)} />
                  Outliers
                </label>
                <ColumnsButton columns={columns} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />
              </div>
            }
          >
            {rows.length ? (
              <DataTable
                className="max-h-[32rem]"
                columns={columns}
                rows={rows}
                rowKey={(p) => p.id}
                hidden={prefs.hidden}
                widths={prefs.widths}
                setWidths={prefs.setWidths}
                defaultSort={{ key: "posted", dir: "desc" }}
              />
            ) : (
              <Empty compact title={allPosts.length ? "No posts match the filters" : "No posts scraped yet"} />
            )}
            <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] leading-snug text-ink-faint">
              A caption that @mentions one of our accounts approves the post automatically. Approve marks other posts as sponsored
              work; Exclude keeps a post out for good. YouTube community posts have no views and never count.
            </p>
          </Card>
        </div>
      )}
      {editor.dialogs}
    </div>
  );
}
