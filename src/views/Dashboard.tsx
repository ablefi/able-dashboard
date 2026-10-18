"use client";

import React, { useEffect, useState } from "react";
import { StatsSkeleton } from "@/components/ui/Skeleton";
import { STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import { Star } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import UserGlobe from "@/components/UserGlobe";
import FinCard from "@/components/ui/FinCard";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { resolveTimeframe, type Timeframe } from "@/lib/timeframe";
import { useAuth } from "@/context/AuthContext";

interface Summary {
  totalRevenue: number;
  totalDownloads: number;
  totalUsers: number | null;
  activeSubscriptions: number | null;
  subscriptionsDate: string | null;
  views: number | null;
  appRating: number | null;
  appReviews: number;
  rcOk: boolean;
  latestSnapshotDate: string | null;
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export default function Dashboard() {
  const { canSection } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>({ key: "this_month" });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    const range = resolveTimeframe(timeframe);
    const params = timeframe.key === "all" ? "" : `?from=${range.fromISO.slice(0,10)}&to=${range.toISO.slice(0,10)}`;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard-summary${params}`, { headers: authHeaders(), signal: controller.signal });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${res.status})`);
        }
        setData(await res.json());
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [timeframe]);

  const onboarding =
    data && data.totalUsers != null && data.totalDownloads > 0 ? (data.totalUsers / data.totalDownloads) * 100 : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        actions={<TimeframeFilter value={timeframe} onChange={setTimeframe} defaultKey="this_month" />}
      />
      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {loading ? <StatsSkeleton count={6} /> : data && (
        <div className="app-stat-grid grid grid-cols-2 gap-4 xl:grid-cols-3">
          {/* RevenueCat tiles only render once RC_API_KEY is configured; Able has no
              subscription revenue, so zeros here would read as real numbers. */}
          {data.rcOk && <FinCard label={timeframe.key === "all" ? "Total Revenue" : "Revenue"} valueClass={STAT_POSITIVE}>
            ${Math.round(data.totalRevenue).toLocaleString()}
          </FinCard>}
          {data.rcOk && <FinCard label={timeframe.key === "all" ? "Total Downloads" : "Downloads"} valueClass={STAT_NEUTRAL}>
            {data.totalDownloads.toLocaleString()}
          </FinCard>}
          <FinCard label="Views" valueClass={STAT_NEUTRAL}>
            {data.views != null ? data.views.toLocaleString() : "—"}
          </FinCard>
          {onboarding != null && <FinCard label="Onboarding Completion" valueClass={STAT_NEUTRAL}>
            {onboarding != null ? `${onboarding.toFixed(1)}%` : "-"}
          </FinCard>}
          {data.rcOk && <FinCard label="Active Subscriptions" valueClass={STAT_NEUTRAL}>
            {data.activeSubscriptions?.toLocaleString() ?? "—"}
          </FinCard>}
          {data.appRating != null && <FinCard label="App Store Rating" valueClass={STAT_NEUTRAL}>
            {data.appRating != null ? (
              <span className="inline-flex items-baseline gap-1.5">
                {data.appRating.toFixed(2)}
                <Star className="h-4 w-4 -translate-y-px fill-app-orange text-app-orange" />
                <span className="text-base font-semibold text-ink-muted">{fmtK(data.appReviews)} reviews</span>
              </span>
            ) : (
              "-"
            )}
          </FinCard>}
        </div>
      )}

      {/* The globe reads /api/user-geo, which needs users:read. */}
      {canSection("users") && <UserGlobe />}
    </div>
  );
}
