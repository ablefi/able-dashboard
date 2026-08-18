"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import UserGlobe from "@/components/UserGlobe";
import FinCard from "@/components/ui/FinCard";
import RevenueStaleBanner from "@/components/RevenueStaleBanner";

interface Summary {
  totalRevenue: number;
  totalDownloads: number;
  totalUsers: number | null;
  freeCodesSent: number;
  activeSubscriptions: number;
  cashRemaining: number;
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
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard-summary", { headers: authHeaders() });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${res.status})`);
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-muted">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  const onboarding =
    data && data.totalUsers != null && data.totalDownloads > 0 ? (data.totalUsers / data.totalDownloads) * 100 : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={data?.latestSnapshotDate ? `Company headline numbers · data through ${data.latestSnapshotDate}` : "Company headline numbers"}
      />
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      <RevenueStaleBanner />

      {data && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <FinCard label="Total Revenue" valueClass="text-emerald-400">
            ${Math.round(data.totalRevenue).toLocaleString()}
          </FinCard>
          <FinCard label="Total Downloads" valueClass="text-jp-purple">
            {data.totalDownloads.toLocaleString()}
          </FinCard>
          <FinCard label="Total Users" valueClass="text-jp-blue-light">
            {data.totalUsers != null ? data.totalUsers.toLocaleString() : "—"}
          </FinCard>
          <FinCard label="Onboarding Completion" valueClass="text-amber-400">
            {onboarding != null ? `${onboarding.toFixed(1)}%` : "—"}
          </FinCard>
          <FinCard label="Active Subscriptions" valueClass="text-jp-cyan">
            {data.activeSubscriptions.toLocaleString()}
          </FinCard>
          <FinCard label="Free Codes Sent" valueClass="text-jp-blue-light">
            {data.freeCodesSent.toLocaleString()}
          </FinCard>
          <FinCard label="Cash Remaining" valueClass={data.cashRemaining >= 0 ? "text-emerald-400" : "text-rose-400"}>
            ${Math.abs(Math.round(data.cashRemaining)).toLocaleString()}
          </FinCard>
          <FinCard label="App Store Rating" valueClass="text-amber-400">
            {data.appRating != null ? (
              <span className="inline-flex items-baseline gap-1.5">
                {data.appRating.toFixed(2)}
                <Star className="h-4 w-4 -translate-y-px fill-amber-400 text-amber-400" />
                <span className="text-base font-semibold text-ink-muted">{fmtK(data.appReviews)} reviews</span>
              </span>
            ) : (
              "—"
            )}
          </FinCard>
        </div>
      )}

      <UserGlobe />
    </div>
  );
}
