"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import { CHART, MONEY_IN, ACCENT, SERIES, TOOLTIP_STYLE, axisProps, fmtInt } from "@/lib/chartTheme";
import { STAT_NEGATIVE, STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import ReportPage, { Amount, CHART_HEIGHT, ChartEmpty, Donut } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  fmtAmount,
  monthLabel,
  weekLabel,
  type MarketingReport,
} from "./marketingTypes";

const LEGEND_PROPS = { verticalAlign: "top", align: "right", iconType: "circle", iconSize: 7, wrapperStyle: { fontSize: 12, paddingBottom: 8 } } as const;

export default function Growth() {
  return (
    <ReportPage<MarketingReport> title="Growth" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => (
        <>
          <GrowthSection m={m} />
          {/* Older API deploys did not serve `monthly`; the Ops page hid this section until they did. */}
          {m.monthly && <MoneySection m={m} months={m.monthly} />}
        </>
      )}
    </ReportPage>
  );
}

function GrowthSection({ m }: { m: MarketingReport }) {
  // The last week is partial, so week over week compares the two most recent full weeks.
  const lastFull = m.weekly[m.weekly.length - 2];
  const prevFull = m.weekly[m.weekly.length - 3];
  const wow =
    lastFull && prevFull && prevFull.signups > 0
      ? Math.round(((lastFull.signups - prevFull.signups) / prevFull.signups) * 1000) / 10
      : null;

  const weeks = m.weekly.map((w) => ({
    week: weekLabel(w.weekStart),
    organic: w.signups - w.referredSignups,
    referred: w.referredSignups,
    depositUsdt: w.depositUsdt,
  }));
  const cohorts = m.monthlyCohorts.map((c) => ({ ...c, label: monthLabel(c.month) }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FinCard label="Total users" valueClass={STAT_NEUTRAL} note={`+${fmtInt(m.users.newLast7d)} in the last 7 days, +${fmtInt(m.users.newLast30d)} in 30`}>
          {fmtInt(m.users.total)}
        </FinCard>
        <FinCard
          label="Signups last full week"
          valueClass={wow === null ? STAT_NEUTRAL : wow >= 0 ? STAT_POSITIVE : STAT_NEGATIVE}
          note={wow === null ? "No signups the week before" : `${wow >= 0 ? "+" : ""}${wow.toLocaleString("en-US", { maximumFractionDigits: 1 })}% week over week`}
        >
          {fmtInt(lastFull?.signups)}
        </FinCard>
        <FinCard label="Active last 7 days" valueClass={STAT_NEUTRAL} note={`${fmtInt(m.users.activeLast30d)} active in the last 30 days`}>
          {fmtInt(m.users.activeLast7d)}
        </FinCard>
        <FinCard label="Referred signups" valueClass={STAT_NEUTRAL} note={`${(m.users.referredPct ?? 0).toLocaleString("en-US", { maximumFractionDigits: 1 })}% of all users`}>
          {fmtInt(m.users.referred)}
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Signups per week, organic vs referred" className="chart-card lg:col-span-2">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} allowDecimals={false} width={36} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(l: string) => `Week of ${l}`} />
              <Legend {...LEGEND_PROPS} />
              <Bar dataKey="organic" name="Organic" stackId="signups" fill={SERIES[0]} maxBarSize={28} />
              <Bar dataKey="referred" name="Referred" stackId="signups" fill={MONEY_IN} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Monthly signup cohorts and where they got to" className="chart-card">
          {cohorts.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} allowDecimals={false} width={36} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend {...LEGEND_PROPS} />
                <Bar dataKey="signups" name="Signups" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line type="monotone" dataKey="deposited" name="Deposited" stroke={MONEY_IN} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spenders" name="Spent on card" stroke={ACCENT} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty title="No signups yet" />
          )}
        </Card>

        <Card title="Deposit volume per week (USDT)" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={48} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(l: string) => `Week of ${l}`} formatter={(v: number) => [`${fmtAmount(v)} USDT`, "Deposits"]} />
              <Area type="monotone" dataKey="depositUsdt" stroke={MONEY_IN} strokeWidth={2} fill={MONEY_IN} fillOpacity={0.12} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}

function MoneySection({ m, months }: { m: MarketingReport; months: NonNullable<MarketingReport["monthly"]> }) {
  const rows = months.map((x) => ({ ...x, label: monthLabel(x.month) }));
  const chains = m.depositsByChain;

  return (
    <>
      <h2 className="pt-4 text-lg font-semibold tracking-tight text-ink">Money over time</h2>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FinCard label="Lifetime deposits" valueClass={STAT_POSITIVE} note={`${fmtInt(m.deposits.count)} deposits, all time`}>
          <Amount value={fmtAmount(m.deposits.totalUsdt)} unit="USDT" />
        </FinCard>
        <FinCard label="Average deposit" valueClass={STAT_POSITIVE}>
          <Amount value={fmtAmount(m.deposits.avgUsdt)} unit="USDT" />
        </FinCard>
        <FinCard label="Days to first deposit" valueClass={STAT_NEUTRAL} note="Median, from signup">
          {m.activation.medianDaysToDeposit === null ? "-" : m.activation.medianDaysToDeposit.toFixed(1)}
        </FinCard>
        <FinCard label="Days to first card spend" valueClass={STAT_NEUTRAL} note="Median, from signup">
          {m.activation.medianDaysToSpend === null ? "-" : m.activation.medianDaysToSpend.toFixed(1)}
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Deposit volume by month (USDT)" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={48} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${fmtAmount(v)} USDT`, "Deposits"]} />
              <Bar dataKey="depositUsdt" fill={MONEY_IN} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Card spend by month (USD)" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={48} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${fmtAmount(v)} USD`, "Card spend"]} />
              <Bar dataKey="spendUsd" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Hidden, as in Ops, until the API deploy serving `depositsByChain` is live. */}
        {chains && (
          <Card title="Deposit volume by chain" className="chart-card">
            {chains.some((c) => c.usdt > 0) ? (
              <Donut rows={chains.map((c) => ({ name: c.chain, value: c.usdt }))} format={(n) => `${fmtAmount(n)} USDT`} />
            ) : (
              <ChartEmpty title="No deposits yet" />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
