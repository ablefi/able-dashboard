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

const inputCls = "rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-jp-navy-card/40 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold num", accent ? "text-jp-blue-light" : "text-ink")}>{value}</div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-white/[0.06] bg-jp-navy-card/40 p-5", className)}>{children}</div>;
}

export default function Performance({ scope = "counted" }: { scope?: "counted" | "all" }) {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all");
  const [creatorType, setCreatorType] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("day");
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
      const res = await fetch(`/api/creators/performance?${p}`, { headers: authHeaders() });
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

  return (
    <div className="space-y-4">
      <PageHeader
        title={forUs ? "Performance" : "General Creative Performance"}
        subtitle={
          (forUs
            ? "Our posts — counted (approved) posts only. "
            : "GCP — every post they made, approved or not: the general baseline. ") +
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

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading performance…</div>
      ) : !stats ? null : (
        <div className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4 transition-opacity"}>
          {/* Stat row */}
          <div className={cn("grid grid-cols-2 gap-3", stats.total_community_posts > 0 ? "md:grid-cols-6" : "md:grid-cols-5")}>
            <Stat label="Total views" value={fmtCompact(stats.total_views)} accent />
            <Stat label={forUs ? "Counted posts" : "Total posts"} value={stats.total_posts.toString()} />
            {stats.total_community_posts > 0 && <Stat label={forUs ? "Counted CP" : "Community posts"} value={stats.total_community_posts.toString()} accent />}
            <Stat label="Total likes" value={fmtCompact(stats.total_likes)} />
            <Stat label="Total comments" value={fmtCompact(stats.total_comments)} />
            <Stat label="Active creators" value={stats.active_creators.toString()} />
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
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-medium text-ink">Creator leaderboard</h3>
                    <span className="text-[11px] uppercase tracking-wider text-ink-faint">By views</span>
                  </div>
                  {stats.top_creators.length === 0 ? (
                    <p className="text-sm text-ink-faint">No creators have counted posts in this window.</p>
                  ) : (
                    <ul className="divide-y divide-white/[0.06]">
                      {stats.top_creators.slice(0, 10).map((c, i) => (
                        <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jp-navy-light/60 text-[10px] font-semibold num text-ink-muted">{i + 1}</span>
                          <Avatar name={c.name} src={c.profile_image_url} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                              {c.instagram_handle && <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">IG</span>}
                              {c.tiktok_handle && <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">TT</span>}
                              {c.youtube_handle && <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[9px] font-semibold text-ink-muted">YT</span>}
                              <span>· {c.posts} post{c.posts === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold num text-jp-blue-light">{fmtCompact(c.views)}</div>
                            <div className="text-[10px] uppercase tracking-wider text-ink-faint">views</div>
                          </div>
                        </li>
                      ))}
                    </ul>
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
  return <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jp-blue/15 text-[11px] font-semibold text-jp-blue-light">{name.charAt(0).toUpperCase()}</div>;
}
