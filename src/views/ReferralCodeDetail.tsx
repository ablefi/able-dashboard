"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title as ChartTitle, Tooltip as ChartTooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useReferralCodesApi, ReferralCodeDetailedRevenue, RevenueByProduct } from "../api/referralCodesApi";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTitle, ChartTooltip, Legend, Filler);

const formatCurrency = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
const formatDate = (s: string) => new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const formatMonth = (s: string) => new Date(s + "-01").toLocaleDateString("en-US", { year: "numeric", month: "short" });

function StatusBadge({ active, expiredAt }: { active: boolean; expiredAt?: string }) {
  if (!active) return <Badge variant="danger">Inactive</Badge>;
  if (expiredAt && new Date(expiredAt) < new Date()) return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="success">Active</Badge>;
}

// Navy Chart.js options
const baseOptions = (currency: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top" as const, labels: { color: "#cbd5e1" } },
    tooltip: { backgroundColor: "#15203a", titleColor: "#f0f4f8", bodyColor: "#94a3b8", borderColor: "rgba(96,165,250,0.3)", borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } },
    y: {
      ticks: { color: "#94a3b8", callback: (v: any) => (currency ? "$" + v.toLocaleString() : v.toLocaleString()) },
      grid: { color: "rgba(255,255,255,0.06)" },
    },
  },
});

const ReferralCodeDetail: React.FC = () => {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [details, setDetails] = useState<ReferralCodeDetailedRevenue | null>(null);
  const { fetchReferralCodeRevenueDetails, loading, error } = useReferralCodesApi();

  useEffect(() => {
    if (id) {
      (async () => {
        const data = await fetchReferralCodeRevenueDetails(id);
        if (data) setDetails(data);
      })();
    }
  }, [id, fetchReferralCodeRevenueDetails]);

  const revenueChartData = () => {
    if (!details) return null;
    const months = details.monthlyBreakdown.map((i) => formatMonth(i.month));
    return {
      labels: months,
      datasets: [
        { label: "Net Revenue", data: details.monthlyBreakdown.map((i) => i.netRevenueUsd), borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.12)", fill: true, tension: 0.4 },
        { label: "Gross Revenue", data: details.monthlyBreakdown.map((i) => i.totalRevenueUsd), borderColor: "#60a5fa", backgroundColor: "rgba(96,165,250,0.1)", fill: false, tension: 0.4 },
        { label: "Refunds", data: details.monthlyBreakdown.map((i) => i.totalRefundsUsd), borderColor: "#fb7185", backgroundColor: "rgba(251,113,133,0.1)", fill: false, tension: 0.4 },
      ],
    };
  };
  const transactionChartData = () => {
    if (!details) return null;
    return {
      labels: details.monthlyBreakdown.map((i) => formatMonth(i.month)),
      datasets: [{ label: "Transactions", data: details.monthlyBreakdown.map((i) => i.transactionCount), backgroundColor: "#3b82f6", borderColor: "#60a5fa", borderWidth: 1 }],
    };
  };
  const productRevenueChartData = () => {
    if (!details) return null;
    const months = details.monthlyBreakdown.map((i) => formatMonth(i.month));
    const pairs = new Set<string>();
    details.monthlyBreakdown.forEach((m) => m.revenueByProduct.forEach((p) => pairs.add(`${p.productId}-${p.currency}`)));
    const colors = [
      { b: "#34d399", bg: "rgba(52,211,153,0.1)" }, { b: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
      { b: "#a855f7", bg: "rgba(168,85,247,0.1)" }, { b: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
      { b: "#ec4899", bg: "rgba(236,72,153,0.1)" }, { b: "#2dd4bf", bg: "rgba(45,212,191,0.1)" },
    ];
    const datasets = Array.from(pairs).map((pair, index) => {
      const [productId, currency] = pair.split("-");
      const c = colors[index % colors.length];
      const data = months.map((_, mi) => {
        const pd = details.monthlyBreakdown[mi].revenueByProduct.find((p) => p.productId === productId && p.currency === currency);
        return pd ? pd.netRevenue : 0;
      });
      return { label: `${productId} (${currency})`, data, borderColor: c.b, backgroundColor: c.bg, fill: false, tension: 0.4 };
    });
    return { labels: months, datasets };
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading details…</div>;
  }
  if (error || !details) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <div>{error || "The requested referral code could not be found."}</div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.push("/referral-codes")}>Back to List</Button>
      </div>
    );
  }

  const stats = [
    { label: "Net Revenue", value: formatCurrency(details.netRevenue), color: "text-emerald-400" },
    { label: "Total Users", value: `${details.totalUsers} (${details.subscribedUsers} sub)`, color: "text-jp-blue-light" },
    { label: "Transactions", value: details.totalTransactions.toLocaleString(), color: "text-jp-blue-light" },
    { label: "Refunds", value: formatCurrency(details.totalRefunds), color: "text-rose-400" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{details.name}</h1>
        <StatusBadge active={details.active} expiredAt={details.expiredAt} />
      </div>

      {/* Basic info */}
      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div>
            <div className="text-xs text-ink-faint">Referral Code</div>
            <div className="font-mono font-semibold text-jp-blue-light">{details.code}</div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Description</div>
            <div className="text-ink">{details.description || "No description"}</div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Expires</div>
            <div className="text-ink">{details.expiredAt ? formatDate(details.expiredAt) : "Never"}</div>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Bypass Paywall</div>
            <Badge variant={details.bypassPaywall ? "purple" : "default"}>{details.bypassPaywall ? "Yes" : "No"}</Badge>
          </div>
          <div>
            <div className="text-xs text-ink-faint">Created</div>
            <div className="text-ink">{formatDate(details.createdAt)}</div>
          </div>
        </div>
      </Card>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-jp-blue/40 to-transparent" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{s.label}</div>
            <div className={"mt-2 text-2xl font-semibold leading-none num " + s.color}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <Card title="Revenue Trends (6 Months)" className="mb-6 chart-card">
        <div className="h-[300px]">{revenueChartData() && <Line data={revenueChartData()!} options={baseOptions(true)} />}</div>
      </Card>
      <Card title="Transaction Volume (6 Months)" className="mb-6 chart-card">
        <div className="h-[300px]">{transactionChartData() && <Bar data={transactionChartData()!} options={baseOptions(false)} />}</div>
      </Card>
      <Card title="Revenue by Product & Currency (6 Months)" className="mb-6 chart-card">
        <div className="h-[400px]">{productRevenueChartData() && <Line data={productRevenueChartData()!} options={baseOptions(true)} />}</div>
      </Card>

      {/* Product breakdown table */}
      <Card title="Revenue by Product & Currency" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                {["Product ID", "Currency", "Net Revenue", "Gross Revenue", "Transactions", "Refunds"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {details.revenueByProduct.map((p: RevenueByProduct) => (
                <tr key={`${p.productId}-${p.currency}`} className="border-b border-white/[0.04] last:border-0 text-ink-muted">
                  <td className="px-4 py-3 font-mono text-jp-blue-light">{p.productId}</td>
                  <td className="px-4 py-3"><Badge variant="info">{p.currency}</Badge></td>
                  <td className="px-4 py-3 font-semibold text-emerald-400">{formatCurrency(p.netRevenue, p.currency)}</td>
                  <td className="px-4 py-3 text-jp-blue-light">{formatCurrency(p.totalRevenue, p.currency)}</td>
                  <td className="px-4 py-3">{p.transactionCount.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.refundCount} {p.totalRefunds > 0 && <span className="text-rose-400">({formatCurrency(p.totalRefunds, p.currency)})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ReferralCodeDetail;
