"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import { ACCENT, CHART, SERIES, TOOLTIP_STYLE, axisProps, fmtInt, fmtPct } from "@/lib/chartTheme";
import { STAT_NEUTRAL } from "@/lib/statColors";
import ReportPage, { Amount, CHART_HEIGHT, ChartEmpty, Donut, MiniTable } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  fmtAmount,
  weekLabel,
  type MarketingReport,
} from "./marketingTypes";

export default function CardSpend() {
  return (
    <ReportPage<MarketingReport> title="Card spend" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => <CardSpendBody m={m} />}
    </ReportPage>
  );
}

function CardSpendBody({ m }: { m: MarketingReport }) {
  const s = m.spend;
  const weeks = m.weekly.map((w) => ({ week: weekLabel(w.weekStart), spendUsd: w.spendUsd }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FinCard label="Net card spend" valueClass={STAT_NEUTRAL} note={`${fmtInt(s.count)} purchases, lifetime`}>
          <Amount value={fmtAmount(s.netUsd)} unit="USD" />
        </FinCard>
        <FinCard label="Average purchase" valueClass={STAT_NEUTRAL}>
          <Amount value={fmtAmount(s.avgUsd)} unit="USD" />
        </FinCard>
        <FinCard
          label="Repeat spenders"
          valueClass={STAT_NEUTRAL}
          note={`${fmtInt(s.repeatSpenders)} of ${fmtInt(s.spenders)} spenders bought twice or more`}
        >
          {fmtPct(s.repeatPct)}
        </FinCard>
        <FinCard label="Refunds" valueClass={STAT_NEUTRAL} note={`${fmtInt(s.refunds.count)} refunded purchases`}>
          <Amount value={fmtAmount(s.refunds.usd)} unit="USD" />
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Card spend per week (USD)" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={48} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(l: string) => `Week of ${l}`} formatter={(v: number) => [`${fmtAmount(v)} USD`, "Card spend"]} />
              <Area type="monotone" dataKey="spendUsd" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.12} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Spend by category" className="chart-card">
          {s.byCategory.some((c) => c.usd > 0) ? (
            <Donut rows={s.byCategory.map((c) => ({ name: c.label, value: c.usd }))} format={(n) => `${fmtAmount(n)} USD`} />
          ) : (
            <ChartEmpty title="No card purchases yet" />
          )}
        </Card>

        <Card title="Top merchants" className="chart-card">
          <MiniTable
            rows={s.topMerchants}
            rowKey={(t) => t.merchant}
            empty="No card purchases yet"
            columns={[
              { header: "Merchant", cell: (t) => <span className="text-ink">{t.merchant}</span> },
              { header: "Purchases", align: "right", cell: (t) => fmtInt(t.count) },
              { header: "USD", align: "right", cell: (t) => fmtAmount(t.usd) },
            ]}
          />
        </Card>

        <Card title="Lifetime spend per spender" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={s.brackets}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="bracket" {...axisProps} interval={0} />
              <YAxis {...axisProps} allowDecimals={false} width={36} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Spenders"]} />
              <Bar dataKey="users" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}
