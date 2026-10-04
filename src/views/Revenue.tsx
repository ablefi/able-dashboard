"use client";

import React, { useCallback, useEffect, useState } from "react";
import Tabs from "@/components/ui/Tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import RevenueStaleBanner from "@/components/RevenueStaleBanner";
import { cn } from "@/lib/utils";

type Granularity = "day" | "week" | "month";

interface Snapshot {
  snapshot_date: string;
  active_trials: number;
  active_subscriptions: number;
  mrr: number;
  revenue: number;
  new_customers: number;
  active_users: number;
  transactions: number;
}

interface RevenueResponse {
  overview: {
    active_trials: number;
    active_subscriptions: number;
    mrr: number;
    revenue: number;
    new_customers: number;
    active_users: number;
    transactions: number;
  };
  rcOk: boolean;
  snapshots: Snapshot[];
  cumulativeRevenue: number;
  allTimeDownloads: number;
  latestSnapshotDate: string | null;
}

const CHART = { grid: "rgba(23,35,30,0.08)", tick: "#66756d" };
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#ffffff", border: "1px solid #dce4df", borderRadius: "8px" },
  labelStyle: { color: "#17231e" },
  itemStyle: { color: "#17231e" },
};

const fmtCur = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function fmtDate(dateStr: string, granularity: Granularity): string {
  const d = new Date(dateStr + "T00:00:00");
  if (granularity === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (granularity === "week") return "W/" + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SERIES: { key: keyof Snapshot; title: string; color: string; currency?: boolean }[] = [
  { key: "revenue", title: "Revenue", color: "#60a5fa", currency: true },
  { key: "active_subscriptions", title: "Active Subscriptions", color: "#34d399" },
  { key: "new_customers", title: "Downloads", color: "#8b5cf6" },
  { key: "mrr", title: "MRR", color: "#4fb8e8", currency: true },
  { key: "transactions", title: "Transactions", color: "#2dd4bf" },
  { key: "active_trials", title: "Active Trials", color: "#f59e0b" },
];

export default function Revenue() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("week");

  const fetchData = useCallback(async (g: Granularity) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/revenue?granularity=${g}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overview = data?.overview;
  const snapshots = data?.snapshots ?? [];
  const chartData = snapshots.map((s) => ({
    date: fmtDate(s.snapshot_date, granularity),
    revenue: Math.round((Number(s.revenue) || 0) * 100) / 100,
    active_subscriptions: s.active_subscriptions,
    new_customers: s.new_customers,
    mrr: Math.round((Number(s.mrr) || 0) * 100) / 100,
    transactions: s.transactions,
    active_trials: s.active_trials,
  }));

  const conversionToPaying = overview && overview.active_users > 0 ? (overview.active_subscriptions / overview.active_users) * 100 : 0;
  const arpu = overview && overview.active_users > 0 ? overview.revenue / overview.active_users : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue Analytics"
        subtitle={data?.latestSnapshotDate ? `RevenueCat live metrics · all-time charts through ${data.latestSnapshotDate}` : "Just Pray — RevenueCat data"}
        actions={
          <div className="flex items-center gap-2">
            <Tabs
              size="sm"
              active={granularity}
              onChange={(g) => {
                setGranularity(g as Granularity);
                fetchData(g as Granularity);
              }}
              tabs={(["day", "week", "month"] as Granularity[]).map((g) => ({ key: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))}
            />
            <Button variant="secondary" size="sm" onClick={() => fetchData(granularity)} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      <RevenueStaleBanner />

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-ink-muted">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading revenue…
        </div>
      ) : overview ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {!data?.rcOk && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              RevenueCat live metrics unavailable — stat cards may show zeros. Charts (snapshots) are unaffected.
            </div>
          )}

          {/* Stat squares — per Adam: Revenue first, full-number subs, ratios promoted up here. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <FinCard label="Revenue (28d)" valueClass="text-jp-blue-light">{fmtCur(overview.revenue)}</FinCard>
            <FinCard label="MRR" valueClass="text-jp-cyan">{fmtCur(overview.mrr)}</FinCard>
            <FinCard label="Active Subscriptions" valueClass="text-emerald-400">{overview.active_subscriptions.toLocaleString()}</FinCard>
            <FinCard label="Downloads (28d)" valueClass="text-jp-purple">{overview.new_customers.toLocaleString()}</FinCard>
            <FinCard label="Conversion to Paying" valueClass="text-amber-400">{conversionToPaying.toFixed(1)}%</FinCard>
            <FinCard label="ARPU (28d)" valueClass="text-ink">${arpu.toFixed(2)}</FinCard>
          </div>

          {/* Charts — always all-time */}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {SERIES.map((s) => (
              <div key={s.key} className="chart-card rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5 backdrop-blur-sm">
                <h2 className="mb-4 text-sm font-semibold text-ink-muted">{s.title}</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.tick }} tickLine={false} axisLine={false} minTickGap={28} />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART.tick }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => (s.currency ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value) => [s.currency ? `$${Number(value).toLocaleString()}` : Number(value).toLocaleString(), s.title]}
                    />
                    <Line type="monotone" dataKey={s.key as string} stroke={s.color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
