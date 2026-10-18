"use client";

import React, { useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import Empty from "@/components/ui/Empty";
import DataTable, { useTablePrefs, type Column } from "@/components/ui/DataTable";
import { STAT_NEGATIVE, STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";

// Shapes returned by Able's API (apps/api/src/giving.ts report() and statement(),
// marketing.ts giving block). All USD amounts are integer micro USD.

interface GivingReport {
  generatedAt: string;
  pointsPerUsd: number;
  pointValueMicroUsd: number;
  program: {
    enabled: boolean;
    enrolledUsers: number;
    earners: number;
    pointsEarned: number;
    pointsOutstanding: number;
    liabilityMicroUsd: number;
    partnersLive: number;
  };
  partners: { partnerId: string; name: string; points: number; redemptions: number }[];
  recent: { phoneMasked: string; points: number; partnerId: string | null; ts: string }[];
}

interface StatementPartnerRow {
  partnerId: string;
  name: string;
  redemptions: number;
  users: number;
  points: number;
  owedMicroUsd: number;
  settledMicroUsd: number;
  remainingMicroUsd: number;
}

interface StatementMonth {
  month: string;
  redemptions: number;
  points: number;
  owedMicroUsd: number;
  settledMicroUsd: number;
  remainingMicroUsd: number;
  partners: StatementPartnerRow[];
}

interface StatementSettlement {
  id: string;
  month: string;
  partnerId: string;
  partnerName: string;
  amountMicroUsd: number;
  reference?: string;
  note?: string;
  ts: string;
}

interface StatementRow {
  month: string;
  ts: string;
  userId: string;
  phoneMasked: string;
  partnerId: string | null;
  partnerName: string | null;
  points: number;
  amountMicroUsd: number;
}

interface GivingStatement {
  generatedAt: string;
  pointValueMicroUsd: number;
  pointsPerUsd: number;
  partners: { partnerId: string; name: string }[];
  liability: { points: number; micro: number };
  unpricedRows: number;
  months: StatementMonth[];
  settlements: StatementSettlement[];
  rows: StatementRow[];
}

interface MarketingGiving {
  enrolled: number;
  roundup: number;
  enrolledCarded: number;
  pctOfCarded: number | null;
  pointsEarned: number;
  pointsRedeemed: number;
}

const REFRESH_MS = 5 * 60_000;

/** Same as the Ops page: en-US grouping, at most `dp` fraction digits. */
function fmt(n: number | null | undefined, dp = 0): string {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: dp });
}

/** Micro USD to whole cents, floored (the Ops page and the API's formatMicroUsd
 * both floor). Integer arithmetic so no float drift reaches the display. */
function usd(micro: number | null | undefined, group = true): string {
  const cents = Math.floor((Number(micro) || 0) / 10_000);
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  return `${cents < 0 ? "-" : ""}${group ? whole.toLocaleString("en-US") : String(whole)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Full micro precision, for a tooltip when the cent display drops a remainder. */
function exactUsd(micro: number): string | undefined {
  const m = Number(micro) || 0;
  if (m % 10_000 === 0) return undefined;
  const abs = Math.abs(m);
  return `Exactly USD ${m < 0 ? "-" : ""}${Math.floor(abs / 1_000_000)}.${String(abs % 1_000_000).padStart(6, "0")}`;
}

function Usd({ micro }: { micro: number }) {
  return <span title={exactUsd(micro)}>{usd(micro)}</span>;
}

const day = (ts: string | null | undefined) => String(ts || "").slice(0, 10);

function downloadCsv(st: GivingStatement, month: string | null) {
  const rows = st.rows
    .filter((r) => !month || r.month === month)
    .slice()
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const cell = (v: unknown) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [["month", "date", "user_id", "phone_last4", "partner", "points", "usd"].map(cell).join(",")];
  for (const r of rows) {
    lines.push([r.month, r.ts, r.userId, r.phoneMasked, r.partnerName || r.partnerId, r.points, usd(r.amountMicroUsd, false)].map(cell).join(","));
  }
  const m = st.months.find((x) => x.month === month);
  if (m) {
    for (const p of m.partners) {
      lines.push([`TOTAL ${m.month}`, "", "", "", p.name, p.points, usd(p.owedMicroUsd, false)].map(cell).join(","));
    }
  }
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `able-giving-${month || "all"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Table<T>({ storageKey, columns, rows, rowKey, empty }: {
  storageKey: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
}) {
  const prefs = useTablePrefs(storageKey, columns);
  if (rows.length === 0) return <Empty compact title={empty} />;
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={rowKey}
      hidden={prefs.hidden}
      widths={prefs.widths}
      setWidths={prefs.setWidths}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{children}</h2>;
}

type PartnerTotal = GivingReport["partners"][number];
type RecentRow = GivingReport["recent"][number] & { key: string; partnerName: string };
type LogRow = StatementRow & { key: string };

const PARTNER_COLUMNS: Column<PartnerTotal>[] = [
  { key: "name", header: "Partner", cell: (p) => p.name, sortValue: (p) => p.name, width: 220 },
  { key: "redemptions", header: "Redemptions", cell: (p) => fmt(p.redemptions), sortValue: (p) => p.redemptions, align: "right", width: 130 },
  { key: "points", header: "Points", cell: (p) => fmt(p.points), sortValue: (p) => p.points, align: "right", width: 110 },
];

const RECENT_COLUMNS: Column<RecentRow>[] = [
  { key: "date", header: "Date", cell: (r) => day(r.ts), sortValue: (r) => r.ts, width: 120 },
  { key: "phone", header: "Phone", cell: (r) => r.phoneMasked, width: 120 },
  { key: "partner", header: "Partner", cell: (r) => r.partnerName, sortValue: (r) => r.partnerName, width: 200 },
  { key: "points", header: "Points", cell: (r) => fmt(r.points), sortValue: (r) => r.points, align: "right", width: 100 },
];

const OWED_COLUMNS: Column<StatementPartnerRow>[] = [
  { key: "name", header: "Partner", cell: (p) => p.name, sortValue: (p) => p.name, width: 200 },
  { key: "users", header: "Users", cell: (p) => fmt(p.users), sortValue: (p) => p.users, align: "right", width: 90 },
  { key: "redemptions", header: "Redemptions", cell: (p) => fmt(p.redemptions), sortValue: (p) => p.redemptions, align: "right", width: 130 },
  { key: "points", header: "Points", cell: (p) => fmt(p.points), sortValue: (p) => p.points, align: "right", width: 110 },
  { key: "owed", header: "Owed USD", cell: (p) => <Usd micro={p.owedMicroUsd} />, sortValue: (p) => p.owedMicroUsd, align: "right", width: 120 },
  { key: "paid", header: "Paid USD", cell: (p) => <Usd micro={p.settledMicroUsd} />, sortValue: (p) => p.settledMicroUsd, align: "right", width: 120 },
  { key: "remaining", header: "Remaining USD", cell: (p) => <Usd micro={p.remainingMicroUsd} />, sortValue: (p) => p.remainingMicroUsd, align: "right", width: 140 },
];

const PAID_COLUMNS: Column<StatementSettlement>[] = [
  { key: "recorded", header: "Recorded", cell: (s) => day(s.ts), sortValue: (s) => s.ts, width: 120 },
  { key: "month", header: "Month", cell: (s) => s.month, sortValue: (s) => s.month, width: 100 },
  { key: "partner", header: "Partner", cell: (s) => s.partnerName || s.partnerId, sortValue: (s) => s.partnerName || s.partnerId, width: 200 },
  { key: "usd", header: "USD", cell: (s) => <Usd micro={s.amountMicroUsd} />, sortValue: (s) => s.amountMicroUsd, align: "right", width: 110 },
  { key: "reference", header: "Reference", cell: (s) => s.reference || "", width: 180 },
];

const LOG_COLUMNS: Column<LogRow>[] = [
  { key: "date", header: "Date", cell: (r) => day(r.ts), sortValue: (r) => r.ts, width: 120 },
  { key: "user", header: "User id", cell: (r) => <span className="font-mono text-xs">{r.userId}</span>, sortValue: (r) => r.userId, width: 300 },
  { key: "phone", header: "Phone", cell: (r) => r.phoneMasked, width: 120 },
  { key: "partner", header: "Partner", cell: (r) => r.partnerName || r.partnerId || "-", sortValue: (r) => r.partnerName || r.partnerId || "", width: 200 },
  { key: "points", header: "Points", cell: (r) => fmt(r.points), sortValue: (r) => r.points, align: "right", width: 100 },
  { key: "usd", header: "USD", cell: (r) => <Usd micro={r.amountMicroUsd} />, sortValue: (r) => r.amountMicroUsd, align: "right", width: 110 },
];

export default function Giving() {
  const report = useAbleReport<GivingReport>("/giving/report", { refreshMs: REFRESH_MS });
  const statement = useAbleReport<GivingStatement>("/giving/statement", { refreshMs: REFRESH_MS });
  // Enrollment cards live on /marketing, gated on a separate permission. Shown only
  // when it loads, like the Ops page, and its error is not this page's error.
  const marketing = useAbleReport<{ giving?: MarketingGiving }>("/marketing", { refreshMs: REFRESH_MS });
  const [picked, setPicked] = useState<string | null>(null);

  const g = report.data?.program ? report.data : null;
  const st = statement.data && Array.isArray(statement.data.months) ? statement.data : null;
  const mg = marketing.data?.giving ?? null;

  const loading = report.loading || statement.loading || marketing.loading;
  const ats = [report.at, statement.at].filter((x): x is number => x != null);
  const at = ats.length ? Math.max(...ats) : null;
  const refresh = () => {
    void report.refresh();
    void statement.refresh();
    void marketing.refresh();
  };

  const months = useMemo(() => (st ? st.months.map((m) => m.month) : []), [st]);
  const month = picked && months.includes(picked) ? picked : months[0] ?? null;
  const m = st?.months.find((x) => x.month === month) ?? null;

  const recent = useMemo<RecentRow[]>(() => {
    if (!g) return [];
    const name = (id: string | null) => g.partners.find((p) => p.partnerId === id)?.name ?? (id || "-");
    return (g.recent || []).slice(0, 20).map((r, i) => ({ ...r, key: `${r.ts}-${i}`, partnerName: name(r.partnerId) }));
  }, [g]);

  const payments = useMemo(() => (st?.settlements || []).filter((s) => !m || s.month === m.month), [st, m]);
  const log = useMemo<LogRow[]>(
    () =>
      (st?.rows || [])
        .filter((r) => !m || r.month === m.month)
        .slice()
        .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
        .map((r, i) => ({ ...r, key: `${r.ts}-${r.userId}-${i}` })),
    [st, m],
  );

  const errors = [
    report.error && `Could not load the giving report: ${report.error}`,
    statement.error && `Could not load the giving statement: ${statement.error}`,
  ].filter(Boolean) as string[];

  const remainingOpen = m ? m.remainingMicroUsd > 0 : false;
  const unpriced = st?.unpricedRows ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Giving"
        subtitle={at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Charity points, disbursement and the monthly statement"}
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {errors.map((e) => (
        <div key={e} className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{e}</div>
      ))}

      {!g && !st && !mg ? (
        loading ? (
          <div className="flex items-center justify-center py-20 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading giving…
          </div>
        ) : errors.length === 0 ? (
          <Empty title="No giving data" description="The giving report has not loaded yet." />
        ) : null
      ) : (
        <div className={cn("space-y-8 transition-opacity", loading && "opacity-60")}>
          {mg && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FinCard label="Enrolled" valueClass={STAT_NEUTRAL} note={`${fmt(mg.roundup)} with round-up on`}>{fmt(mg.enrolled)}</FinCard>
                <FinCard label="Of carded users" valueClass={STAT_NEUTRAL} note={`${fmt(mg.enrolledCarded)} carded users enrolled`}>
                  {mg.pctOfCarded === null ? "-" : `${fmt(mg.pctOfCarded, 1)}%`}
                </FinCard>
                <FinCard label="Points earned" valueClass={STAT_NEUTRAL} note="Net of clawbacks">{fmt(mg.pointsEarned)}</FinCard>
                <FinCard label="Points redeemed" valueClass={STAT_NEUTRAL} note="To partner charities">{fmt(mg.pointsRedeemed)}</FinCard>
              </div>
              <p className="text-xs text-ink-faint">
                Points earn on settled card spends only, never on held balance. Round up is points only, no user money moves.
              </p>
            </section>
          )}

          {g && (
            <section className="space-y-3">
              <SectionTitle>Disbursement worksheet</SectionTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FinCard
                  label="Program"
                  valueClass={g.program.enabled ? STAT_POSITIVE : "text-ink-faint"}
                  note={g.program.enabled ? `${fmt(g.pointsPerUsd)} points per USD settled` : "GIVING_POINTS_PER_USD is 0, the kill switch"}
                >
                  {g.program.enabled ? "On" : "Off"}
                </FinCard>
                <FinCard label="Points outstanding" valueClass={STAT_NEUTRAL} note="Earned, not yet redeemed">{fmt(g.program.pointsOutstanding)}</FinCard>
                <FinCard label="Earners" valueClass={STAT_NEUTRAL} note={`${fmt(g.program.enrolledUsers)} enrolled users`}>{fmt(g.program.earners)}</FinCard>
                <FinCard label="Partners live" valueClass={STAT_NEUTRAL} note={`${fmt((g.partners || []).length)} have received redemptions`}>
                  {fmt(g.program.partnersLive)}
                </FinCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Points redeemed by partner" bodyClassName="p-0">
                  <Table storageKey="giving-partners" columns={PARTNER_COLUMNS} rows={g.partners || []} rowKey={(p) => p.partnerId} empty="No redemptions yet" />
                </Card>
                <Card title="Recent redemptions" bodyClassName="p-0">
                  <Table storageKey="giving-recent" columns={RECENT_COLUMNS} rows={recent} rowKey={(r) => r.key} empty="No redemptions yet" />
                </Card>
              </div>
            </section>
          )}

          {st && (
            <section className="space-y-3">
              <SectionTitle>Monthly statement</SectionTitle>
              {months.length > 0 ? (
                <div className="overflow-x-auto">
                  <Tabs size="sm" active={month ?? ""} onChange={setPicked} tabs={months.map((x) => ({ key: x, label: x }))} />
                </div>
              ) : (
                <p className="text-xs text-ink-faint">No redemptions yet</p>
              )}
              {unpriced > 0 && (
                <div className="rounded-lg border border-app-orange/30 bg-app-orange/10 px-4 py-2.5 text-sm text-app-orange">
                  {unpriced === 1
                    ? "1 older redemption predates the value snapshot and is priced at today's rate."
                    : `${fmt(unpriced)} older redemptions predate the value snapshot and are priced at today's rate.`}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FinCard
                  label={m ? `Owed ${m.month}` : "Owed"}
                  valueClass={STAT_NEUTRAL}
                  note={m ? `${fmt(m.points)} points over ${fmt(m.redemptions)} redemptions` : "Nothing to pay"}
                >
                  {m ? <Usd micro={m.owedMicroUsd} /> : "-"}
                </FinCard>
                <FinCard label="Paid" valueClass={STAT_NEUTRAL} note="Recorded by the accountant">
                  {m ? <Usd micro={m.settledMicroUsd} /> : "-"}
                </FinCard>
                <FinCard
                  label="Remaining"
                  valueClass={m ? (remainingOpen ? STAT_NEGATIVE : STAT_POSITIVE) : STAT_NEUTRAL}
                  note={remainingOpen ? "Still to send" : "Settled"}
                >
                  {m ? <Usd micro={m.remainingMicroUsd} /> : "-"}
                </FinCard>
                <FinCard
                  label="Provision"
                  valueClass={STAT_NEUTRAL}
                  note={`${fmt(st.liability?.points ?? 0)} unredeemed points at ${fmt((Number(st.pointValueMicroUsd) || 0) / 10_000, 3)} cents each`}
                >
                  <Usd micro={st.liability?.micro ?? 0} />
                </FinCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Owed per partner" bodyClassName="p-0">
                  <Table storageKey="giving-owed" columns={OWED_COLUMNS} rows={m ? m.partners : []} rowKey={(p) => p.partnerId} empty="No redemptions this month" />
                </Card>
                <Card title="Payments recorded" bodyClassName="p-0">
                  <Table storageKey="giving-paid" columns={PAID_COLUMNS} rows={payments} rowKey={(s) => s.id} empty="No payments recorded" />
                </Card>
              </div>
              <Card
                title="Redemption log"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => downloadCsv(st, month)}>
                    <Download className="h-3.5 w-3.5" /> Download CSV for the accountant
                  </Button>
                }
                bodyClassName="p-0"
              >
                <p className="border-b border-white/[0.06] px-5 py-3 text-xs text-ink-faint">
                  User id and last-4 phone only; the full log for the selected month, oldest first.
                </p>
                <Table storageKey="giving-log" columns={LOG_COLUMNS} rows={log} rowKey={(r) => r.key} empty="No redemptions" />
              </Card>
              <p className="text-xs text-ink-faint">Payments are recorded by an operator with the API admin token.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
