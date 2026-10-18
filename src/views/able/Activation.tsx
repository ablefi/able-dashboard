"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import { CHART, SERIES, TOOLTIP_STYLE, axisProps, fmtInt, fmtPct } from "@/lib/chartTheme";
import { regionName } from "@/lib/countries";
import { STAT_NEUTRAL } from "@/lib/statColors";
import ReportPage, { CHART_HEIGHT, ChartEmpty, MiniTable } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  type FunnelStage,
  type MarketingFunnelStage,
  type MarketingReport,
} from "./marketingTypes";

const STAGE_LABELS: Record<FunnelStage, string> = {
  signedUp: "Signed up",
  kycStarted: "KYC started",
  kycApproved: "KYC approved",
  cardIssued: "Card issued",
  deposited: "Deposited",
  spender: "Spent on card",
};

const stageLabel = (s: string) => STAGE_LABELS[s as FunnelStage] ?? s;

type RateRow = { label: string; pct: number; users: number; deposited: number; name: string };

export default function Activation() {
  return (
    <ReportPage<MarketingReport> title="Activation funnel" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => <ActivationBody m={m} />}
    </ReportPage>
  );
}

function ActivationBody({ m }: { m: MarketingReport }) {
  const stage = (key: FunnelStage): MarketingFunnelStage =>
    m.funnel.find((s) => s.stage === key) ?? { stage: key, count: 0, pctOfPrevious: null, pctOfAll: null };
  const kyc = stage("kycApproved");
  const card = stage("cardIssued");
  const dep = stage("deposited");
  const spend = stage("spender");

  const journey = m.funnel.map((s) => ({ label: stageLabel(s.stage), count: s.count }));
  // Bars show the deposit rate; the axis label carries the base so a 100% band of one user reads as such.
  const ages: RateRow[] = m.conversionByAge.map((a) => ({
    label: `${a.band} (${a.users})`,
    name: a.band,
    pct: a.pct ?? 0,
    users: a.users,
    deposited: a.deposited,
  }));
  const countries: RateRow[] = m.conversionByCountry.map((c) => ({
    label: `${c.code} (${c.users})`,
    name: regionName(c.code) || c.code,
    pct: c.pct ?? 0,
    users: c.users,
    deposited: c.deposited,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FinCard label="KYC approval" valueClass={STAT_NEUTRAL} note="Of everyone who signed up">
          {fmtPct(kyc.pctOfAll)}
        </FinCard>
        <FinCard label="Card issue rate" valueClass={STAT_NEUTRAL} note={`${fmtInt(card.count)} cards issued`}>
          {fmtPct(card.pctOfAll)}
        </FinCard>
        <FinCard label="Deposit activation" valueClass={STAT_NEUTRAL} note={`${fmtInt(dep.count)} users ever deposited`}>
          {fmtPct(dep.pctOfAll)}
        </FinCard>
        <FinCard label="Spender rate" valueClass={STAT_NEUTRAL} note={`${fmtInt(spend.count)} users spent on card`}>
          {fmtPct(spend.pctOfAll)}
        </FinCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Journey stages" className="chart-card">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={journey} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={96} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Users"]} />
              <Bar dataKey="count" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Stages follow the app&apos;s happy path, but each count is the users in that state now, so a later stage can exceed an earlier one.
          </p>
        </Card>

        <Card title="Stage conversion" className="chart-card">
          <MiniTable
            rows={m.funnel}
            rowKey={(s) => s.stage}
            empty="No users yet"
            columns={[
              { header: "Stage", cell: (s) => <span className="text-ink">{stageLabel(s.stage)}</span> },
              { header: "Users", align: "right", cell: (s) => fmtInt(s.count) },
              { header: "% of previous", align: "right", cell: (s) => fmtPct(s.pctOfPrevious) },
              { header: "% of all", align: "right", cell: (s) => fmtPct(s.pctOfAll) },
            ]}
          />
        </Card>

        <Card title="Deposit activation by age band" className="chart-card">
          {ages.length > 0 ? <RateChart rows={ages} fill={SERIES[2]} /> : <ChartEmpty title="No dates of birth yet" />}
        </Card>

        <Card title="Deposit activation by country" className="chart-card">
          {countries.length > 0 ? <RateChart rows={countries} fill={SERIES[3]} /> : <ChartEmpty title="No users yet" />}
        </Card>
      </div>
    </>
  );
}

function RateChart({ rows, fill }: { rows: RateRow[]; fill: string }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={0} angle={rows.length > 6 ? -35 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} height={rows.length > 6 ? 48 : 30} />
        <YAxis {...axisProps} width={40} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(_: string, payload: Array<{ payload?: RateRow }>) => payload?.[0]?.payload?.name ?? ""}
          formatter={(v: number, _n: string, item: { payload: RateRow }) => [
            `${fmtPct(v)} (${fmtInt(item.payload.deposited)} of ${fmtInt(item.payload.users)})`,
            "Deposited",
          ]}
        />
        <Bar dataKey="pct" fill={fill} radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
