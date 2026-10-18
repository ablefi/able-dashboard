"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Empty from "@/components/ui/Empty";
import DataTable, { ColumnsButton, useTablePrefs, type Column } from "@/components/ui/DataTable";
import { ACCENT, CHART, CHART_H_SM, MONEY_IN, SERIES, TOOLTIP_STYLE, axisProps, fmtInt, fmtPct } from "@/lib/chartTheme";
import { regionName } from "@/lib/countries";
import { STAT_NEUTRAL } from "@/lib/statColors";
import { cn } from "@/lib/utils";
import ReportPage, { ChartEmpty, FLUSH, LEGEND_PROPS, MiniTable } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  fmtAmount,
  monthLabel,
  weekLabel,
  type FunnelStage,
  type MarketingFunnelStage,
  type MarketingReferralCode,
  type MarketingReport,
} from "./marketingTypes";

// kycApproved is issuer approval (or a card exists); a Sumsub GREEN alone is still pending.
const STAGE_LABELS: Record<FunnelStage, string> = {
  signedUp: "Signed up",
  kycStarted: "KYC started",
  kycApproved: "Issuer KYC approved",
  cardIssued: "Card issued",
  deposited: "Deposited",
  spender: "Spent on card",
};

const stageLabel = (s: string) => STAGE_LABELS[s as FunnelStage] ?? s;

export default function Growth() {
  return (
    <ReportPage<MarketingReport> title="Growth" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => <GrowthBody m={m} />}
    </ReportPage>
  );
}

function GrowthBody({ m }: { m: MarketingReport }) {
  // The last week is partial, so week over week compares the two most recent full weeks.
  const lastFull = m.weekly[m.weekly.length - 2];
  const prevFull = m.weekly[m.weekly.length - 3];
  const wow =
    lastFull && prevFull && prevFull.signups > 0
      ? Math.round(((lastFull.signups - prevFull.signups) / prevFull.signups) * 1000) / 10
      : null;

  const stage = (key: FunnelStage): MarketingFunnelStage =>
    m.funnel.find((s) => s.stage === key) ?? { stage: key, count: 0, pctOfPrevious: null, pctOfAll: null };
  const ofUsers = (key: FunnelStage) => `${fmtInt(stage(key).count)} of ${fmtInt(m.users.total)} users`;

  return (
    <>
      <div className="app-stat-grid grid">
        <FinCard label="Total users" valueClass={STAT_NEUTRAL} note={`+${fmtInt(m.users.newLast7d)} in 7d, +${fmtInt(m.users.newLast30d)} in 30d`}>
          {fmtInt(m.users.total)}
        </FinCard>
        <FinCard
          label="Signups, last full week"
          valueClass={STAT_NEUTRAL}
          note={wow === null ? "No signups the week before" : `${wow >= 0 ? "+" : ""}${fmtPct(wow)} week over week`}
        >
          {fmtInt(lastFull?.signups)}
        </FinCard>
        <FinCard label="Active users, 7 days" valueClass={STAT_NEUTRAL} note={`${fmtInt(m.users.activeLast30d)} in 30 days`}>
          {fmtInt(m.users.activeLast7d)}
        </FinCard>
        <FinCard label="Referred users" valueClass={STAT_NEUTRAL} note={`${fmtInt(m.users.referred)} of ${fmtInt(m.users.total)} users`}>
          {fmtPct(m.users.referredPct)}
        </FinCard>
        <FinCard label="Issuer KYC approved" valueClass={STAT_NEUTRAL} note={ofUsers("kycApproved")}>
          {fmtPct(stage("kycApproved").pctOfAll)}
        </FinCard>
        <FinCard label="Card issued" valueClass={STAT_NEUTRAL} note={ofUsers("cardIssued")}>
          {fmtPct(stage("cardIssued").pctOfAll)}
        </FinCard>
        <FinCard label="Deposited" valueClass={STAT_NEUTRAL} note={ofUsers("deposited")}>
          {fmtPct(stage("deposited").pctOfAll)}
        </FinCard>
        <FinCard label="Spent on card" valueClass={STAT_NEUTRAL} note={ofUsers("spender")}>
          {fmtPct(stage("spender").pctOfAll)}
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SignupsPerWeek m={m} />
        <Cohorts m={m} />

        <Card title="Users by activation stage, current state" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_H_SM}>
            <BarChart
              data={m.funnel.map((s) => ({ label: stageLabel(s.stage), count: s.count }))}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={112} interval={0} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Users"]} />
              <Bar dataKey="count" fill={SERIES[0]} radius={[0, 3, 3, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            Each count is users in that state now, so a later stage can exceed an earlier one. Spent on card means any card
            transaction, including refunded or failed ones.
          </p>
        </Card>

        <Card title="Activation stage conversion" className="chart-card">
          <MiniTable
            rows={m.funnel}
            rowKey={(s) => s.stage}
            empty="No users yet"
            columns={[
              { header: "Stage", cell: (s) => <span className="text-ink">{stageLabel(s.stage)}</span> },
              { header: "Users", align: "right", cell: (s) => fmtInt(s.count) },
              { header: "% of previous stage", align: "right", cell: (s) => fmtPct(s.pctOfPrevious) },
              { header: "% of all users", align: "right", cell: (s) => fmtPct(s.pctOfAll) },
            ]}
          />
        </Card>

        <Card title="Users who deposited, % by age band" className="chart-card">
          {m.conversionByAge.length > 0 ? (
            <RateChart
              rows={m.conversionByAge.map((a) => ({ tick: a.band, name: `Age ${a.band}`, pct: a.pct, users: a.users, deposited: a.deposited }))}
              fill={SERIES[2]}
            />
          ) : (
            <ChartEmpty title="No dates of birth yet" height={CHART_H_SM} />
          )}
        </Card>

        <Card title="Users who deposited, % by country of residence, top 12" className="chart-card">
          {m.conversionByCountry.length > 0 ? (
            <RateChart
              rows={m.conversionByCountry.map((c) => ({ tick: c.code, name: regionName(c.code) || c.code, pct: c.pct, users: c.users, deposited: c.deposited }))}
              fill={SERIES[3]}
            />
          ) : (
            <ChartEmpty title="No users yet" height={CHART_H_SM} />
          )}
        </Card>
      </div>

      <ReferralCodes codes={m.referralCodes} />
    </>
  );
}

function SignupsPerWeek({ m }: { m: MarketingReport }) {
  const current = m.weekly[m.weekly.length - 1]?.weekStart;
  const weeks = m.weekly.map((w) => ({
    week: weekLabel(w.weekStart),
    partial: w.weekStart === current,
    organic: w.signups - w.referredSignups,
    referred: w.referredSignups,
  }));
  return (
    <Card title="Signups per week, organic vs referred, last 12 weeks" className="chart-card">
      <ResponsiveContainer width="100%" height={CHART_H_SM}>
        <BarChart data={weeks} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="week" {...axisProps} minTickGap={12} />
          <YAxis {...axisProps} allowDecimals={false} width={32} />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(l: string, payload: Array<{ payload?: { partial?: boolean } }>) =>
              `Week of ${l} (UTC)${payload?.[0]?.payload?.partial ? ", in progress" : ""}`
            }
          />
          <Legend {...LEGEND_PROPS} />
          <Bar dataKey="organic" name="Organic" stackId="signups" fill={SERIES[0]} maxBarSize={22} />
          <Bar dataKey="referred" name="Referred" stackId="signups" fill={MONEY_IN} radius={[3, 3, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function Cohorts({ m }: { m: MarketingReport }) {
  const cohorts = m.monthlyCohorts.map((c) => ({ ...c, label: monthLabel(c.month) }));
  return (
    <Card title="Signups by month, and how many ever deposited or spent" className="chart-card">
      {cohorts.length > 0 ? (
        <ResponsiveContainer width="100%" height={CHART_H_SM}>
          <ComposedChart data={cohorts} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={12} />
            <YAxis {...axisProps} allowDecimals={false} width={32} />
            <Tooltip {...TOOLTIP_STYLE} labelFormatter={(l: string) => `Signed up in ${l} (UTC)`} />
            <Legend {...LEGEND_PROPS} />
            <Bar dataKey="signups" name="Signups" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Line type="monotone" dataKey="deposited" name="Ever deposited" stroke={MONEY_IN} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="spenders" name="Ever spent on card" stroke={ACCENT} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty title="No signups yet" height={CHART_H_SM} />
      )}
    </Card>
  );
}

type RateRow = { tick: string; name: string; pct: number | null; users: number; deposited: number };

/** Deposit rate per group. Each tick carries the group's user count so a 100% group of one user reads as such. */
function RateChart({ rows, fill }: { rows: RateRow[]; fill: string }) {
  const users = new Map(rows.map((r) => [r.tick, r.users]));
  const data = rows.map((r) => ({ ...r, pct: r.pct ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={CHART_H_SM}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="tick"
          {...axisProps}
          interval={0}
          height={30}
          tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
            <g transform={`translate(${x},${y})`}>
              <text textAnchor="middle" fill={CHART.tick} fontSize={10}>
                <tspan x={0} dy={10}>
                  {payload.value}
                </tspan>
                <tspan x={0} dy={11} opacity={0.7}>
                  {fmtInt(users.get(payload.value))}
                </tspan>
              </text>
            </g>
          )}
        />
        <YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(_: string, payload: Array<{ payload?: RateRow }>) => payload?.[0]?.payload?.name ?? ""}
          formatter={(v: number, _n: string, item: { payload: RateRow }) => [
            `${fmtPct(v)} (${fmtInt(item.payload.deposited)} of ${fmtInt(item.payload.users)} users)`,
            "Deposited",
          ]}
        />
        <Bar dataKey="pct" fill={fill} radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const count = (key: keyof MarketingReferralCode, header: string): Column<MarketingReferralCode> => ({
  key,
  header,
  align: "right",
  width: 104,
  cell: (r) => <span className="num">{fmtInt(r[key] as number)}</span>,
  sortValue: (r) => r[key] as number,
});

const REFERRAL_COLUMNS: Column<MarketingReferralCode>[] = [
  {
    key: "code",
    header: "Code",
    width: 160,
    hideable: false,
    cell: (r) => <span className="font-mono text-ink">{r.code}</span>,
    sortValue: (r) => r.code.toLowerCase(),
  },
  count("signups", "Signups"),
  count("kycApproved", "Issuer KYC approved"),
  count("carded", "Card issued"),
  count("deposited", "Deposited"),
  count("spenders", "Spent on card"),
  {
    key: "depositUsdt",
    header: "Deposits (USDT)",
    align: "right",
    width: 128,
    cell: (r) => <span className="num">{fmtAmount(r.depositUsdt)}</span>,
    sortValue: (r) => r.depositUsdt,
  },
  {
    key: "spendUsd",
    header: "Net card spend (USD)",
    align: "right",
    width: 128,
    cell: (r) => <span className="num">{fmtAmount(r.spendUsd)}</span>,
    sortValue: (r) => r.spendUsd,
  },
];

/** Codes with at least one signup; user counts and money are the referred users' lifetime totals. */
function ReferralCodes({ codes }: { codes: MarketingReferralCode[] }) {
  const prefs = useTablePrefs("able-referral-codes", REFERRAL_COLUMNS);
  const refDeposits = codes.reduce((n, r) => n + r.depositUsdt, 0);
  const refSpend = codes.reduce((n, r) => n + r.spendUsd, 0);
  // The API sorts codes by signups, most first.
  const best = codes[0];

  return (
    <Card
      title="Referral codes, lifetime totals of referred users"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-ink-faint">
          <Figure label="Codes with signups" value={fmtInt(codes.length)} />
          <Figure label="Most signups" value={best ? `${best.code} (${fmtInt(best.signups)})` : "-"} mono />
          <Figure label="Referred deposits" value={`${fmtAmount(refDeposits)} USDT`} />
          <Figure label="Referred net card spend" value={`${fmtAmount(refSpend)} USD`} />
          {codes.length > 0 && <ColumnsButton columns={REFERRAL_COLUMNS} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />}
        </div>
      }
    >
      {codes.length > 0 ? (
        <div className={FLUSH}>
          <DataTable
            className="max-h-[28rem]"
            columns={REFERRAL_COLUMNS}
            rows={codes}
            rowKey={(r) => r.code}
            hidden={prefs.hidden}
            widths={prefs.widths}
            setWidths={prefs.setWidths}
            defaultSort={{ key: "signups", dir: "desc" }}
          />
        </div>
      ) : (
        <Empty compact title="No referrals yet" />
      )}
    </Card>
  );
}

/** Inline headline figure for a card header: muted label, ink value. */
function Figure({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className={cn("text-ink num", mono && "font-mono")}>{value}</span>
    </span>
  );
}
