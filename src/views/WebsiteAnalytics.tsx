"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Empty from "@/components/ui/Empty";
import { STAT_NEUTRAL } from "@/lib/statColors";
import Tabs from "@/components/ui/Tabs";
import { RefreshCw, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { prettyPlace } from "@/lib/countries";
import { CHART, TOOLTIP_STYLE, ACCENT } from "@/lib/chartTheme";

interface PageView {
  path: string;
  referrer: string | null;
  country: string | null;
  device: string | null;
  /** ios | android | other — captured from the User-Agent since 2026-07-19;
   * null on older rows (the UA was never stored, so no retroactive split). */
  os?: string | null;
  created_at: string;
}

type TimeRange = "24h" | "7d" | "30d" | "all";

/** Pages your app links to internally (support, legal). Edit for your site. */
const IN_APP_PATHS = ["/support", "/feedback", "/terms", "/privacy", "/terms-of-service", "/privacy-policy", "/terms-and-privacy"];

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// "2026-09-02" -> "Sep 2, 2026". The year stays in the label: Recharts' XAxis is
// categorical, so a year-less label is the SAME category as that day a year ago.
function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WebsiteAnalytics() {
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [marketingOnly, setMarketingOnly] = useState(true);

  const fetchData = useCallback(async (range: TimeRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/website?range=${range}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      const d = await res.json();
      setPageViews(d.views ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange, fetchData]);

  const stats = useMemo(() => {
    const filtered = marketingOnly ? pageViews.filter((v) => !IN_APP_PATHS.includes(v.path)) : pageViews;
    const totalViews = filtered.length;

    const byPage: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    // iOS/Android split — overall and per page (per creator link). Only rows
    // since os capture shipped carry it; older rows simply don't count here.
    let iosTotal = 0;
    let androidTotal = 0;
    const osByPage: Record<string, { ios: number; android: number }> = {};
    for (const v of filtered) {
      byPage[v.path] = (byPage[v.path] || 0) + 1;
      const country = v.country || "Unknown";
      byCountry[country] = (byCountry[country] || 0) + 1;
      const device = v.device || "unknown";
      byDevice[device] = (byDevice[device] || 0) + 1;
      // Key by ISO date, NOT by a display label: a year-less "Sep 2" merges this
      // year's views into last year's bucket on the "All time" range.
      const date = new Date(v.created_at).toISOString().slice(0, 10);
      byDate[date] = (byDate[date] || 0) + 1;
      if (v.os === "ios" || v.os === "android") {
        const o = (osByPage[v.path] ||= { ios: 0, android: 0 });
        if (v.os === "ios") { o.ios++; iosTotal++; } else { o.android++; androidTotal++; }
      }
    }
    return {
      totalViews,
      // EVERY page, not a top-N — the owner wants the full list (the card scrolls).
      allPages: Object.entries(byPage).sort((a, b) => b[1] - a[1]),
      topCountries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 15),
      countryCount: Object.keys(byCountry).length,
      byDevice,
      timeData: Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, views]) => ({ date: fmtDay(date), views })),
      iosTotal,
      androidTotal,
      osByPage,
    };
  }, [pageViews, marketingOnly]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Website Analytics"
        subtitle="Website traffic"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMarketingOnly(!marketingOnly)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                marketingOnly
                  ? "border-app-blue/40 bg-app-blue/15 text-app-blue-light"
                  : "border-white/[0.08] bg-app-navy-card/50 text-ink-muted hover:text-ink"
              )}
            >
              Marketing only
            </button>
            <Tabs
              size="sm"
              active={timeRange}
              onChange={(r) => setTimeRange(r as TimeRange)}
              tabs={(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => ({ key: r, label: r === "all" ? "All time" : `Last ${r}` }))}
            />
            <Button variant="secondary" size="sm" onClick={() => fetchData(timeRange)} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {loading && pageViews.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-ink-muted">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading page views…
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
            <FinCard label="Total Views" valueClass={STAT_NEUTRAL}>{stats.totalViews.toLocaleString()}</FinCard>
            <FinCard label="Countries" valueClass={STAT_NEUTRAL}>{stats.countryCount.toLocaleString()}</FinCard>
            <FinCard label="Desktop" valueClass={STAT_NEUTRAL}>{(stats.byDevice.desktop || 0).toLocaleString()}</FinCard>
            <FinCard label="Mobile" valueClass={STAT_NEUTRAL}>{(stats.byDevice.mobile || 0).toLocaleString()}</FinCard>
            {/* OS split is captured from 2026-07-19 onward (no retroactive data). */}
            <FinCard label="iOS" valueClass={STAT_NEUTRAL}>
              {stats.iosTotal + stats.androidTotal > 0
                ? `${Math.round((stats.iosTotal / (stats.iosTotal + stats.androidTotal)) * 100)}%`
                : "-"}
            </FinCard>
            <FinCard label="Android" valueClass={STAT_NEUTRAL}>
              {stats.iosTotal + stats.androidTotal > 0
                ? `${Math.round((stats.androidTotal / (stats.iosTotal + stats.androidTotal)) * 100)}%`
                : "-"}
            </FinCard>
          </div>

          <Card title="Views Over Time" className="chart-card mt-4">
            {stats.timeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={stats.timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="views" stroke={ACCENT} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px]"><Empty compact title="No visits in this range" description="Try a wider date range." /></div>
            )}
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={`Pages (${stats.allPages.length})`}>
              {stats.allPages.length > 0 ? (
                // Full list, no inner scroll — the owner wants every page flowing
                // down the page, not a capped box that reads like a top-N.
                <div className="space-y-3">
                  {stats.allPages.map(([path, count]) => {
                    const os = stats.osByPage[path];
                    const known = os ? os.ios + os.android : 0;
                    return (
                    <div key={path} className="flex items-center justify-between gap-3">
                      <span className="max-w-[220px] truncate font-mono text-sm text-ink-muted">{path}</span>
                      <div className="flex items-center gap-2">
                        {known > 0 && (
                          <span
                            className="whitespace-nowrap text-[11px] text-ink-faint num"
                            title={`Of ${known} click${known === 1 ? "" : "s"} with a known OS (captured from 2026-07-19): ${os!.ios} iOS · ${os!.android} Android`}
                          >
                            🍎 {Math.round((os!.ios / known) * 100)}% · 🤖 {Math.round((os!.android / known) * 100)}%
                          </span>
                        )}
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/[0.04]">
                          <div className="h-full rounded-full bg-app-blue" style={{ width: `${(count / Math.max(1, stats.totalViews)) * 100}%` }} />
                        </div>
                        <span className="w-12 text-right text-sm font-medium text-ink num">{count}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-ink-faint">No page views.</p>
              )}
            </Card>
            <Card title="Top Countries">
              {stats.topCountries.length > 0 ? (
                <div className="space-y-3">
                  {stats.topCountries.map(([country, count]) => {
                    const p = prettyPlace(country);
                    return (
                    <div key={country} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-muted">{p.flag ? `${p.flag} ` : ""}{p.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/[0.04]">
                          <div className="h-full rounded-full bg-app-green" style={{ width: `${(count / Math.max(1, stats.totalViews)) * 100}%` }} />
                        </div>
                        <span className="w-12 text-right text-sm font-medium text-ink num">{count}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-ink-faint">No location data.</p>
              )}
            </Card>
          </div>

          <Card title="Device Breakdown" className="chart-card mt-4">
            {Object.keys(stats.byDevice).length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={Object.entries(stats.byDevice).map(([device, count]) => ({
                    device: device.charAt(0).toUpperCase() + device.slice(1),
                    count,
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="device" type="category" tick={{ fill: CHART.tick, fontSize: 11 }} width={80} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={ACCENT} radius={[0, 6, 6, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-sm text-ink-faint">No device data.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
