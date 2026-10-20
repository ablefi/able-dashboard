"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import { ACCENT, CHART, CHART_H, CHART_H_SM, MONEY_IN, SERIES, TOOLTIP_STYLE, axisProps, fmtInt, fmtPct } from "@/lib/chartTheme";
import { STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import ReportPage, { Amount, ChartEmpty, Donut, MiniTable } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  fmtAmount,
  monthLabel,
  weekLabel,
  type MarketingReport,
} from "./marketingTypes";

export default function Money() {
  return (
    <ReportPage<MarketingReport> title="Finances" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => <MoneyBody m={m} />}
    </ReportPage>
  );
}

const days = (n: number | null) => (n === null ? "-" : n.toFixed(1));

function MoneyBody({ m }: { m: MarketingReport }) {
  const s = m.spend;
  const current = m.weekly[m.weekly.length - 1]?.weekStart;
  const weeks = m.weekly.map((w) => ({
    label: weekLabel(w.weekStart),
    partial: w.weekStart === current,
    depositUsdt: w.depositUsdt,
    spendUsd: w.spendUsd,
  }));
  // Older API deploys did not serve `monthly` or `depositsByChain`; those cards stay hidden until they do.
  const months = m.monthly?.map((x) => ({ label: monthLabel(x.month), depositUsdt: x.depositUsdt, spendUsd: x.spendUsd }));
  const chains = m.depositsByChain;
  const weekTitle = (l: string, payload: Array<{ payload?: { partial?: boolean } }>) =>
    `Week of ${l} (UTC)${payload?.[0]?.payload?.partial ? ", in progress" : ""}`;
  const monthTitle = (l: string) => `${l} (UTC)`;

  return (
    <>
      <div className="app-stat-grid grid">
        <FinCard label="Deposits, lifetime" valueClass={STAT_POSITIVE} note={`${fmtInt(m.deposits.count)} deposits`}>
          <Amount value={fmtAmount(m.deposits.totalUsdt)} unit="USDT" />
        </FinCard>
        <FinCard label="Average deposit" valueClass={STAT_POSITIVE} note="Per deposit">
          <Amount value={fmtAmount(m.deposits.avgUsdt)} unit="USDT" />
        </FinCard>
        <FinCard label="Days to first deposit" valueClass={STAT_NEUTRAL} note="Median, from signup">
          {days(m.activation.medianDaysToDeposit)}
        </FinCard>
        <FinCard label="Net card spend, lifetime" valueClass={STAT_NEUTRAL} note={`${fmtInt(s.count)} purchases`}>
          <Amount value={fmtAmount(s.netUsd)} unit="USD" />
        </FinCard>
        <FinCard label="Average purchase" valueClass={STAT_NEUTRAL} note="Net, per purchase">
          <Amount value={fmtAmount(s.avgUsd)} unit="USD" />
        </FinCard>
        <FinCard label="Repeat spenders" valueClass={STAT_NEUTRAL} note={`${fmtInt(s.repeatSpenders)} of ${fmtInt(s.spenders)}, 2+ transactions`}>
          {fmtPct(s.repeatPct)}
        </FinCard>
        <FinCard label="Refunds, lifetime" valueClass={STAT_NEUTRAL} note={`${fmtInt(s.refunds.count)} transactions`}>
          <Amount value={fmtAmount(s.refunds.usd)} unit="USD" />
        </FinCard>
        <FinCard label="Days to first card spend" valueClass={STAT_NEUTRAL} note="Median, from signup">
          {days(m.activation.medianDaysToSpend)}
        </FinCard>
      </div>
      <p className="text-[11px] leading-snug text-ink-faint">
        Net card spend is pending and settled purchases less refunds. Spenders are users with any card transaction, including
        refunded or failed ones.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Deposits per week (USDT), last 12 weeks" className="chart-card">
          <PeriodBars data={weeks} dataKey="depositUsdt" fill={MONEY_IN} unit="USDT" name="Deposits" labelFormatter={weekTitle} />
        </Card>

        {months && (
          <Card title="Deposits per month (USDT)" className="chart-card">
            <PeriodBars data={months} dataKey="depositUsdt" fill={MONEY_IN} unit="USDT" name="Deposits" labelFormatter={monthTitle} />
          </Card>
        )}

        {chains && (
          <Card title="Deposits by chain, lifetime (USDT)" className="chart-card">
            {chains.some((c) => c.usdt > 0) ? (
              <Donut rows={chains.map((c) => ({ name: c.chain, value: c.usdt }))} format={(n) => `${fmtAmount(n)} USDT`} height={CHART_H_SM} />
            ) : (
              <ChartEmpty title="No deposits yet" height={CHART_H_SM} />
            )}
          </Card>
        )}

        <Card title="Net card spend per week (USD), last 12 weeks" className="chart-card">
          <PeriodBars data={weeks} dataKey="spendUsd" fill={ACCENT} unit="USD" name="Net card spend" labelFormatter={weekTitle} />
        </Card>

        {months && (
          <Card title="Net card spend per month (USD)" className="chart-card">
            <PeriodBars data={months} dataKey="spendUsd" fill={ACCENT} unit="USD" name="Net card spend" labelFormatter={monthTitle} />
          </Card>
        )}

        <Card title="Users by lifetime net card spend (USD)" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_H_SM}>
            <BarChart data={s.brackets} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="bracket" {...axisProps} interval={0} />
              <YAxis {...axisProps} allowDecimals={false} width={32} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Users"]} />
              <Bar dataKey="users" fill={SERIES[2]} radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="Net card spend by category, lifetime (USD)" className="chart-card">
          {s.byCategory.some((c) => c.usd > 0) ? (
            <Donut rows={s.byCategory.map((c) => ({ name: c.label, value: c.usd }))} format={(n) => `${fmtAmount(n)} USD`} height={CHART_H} />
          ) : (
            <ChartEmpty title="No card purchases yet" height={CHART_H} />
          )}
        </Card>

        <Card title="Top 10 merchants by net card spend, lifetime" className="chart-card">
          <MiniTable
            rows={s.topMerchants}
            rowKey={(t) => t.merchant}
            empty="No card purchases yet"
            columns={[
              { header: "Merchant", cell: (t) => <span className="text-ink">{t.merchant}</span> },
              { header: "Purchases", align: "right", cell: (t) => fmtInt(t.count) },
              { header: "Net spend (USD)", align: "right", cell: (t) => fmtAmount(t.usd) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

/** One money series per period, compact bars. */
function PeriodBars<T extends { label: string }>({
  data,
  dataKey,
  fill,
  unit,
  name,
  labelFormatter,
}: {
  data: T[];
  dataKey: keyof T & string;
  fill: string;
  unit: string;
  name: string;
  labelFormatter: (label: string, payload: Array<{ payload?: { partial?: boolean } }>) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={CHART_H_SM}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={12} />
        <YAxis {...axisProps} width={44} />
        <Tooltip {...TOOLTIP_STYLE} labelFormatter={labelFormatter} formatter={(v: number) => [`${fmtAmount(v)} ${unit}`, name]} />
        <Bar dataKey={dataKey} fill={fill} radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
