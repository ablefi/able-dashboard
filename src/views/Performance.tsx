"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Tabs from "@/components/ui/Tabs";
import { Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Empty from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import type { PerformanceStats, Granularity } from "@/lib/creators";
import { readCache, writeCache } from "@/lib/swrCache";
import { resolveTimeframe } from "@/lib/timeframe";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { useCreatorTimeframe } from "@/components/creators/useCreatorTimeframe";
import { useAttribution } from "@/components/creators/attribution";
import { creatorApi } from "@/lib/creatorMarketClient";

const CHART = { grid: "rgba(255,255,255,0.05)", tick: "#8499b3" };
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#15203a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px" },
  labelStyle: { color: "#f0f4f8" },
  itemStyle: { color: "#f0f4f8" },
};
const PLATFORM_COLOR: Record<string, string> = { instagram: "#e1306c", tiktok: "#22d3ee", youtube: "#ef4444" };
const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const fmtCompact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const inputCls = "rounded-lg border border-white/[0.08] bg-app-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none";

/** `accent` is kept in the signature so call sites don't all need editing,
 *  but it no longer paints: counts are ink like everywhere else. */
function Stat({ label, value, hint, title }: { label: string; value: string; accent?: boolean; hint?: string; title?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-3" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold num text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-ink-faint">{hint}</div>}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-5", className)}>{children}</div>;
}

export default function Performance({ scope = "counted" }: { scope?: "counted" | "all" }) {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all");
  const [creatorType, setCreatorType] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [boardSort, setBoardSort] = useState<"views" | "installs" | "revenue">("views");
  const { data: attribution } = useAttribution();
  const [tf, setTf] = useCreatorTimeframe();

  const cacheKey = useMemo(
    () => `creators-perf:${scope}:${platform}:${creatorType}:${granularity}:${tf.key}:${tf.from ?? ""}:${tf.to ?? ""}`,
    [scope, platform, creatorType, granularity, tf]
  );

  // Instant paint from cache, then revalidate (overwrites on success).
  useEffect(() => {
    const cached = readCache<PerformanceStats>(cacheKey);
    setStats(cached ? cached.data : null);
  }, [cacheKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fromISO, toISO } = resolveTimeframe(tf);
      const p = new URLSearchParams({ platform, creator_type: creatorType, granularity, from: fromISO, to: toISO, scope });
      const res = await fetch(creatorApi(`/api/creators/performance?${p}`), { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      const s = (await res.json()) as PerformanceStats;
      setStats(s);
      writeCache(cacheKey, s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [platform, creatorType, granularity, tf, scope, cacheKey]);

  useEffect(() => { load(); }, [load]);

  const granLabel = granularity === "week" ? "Weekly" : granularity === "month" ? "Monthly" : "Daily";
  const tfLabel = resolveTimeframe(tf).label;
  const forUs = scope === "counted";

  /**
   * Installs per thousand views.
   *
   * Deliberately a feel-for-it number, not attribution: the installs are the
   * app's total for the window from RevenueCat, so paid, organic and word of
   * mouth are all in there. Narrowing the views by platform or creator type
   * shrinks the denominator while installs stay whole, which inflates it — so
   * that case is called out rather than quietly shown.
   */
  /**
   * The leaderboard: view counts joined to onboarding attribution.
   *
   * Sorting by installs or revenue drops creators with none, because a table
   * of zeroes ordered arbitrarily reads as a ranking when it is not one.
   * Sorting by views keeps everybody, which is the old behaviour.
   */
  const board = useMemo(() => {
    const byId = new Map((attribution?.creators ?? []).map((a) => [a.creatorId, a]));
    const rows = (stats?.top_creators ?? []).map((c) => {
      const a = byId.get(c.id);
      return { ...c, installs: a?.downloads ?? 0, payers: a?.payers ?? 0, revenue: a?.revenue ?? 0 };
    });
    if (boardSort === "views") return rows.sort((x, y) => y.views - x.views);
    if (boardSort === "installs") return rows.filter((r) => r.installs > 0).sort((x, y) => y.installs - x.installs || y.views - x.views);
    return rows.filter((r) => r.revenue > 0).sort((x, y) => y.revenue - x.revenue || y.installs - x.installs);
  }, [stats, attribution, boardSort]);

  const filtered = platform !== "all" || creatorType !== "all";
  const ipm =
    stats?.installs == null || !stats.total_views ? null : (stats.installs / stats.total_views) * 1000;

  return (
    <div className="space-y-4">
      <PageHeader
        title={forUs ? "Performance" : "General Creative Performance"}
        subtitle={
          (forUs
            ? "Our posts, counted (approved) posts only. "
            : "GCP, every post they made, approved or not: the general baseline. ") +
          (stats ? `${platform === "all" ? "All platforms" : platform} · ${tfLabel.toLowerCase()} · ${granLabel.toLowerCase()} buckets` : "")
        }
        actions={<TimeframeFilter value={tf} onChange={setTf} />}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
        </select>
        <select className={inputCls} value={creatorType} onChange={(e) => setCreatorType(e.target.value)}>
          <option value="all">All creators</option>
          <option value="influencer">Influencers</option>
          <option value="daily_ugc">Daily UGC</option>
          <option value="youtuber">YouTubers</option>
        </select>
        <Tabs
          size="sm"
          active={granularity}
          onChange={(g) => setGranularity(g as Granularity)}
          tabs={(["day", "week", "month"] as Granularity[]).map((g) => ({ key: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))}
        />
      </div>

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading performance…</div>
      ) : !stats ? null : (
        <div className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4 transition-opacity"}>
          {/* Stat row */}
          <div className={cn("grid grid-cols-2 gap-3", stats.total_community_posts > 0 ? "md:grid-cols-4 xl:grid-cols-7" : "md:grid-cols-3 xl:grid-cols-6")}>
            <Stat label="Total views" value={fmtCompact(stats.total_views)} accent />
            <Stat label={forUs ? "Counted posts" : "Total posts"} value={stats.total_posts.toString()} />
            {stats.total_community_posts > 0 && <Stat label={forUs ? "Counted CP" : "Community posts"} value={stats.total_community_posts.toString()} accent />}
            <Stat label="Total likes" value={fmtCompact(stats.total_likes)} />
            <Stat label="Total comments" value={fmtCompact(stats.total_comments)} />
            <Stat label="Active creators" value={stats.active_creators.toString()} />
            <Stat
              label="Installs / 1k views"
              value={ipm == null ? "-" : ipm.toFixed(2)}
              accent
              hint={filtered ? "views are filtered, installs aren't" : stats.installs != null ? `${fmtCompact(stats.installs)} installs` : undefined}
              title={
                filtered
                  ? "Installs are the app total and can't be filtered by platform or creator type, so this ratio is inflated while a filter is on."
                  : "Total app installs in this window divided by counted views, times 1,000. Installs come from every source, not just creators, it's a rough feel for reach, not attribution."
              }
            />
          </div>

          {stats.total_posts === 0 ? (
            <Empty title="No data in this window" description="Try a longer time range, switch platform, or check that posts have been approved." />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-medium text-ink">{granLabel} views</h3>
                    <span className="text-[11px] uppercase tracking-wider text-ink-faint">Peak {fmtCompact(Math.max(...stats.buckets.map((b) => b.views), 0))}</span>
                  </div>
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={stats.buckets} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
                        <defs>
                          <linearGradient id="perfViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5b8def" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#5b8def" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={44} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtCompact(v), "Views"]} />
                        <Area type="monotone" dataKey="views" stroke="#5b8def" strokeWidth={2} fill="url(#perfViews)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-medium text-ink">{granLabel} posts</h3>
                    <span className="text-[11px] uppercase tracking-wider text-ink-faint">Total {stats.total_posts}</span>
                  </div>
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.buckets} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Posts"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="posts" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <Card>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink">Creator leaderboard</h3>
                    <div className="flex gap-1">
                      {(["views", "installs", "revenue"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setBoardSort(k)}
                          className={
                            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors " +
                            (boardSort === k ? "bg-app-blue/15 text-app-blue-light" : "text-ink-muted hover:text-ink")
                          }
                        >
                          {k === "views" ? "Views" : k === "installs" ? "Installs" : "Revenue"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* One table, three sorts, rather than three leaderboards.
                      The useful signal is where the columns DISAGREE: big views
                      and no attributed revenue sitting next to small views and
                      real payers is the finding, and separate boards hide it.
                      Views come from the timeframe filter above; attribution is
                      all-time since 15 Sep and ignores that filter, which is why
                      the columns are labelled rather than blended into a score. */}
                  {board.length === 0 ? (
                    <p className="text-sm text-ink-faint">No creators have counted posts in this window.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/[0.06] text-left">
                            <th className="py-2 pr-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Creator</th>
                            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Views</th>
                            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Installs</th>
                            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Paid</th>
                            <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {board.slice(0, 15).map((c, i) => (
                            <tr key={c.id} className="border-b border-white/[0.04]">
                              <td className="py-2 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-4 shrink-0 text-[10px] num text-ink-faint">{i + 1}</span>
                                  <Avatar name={c.name} src={c.profile_image_url} />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                                    <div className="text-[10px] text-ink-faint">{c.posts} post{c.posts === 1 ? "" : "s"}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right num text-app-blue-light">{fmtCompact(c.views)}</td>
                              <td className="py-2 pr-3 text-right num text-ink-muted">{c.installs ? c.installs.toLocaleString() : "-"}</td>
                              <td className="py-2 pr-3 text-right num text-ink-muted">{c.payers ? c.payers.toLocaleString() : "-"}</td>
                              <td className="py-2 text-right num font-medium text-app-green">
                                {c.revenue > 0 ? `$${c.revenue < 100 ? c.revenue.toFixed(2) : Math.round(c.revenue).toLocaleString()}` : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[11px] text-ink-faint">
                        Views follow the timeframe above. Installs, paid and revenue are self-reported at onboarding and
                        only exist from 15 September 2026, so a creator who posted before then can look empty without
                        having underperformed.
                      </p>
                    </div>
                  )}
                </Card>

                <Card>
                  <h3 className="mb-3 text-sm font-medium text-ink">Views by platform</h3>
                  {stats.platform.length === 0 ? (
                    <p className="text-sm text-ink-faint">No platform data.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={stats.platform} dataKey="views" nameKey="platform" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                            {stats.platform.map((p) => <Cell key={p.platform} fill={PLATFORM_COLOR[p.platform] || "#5b8def"} />)}
                          </Pie>
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtCompact(v), PLATFORM_LABEL[n] || n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <ul className="mt-3 space-y-1.5">
                        {stats.platform.map((p) => (
                          <li key={p.platform} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p.platform] || "#5b8def" }} />
                            <span className="text-ink-muted">{PLATFORM_LABEL[p.platform] || p.platform}</span>
                            <span className="ml-auto num font-medium text-ink">{fmtCompact(p.views)}</span>
                            <span className="num text-ink-faint">· {p.posts}p</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setErr(true)} className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-app-blue/15 text-[11px] font-semibold text-app-blue-light">{name.charAt(0).toUpperCase()}</div>;
}
