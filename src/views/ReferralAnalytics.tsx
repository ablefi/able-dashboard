"use client";

import React, { useState, useEffect } from "react";
import { useSort, SortTh } from "@/components/ui/SortableHeader";
import { fmtDate } from "@/lib/dates";
import { useRouter } from "next/navigation";
import { Eye, ChevronRight, ChevronDown, Loader2, Trophy } from "lucide-react";
import { useReferralCodesApi, ReferralRevenueAnalytics, ReferralCodeRevenue, RevenueByProduct } from "../api/referralCodesApi";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Code from "@/components/ui/Code";
import Button from "@/components/ui/Button";
import Pagination from "@/components/ui/Pagination";
import Empty from "@/components/ui/Empty";

const formatCurrency = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
const formatDate = (s: string) => fmtDate(s);

function StatusBadge({ active, expiredAt }: { active: boolean; expiredAt?: string }) {
  if (!active) return <Badge variant="danger">Inactive</Badge>;
  if (expiredAt && new Date(expiredAt) < new Date()) return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="success">Active</Badge>;
}

const ReferralAnalytics: React.FC = () => {
  const router = useRouter();
  const { fetchReferralRevenueAnalytics, loading, error } = useReferralCodesApi();
  const [analytics, setAnalytics] = useState<ReferralRevenueAnalytics | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const data = await fetchReferralRevenueAnalytics();
      if (data) setAnalytics(data);
    })();
  }, [fetchReferralRevenueAnalytics]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /** Hooks must run before the early returns below, or React throws once the
   *  data arrives (one more hook than the loading render). Sort the WHOLE set,
   *  then slice: pagination is client-side, so this is a real "highest revenue
   *  first" rather than "highest on this page". */
  const { sorted, sortKey, sortDir, toggle } = useSort<ReferralCodeRevenue>(analytics?.data ?? [], {
    code: (r) => r.code,
    status: (r) => (r.active ? 1 : 0),
    bypass: (r) => (r.bypassPaywall ? 1 : 0),
    users: (r) => r.totalUsers,
    revenue: (r) => r.netRevenue,
    transactions: (r) => r.totalTransactions,
    created: (r) => new Date(r.createdAt).getTime(),
  });
  const onSort = (k: string) => { setCurrentPage(1); toggle(k); };
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  if (loading && !analytics) {
    return <div className="flex items-center justify-center py-24 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading analytics…</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-3 text-sm text-app-red-text">{error}</div>;
  }
  if (!analytics || analytics.data.length === 0) {
    return (
      <div>
        <PageHeader title="Referral Analytics" />
        <Empty title="No data" description="No referral code revenue data available." />
      </div>
    );
  }

  const activeCodes = analytics.data.filter((c) => c.active).length;
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div>
      <PageHeader title="Code Analytics" subtitle="Revenue and usage by referral code" />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/60 p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-app-blue/40 to-transparent" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Active Codes</span>
            <Trophy className="h-4 w-4 text-ink-faint" />
          </div>
          <div className="mt-3 text-2xl font-semibold leading-none text-app-blue-light num">{activeCodes} / {analytics.data.length}</div>
        </div>
      </div>

      <Card title="Referral Codes Revenue Details" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                {([
                  ["", ""], ["Referral Code", "code"], ["Status", "status"], ["Bypass", "bypass"],
                  ["Users", "users"], ["Revenue", "revenue"], ["Transactions", "transactions"],
                  ["Created", "created"], ["", ""],
                ] as [string, string][]).map(([h, k], i) => (
                  <SortTh
                    key={i}
                    label={h}
                    sortKey={k || undefined}
                    active={sortKey === k}
                    dir={sortDir}
                    onToggle={onSort}
                    className="whitespace-nowrap"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r: ReferralCodeRevenue) => {
                const isOpen = expanded.has(r.id);
                return (
                  <React.Fragment key={r.id}>
                    <tr className="cursor-pointer border-b border-white/[0.04] text-ink-muted transition-colors hover:bg-white/[0.02]" onClick={() => toggleExpand(r.id)}>
                      <td className="px-4 py-3 text-ink-faint">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-4 py-3"><Code className="font-semibold">{r.code}</Code><div className="text-xs text-ink-faint">{r.name}</div></td>
                      <td className="px-4 py-3"><StatusBadge active={r.active} expiredAt={r.expiredAt} /></td>
                      <td className="px-4 py-3"><Badge variant={r.bypassPaywall ? "purple" : "default"}>{r.bypassPaywall ? "Yes" : "No"}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3"><div>{r.totalUsers} total</div><div className="text-xs text-ink-faint">{r.subscribedUsers} subscribed</div></td>
                      <td className="whitespace-nowrap px-4 py-3"><div className="font-semibold text-app-green">{formatCurrency(r.netRevenue)}</div><div className="text-xs text-ink-faint">Gross: {formatCurrency(r.totalRevenue)}</div>{r.totalRefunds > 0 && <div className="text-xs text-app-red-text">Refunds: {formatCurrency(r.totalRefunds)}</div>}</td>
                      <td className="px-4 py-3 text-app-blue-light num">{r.totalTransactions.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-faint num">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => router.push(`/referral-codes/${r.id}`)}><Eye className="h-3.5 w-3.5" /> Details</Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-white/[0.04] bg-app-navy-light/30">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">Revenue Breakdown by Product & Currency</div>
                          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b border-white/[0.06] text-left text-ink-faint">{["Product ID", "Currency", "Net Revenue", "Gross Revenue", "Transactions", "Refunds"].map((h) => (<th key={h} className="px-3 py-2 font-medium">{h}</th>))}</tr></thead>
                              <tbody>
                                {r.revenueByProduct.map((p: RevenueByProduct) => (
                                  <tr key={`${p.productId}-${p.currency}`} className="border-b border-white/[0.03] text-ink-muted last:border-0">
                                    <td className="px-3 py-2 font-mono text-app-blue-light">{p.productId}</td>
                                    <td className="px-3 py-2"><Code>{p.currency}</Code></td>
                                    <td className="px-3 py-2 font-semibold text-app-green">{formatCurrency(p.netRevenue, p.currency)}</td>
                                    <td className="px-3 py-2 text-app-blue-light">{formatCurrency(p.totalRevenue, p.currency)}</td>
                                    <td className="px-3 py-2">{p.transactionCount.toLocaleString()}</td>
                                    <td className="px-3 py-2">{p.refundCount} {p.totalRefunds > 0 && <span className="text-app-red-text">({formatCurrency(p.totalRefunds, p.currency)})</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-sm">
          <div className="text-ink-faint">{analytics.data.length} codes</div>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-app-blue/45 focus:outline-none" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              {[5, 10, 20, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
            <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ReferralAnalytics;
