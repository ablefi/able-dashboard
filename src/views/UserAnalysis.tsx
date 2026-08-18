"use client";

import React, { useEffect, useState, useCallback, useMemo, useTransition, useDeferredValue } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Legend, ComposedChart, Line,
} from "recharts";
import { Users, RefreshCw, DollarSign, TrendingUp, UserCheck, Loader2, CalendarRange } from "lucide-react";
import { useUsersApi } from "../api/usersApi";
import { AnalysisStats, AnalysisRow, mapUserToRow, computeUserAnalysis } from "@/lib/userAnalysis";
import { prettyPlace } from "@/lib/countries";
import { platformLabel } from "@/lib/platform";
import { CACHE_KEY, runner, subscribeRunner, startAnalysisRun, type FetchUsersFn } from "@/lib/userAnalysisRunner";
import { loadRows } from "@/lib/analysisRows";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";

const GRID = "rgba(255,255,255,0.05)";
const AX = "rgba(255,255,255,0.10)";
const TICK = "#8499b3";
const GENDER_COLORS: Record<string, string> = { Male: "#3b82f6", Female: "#ec4899", "N/A": "#64748b" };

// Location pies: top slices get the CVD-validated brand-family set (all-pairs
// safe on the navy surface); the folded "Other" is deliberately neutral.
const LOC_COLORS = ["#3b82f6", "#d97706", "#0d9488", "#f43f5e", "#d55181", "#0891b2"];
const OTHER_COLOR = "#64748b";
/** Top-N categories + an "Other" fold, so the pie never cycles hues. */
function foldTop(data: { name: string; count: number }[], n = 6): { name: string; value: number }[] {
  const top = data.slice(0, n).map((d) => ({ name: d.name, value: d.count }));
  const rest = data.slice(n).reduce((s, d) => s + d.count, 0);
  return rest > 0 ? [...top, { name: "Other", value: rest }] : top;
}
/** "🇦🇪 " prefix for a country name in chart labels ("" when unrecognized). */
const flagPrefix = (name: string) => {
  const f = prettyPlace(name).flag;
  return f ? `${f} ` : "";
};

// Brand chart palette + gradient ids (vertical + horizontal variants).
const PALETTE: { id: string; c: string }[] = [
  { id: "gBlue", c: "#3b82f6" },
  { id: "gViolet", c: "#8b5cf6" },
  { id: "gTeal", c: "#2dd4bf" },
  { id: "gEmerald", c: "#34d399" },
  { id: "gCyan", c: "#4fb8e8" },
];
function Gradients() {
  return (
    <defs>
      {PALETTE.map(({ id, c }) => (
        <React.Fragment key={id}>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.95} />
            <stop offset="100%" stopColor={c} stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id={`${id}H`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c} stopOpacity={0.95} />
          </linearGradient>
        </React.Fragment>
      ))}
    </defs>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div className="pt-4 pb-1"><h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2></div>;
}
function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`chart-card rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5 backdrop-blur-sm ${className}`}>
      <h3 className="mb-4 text-sm font-semibold text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.1] bg-jp-navy-card px-3 py-2 text-sm shadow-xl">
      {label && <div className="mb-1 font-medium text-ink">{label}</div>}
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color || e.fill || e.stroke }} />
          <span>{e.name}: {typeof e.value === "number" && e.name?.toLowerCase().includes("spend") ? `$${e.value.toFixed(2)}` : typeof e.value === "number" && e.name?.toLowerCase().includes("rate") ? `${e.value.toFixed(1)}%` : e.value?.toLocaleString?.() || e.value}</span>
        </div>
      ))}
    </div>
  );
}
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-white/[0.1] bg-jp-navy-card px-3 py-2 text-sm shadow-xl">
      <div className="font-medium text-ink">{d.name}</div>
      <div className="text-ink-muted">{d.value.toLocaleString()}</div>
    </div>
  );
}

/**
 * Signup-period presets. These filter on when a user JOINED — the only date
 * the crawl has — so every figure is "users who signed up in this window".
 * Spend is still lifetime-to-date for those users, not spend during it.
 */
const PERIODS = [
  { key: "all", label: "All time", days: null },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "custom", label: "Custom", days: null },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

/** Inclusive [from, to) bounds in ms for a period, or null for all time. */
function periodBounds(key: PeriodKey, fromStr: string, toStr: string): { from: number; to: number } | null {
  if (key === "all") return null;
  if (key === "custom") {
    const from = fromStr ? new Date(`${fromStr}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    // Exclusive upper bound at the start of the day after `to`, so the chosen
    // end date is included in full rather than cut off at midnight.
    const to = toStr ? new Date(`${toStr}T00:00:00`).getTime() + 86_400_000 : Number.POSITIVE_INFINITY;
    return Number.isNaN(from) || Number.isNaN(to) ? null : { from, to };
  }
  const days = PERIODS.find((p) => p.key === key)?.days;
  if (!days) return null;
  return { from: Date.now() - days * 86_400_000, to: Number.POSITIVE_INFINITY };
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const UserAnalysis: React.FC = () => {
  const { fetchUsers } = useUsersApi();
  // The full crawl's result. Everything below renders `stats`/`total`, which
  // are these unless a signup period is selected.
  const [allTotal, setAllTotal] = useState(0);
  const [allStats, setAllStats] = useState<AnalysisStats | null>(null);
  const [computedAt, setComputedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(runner.running);
  const [progress, setProgress] = useState<{ fetched: number; total: number | null }>({ fetched: runner.fetched, total: runner.total });
  const [runError, setRunError] = useState<string | null>(runner.error);
  const [partial, setPartial] = useState(!!runner.result?.partial);

  // Raw rows behind the analysis. Present → the period filter can re-slice
  // without re-crawling; absent → it stays off and we show the all-time cache.
  const [rows, setRows] = useState<AnalysisRow[] | null>(runner.rows);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [slicing, startSlicing] = useTransition();

  const run = useCallback(() => {
    void startAnalysisRun(fetchUsers as FetchUsersFn);
  }, [fetchUsers]);

  // Re-attach to the shared runner: live progress on remount, and the result
  // flows in even when the crawl was started on a previous visit to this tab.
  useEffect(() => {
    const sync = () => {
      setRunning(runner.running);
      setProgress({ fetched: runner.fetched, total: runner.total });
      setRunError(runner.error);
      if (runner.result) {
        setAllTotal(runner.result.total);
        setAllStats(runner.result.stats);
        setComputedAt(runner.result.computedAt);
        setPartial(!!runner.result.partial);
      }
      if (runner.rows) setRows(runner.rows);
    };
    const unsub = subscribeRunner(sync);
    sync();
    return unsub;
  }, []);

  useEffect(() => {
    let hadCache = false;
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (saved && saved.stats) {
        setAllTotal(saved.total || 0);
        setAllStats(saved.stats);
        setComputedAt(saved.computedAt || null);
        hadCache = true;
      }
    } catch {
      /* ignore */
    }
    // Auto-run only when there's nothing cached AND no crawl is already in
    // flight (or freshly finished) from a previous visit to this tab.
    if (!hadCache && !runner.running && !runner.result) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull the last crawl's rows back off disk so the period filter works after
  // a reload. Only when this tab doesn't already hold them in memory.
  useEffect(() => {
    if (runner.rows) return;
    let cancelled = false;
    void loadRows().then((r) => {
      if (!cancelled && r?.rows?.length) setRows(r.rows);
    });
    return () => { cancelled = true; };
  }, []);

  // Defer the date inputs: the re-aggregation is a few hundred ms over ~220k
  // rows, and it must not make the fields themselves feel sticky to type in.
  const deferredFrom = useDeferredValue(customFrom);
  const deferredTo = useDeferredValue(customTo);
  const bounds = useMemo(() => periodBounds(period, deferredFrom, deferredTo), [period, deferredFrom, deferredTo]);
  const pending = slicing || deferredFrom !== customFrom || deferredTo !== customTo;

  // Re-aggregate the sliced rows through the very same function the crawl
  // uses, so a period never computes its numbers differently from all-time.
  const sliced = useMemo(() => {
    if (!bounds || !rows) return null;
    const inRange = rows.filter((u) => {
      if (!u.created_at) return false;
      const t = new Date(u.created_at).getTime();
      return t >= bounds.from && t < bounds.to;
    });
    return computeUserAnalysis(inRange);
  }, [bounds, rows]);

  const filtered = bounds !== null && rows !== null;
  const stats = filtered ? sliced?.stats ?? null : allStats;
  const total = filtered ? sliced?.total ?? 0 : allTotal;
  /** Rows exist, so the period control is live rather than greyed out. */
  const canSlice = rows !== null;

  const pct = progress.total && progress.total > 0 ? Math.min(100, Math.round((progress.fetched / progress.total) * 100)) : 0;
  const axis = { tick: { fontSize: 12, fill: TICK }, stroke: AX };

  // Location breakdowns (fields ship empty until the app update sends them).
  const regionRows = stats?.storeRegionData ?? [];
  const regionCoverage = stats?.regionCoverage ?? 0;
  const countryRows = stats?.userCountryData ?? [];
  const countryCoverage = stats?.countryCoverage ?? 0;
  // Resolve flag + display name from the raw CODE at render time, never from
  // the cached `name`/`flag` strings — those were precomputed by whatever
  // countries.ts shipped when the analysis ran, so a cached result predating
  // alpha-3 support would keep showing bare "USA"/"DEU" forever.
  const regionPie = foldTop(regionRows.map((r) => ({ name: prettyPlace(r.code).label || r.code, count: r.count })));
  const countryPie = foldTop(countryRows);
  const locEmpty = (
    <div className="flex h-[250px] items-center justify-center px-6 text-center text-sm text-ink-faint">
      No data yet — fills in once the app update ships and users&apos; devices report it.
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Analysis"
        subtitle={
          running
            ? "Analyzing…"
            : computedAt
              ? `${total.toLocaleString()} ${filtered ? "signed up in range" : "users"}${partial ? " — PARTIAL" : ""} · refreshed ${timeAgo(computedAt)}`
              : "Run an analysis to get started"
        }
        actions={
          <Button size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {running ? "Running…" : "Refresh"}
          </Button>
        }
      />

      {allStats && (
        <div className="rounded-xl border border-white/[0.06] bg-jp-navy-card/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-ink-faint" />
              <span className="text-xs font-medium text-ink-muted">Signed up</span>
            </div>

            <Tabs
              size="sm"
              active={period}
              onChange={(k) => startSlicing(() => setPeriod(k as PeriodKey))}
              tabs={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
            />

            {period === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-white/[0.08] bg-jp-navy px-2.5 py-1 text-xs text-ink outline-none focus:border-jp-blue/50"
                />
                <span className="text-xs text-ink-faint">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-white/[0.08] bg-jp-navy px-2.5 py-1 text-xs text-ink outline-none focus:border-jp-blue/50"
                />
              </div>
            )}

            {pending && (
              <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                <Loader2 className="h-3 w-3 animate-spin" /> Recalculating…
              </span>
            )}

            {!canSlice && !running && (
              <span className="text-xs text-amber-300/90">
                Hit Refresh once to enable periods — the last run didn&apos;t keep its raw rows.
              </span>
            )}
          </div>

          {/* The crawl only knows when someone joined, so be explicit about
              what a period does and does not mean before anyone reads spend
              as "revenue earned this month". */}
          {filtered && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
              Users who <span className="text-ink-muted">signed up</span> in this window. Spend and conversion are their
              lifetime totals to date, not activity during the window.
            </p>
          )}
        </div>
      )}

      {running && (
        <div className="rounded-xl border border-jp-blue/20 bg-jp-blue/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-jp-blue-light">
            <Loader2 className="h-4 w-4 animate-spin" /> Pulling users from the API…
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-jp-blue transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-ink-muted">
            {progress.fetched.toLocaleString()}{progress.total != null ? ` of ${progress.total.toLocaleString()}` : ""} users
          </div>
        </div>
      )}

      {runError && !running && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          {runError}
        </div>
      )}

      {!stats && !running && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-jp-navy-card/40 py-16 text-center">
          <Users className="mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-sm text-ink-muted">No analysis yet — hit Refresh to crunch the latest users.</p>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Users" value={total.toLocaleString()} icon={Users} />
            <StatCard label="Avg Age" value={stats.avgAge.toFixed(1)} icon={UserCheck} />
            <StatCard label="Conversion Rate" value={`${stats.conversionRate.toFixed(1)}%`} icon={TrendingUp} />
            <StatCard label="Rev / Download" value={`$${stats.revenuePerDownload.toFixed(2)}`} icon={DollarSign} />
            <StatCard label="Avg Spend (Paying)" value={`$${stats.avgSpend.toFixed(2)}`} icon={DollarSign} />
            <StatCard label="Total Revenue" value={`$${Math.round(stats.totalRevenue).toLocaleString()}`} icon={DollarSign} />
          </div>

          {/* Gender */}
          <SectionHeader title="Gender" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Gender Breakdown">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={stats.genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} stroke="none" isAnimationActive={false} label={(p: any) => `${p.name} ${(((p.percent as number) || 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {stats.genderData.map((d) => <Cell key={d.name} fill={GENDER_COLORS[d.name] || "#64748b"} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Conversion Rate by Gender">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.convByGender}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} unit="%" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gViolet)" radius={[6, 6, 0, 0]} maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {stats.convByGender.map((g) => (
                  <div key={g.name} className="rounded-lg bg-white/[0.02] p-2 text-center">
                    <div className="mb-1 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GENDER_COLORS[g.name] }} />{g.name}
                    </div>
                    <div className="text-sm font-medium text-ink-muted">{g.payingCount.toLocaleString()} / {g.totalCount.toLocaleString()}</div>
                    <div className="text-xs text-ink-faint">Rev/DL: ${g.revenuePerDownload.toFixed(2)} | Avg: ${g.avgSpend.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Age */}
          <SectionHeader title="Age" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Age Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.ageData}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Users" fill="url(#gBlue)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Conversion Rate by Age Group">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.convByAge}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} unit="%" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gViolet)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Age at signup, month by month. The headline Avg Age blends every
              cohort, so it can only crawl — this is what actually shows whether
              the people joining are getting older. */}
          {!!stats.ageByCohort?.length && (
            <ChartCard title="Average age at signup, by month joined">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={stats.ageByCohort}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} minTickGap={24} />
                  <YAxis
                    yAxisId="age"
                    {...axis}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tickFormatter={(v: number) => v.toFixed(0)}
                  />
                  <YAxis yAxisId="n" orientation="right" {...axis} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="n" dataKey="count" name="Gave an age" fill="url(#gCyan)" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.5} />
                  <Line yAxisId="age" type="monotone" dataKey="avgAge" name="Avg age" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                Age is asked once at onboarding and never updated, so this is age when they joined — nobody ages
                in place here. Bars are how many of each month answered; read thin months with that in view.
              </p>
            </ChartCard>
          )}

          <ChartCard title="Age Distribution vs Conversion Rate">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.convByAge}>
                <Gradients />
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis yAxisId="left" {...axis} />
                <YAxis yAxisId="right" orientation="right" {...axis} unit="%" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="totalCount" name="Total Users" fill="url(#gBlue)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                <Line yAxisId="right" type="monotone" dataKey="rate" name="Conversion Rate" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Conversion & Revenue by Exact Age">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-jp-navy-card/95 backdrop-blur-sm">
                  <tr className="border-b border-white/[0.06] text-left text-ink-muted">
                    <th className="pb-2 font-medium">Age</th>
                    <th className="pb-2 text-right font-medium">Users</th>
                    <th className="pb-2 text-right font-medium">Paying</th>
                    <th className="pb-2 text-right font-medium">Conv %</th>
                    <th className="pb-2 text-right font-medium">Total Rev</th>
                    <th className="pb-2 text-right font-medium">Rev / DL</th>
                    <th className="pb-2 text-right font-medium">Avg Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.convByExactAge.map((a) => (
                    <tr key={a.age} className="border-b border-white/[0.04]">
                      <td className="py-2 font-medium text-ink">{a.age}</td>
                      <td className="py-2 text-right text-ink-muted num">{a.totalCount.toLocaleString()}</td>
                      <td className="py-2 text-right text-ink-muted num">{a.payingCount.toLocaleString()}</td>
                      <td className={`py-2 text-right num font-medium ${a.rate >= 5 ? "text-amber-300" : "text-ink-muted"}`}>{a.rate.toFixed(1)}%</td>
                      <td className="py-2 text-right font-medium text-ink num">${a.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-ink-muted num">${a.revenuePerDownload.toFixed(2)}</td>
                      <td className="py-2 text-right text-ink-muted num">${a.avgSpend.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-ink-faint">{stats.convByExactAge.length} distinct ages · Unknown/null-age users excluded. Conversion % highlights amber when ≥5%.</p>
          </ChartCard>

          {/* Prayer Habits */}
          <SectionHeader title="Prayer Habits" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Current Daily Prayers Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.prayerDistribution}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Users" fill="url(#gTeal)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-center text-xs text-ink-faint">{stats.prayerAnalysis.count.toLocaleString()} users with prayer data | Avg: {stats.prayerAnalysis.avgCurrent.toFixed(1)} prayers/day</div>
            </ChartCard>
            <ChartCard title="Conversion Rate by Prayer Count">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.convByPrayer}>
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} unit="%" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gViolet)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Personal Journey */}
          <SectionHeader title="Personal Journey" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Journey Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.journeyData} layout="vertical">
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...axis} />
                  <YAxis dataKey="name" type="category" {...axis} width={120} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Users" fill="url(#gEmeraldH)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Conversion Rate by Journey">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.convByJourney} layout="vertical">
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...axis} unit="%" />
                  <YAxis dataKey="name" type="category" {...axis} width={120} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gVioletH)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Acquisition */}
          <SectionHeader title="Acquisition" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="How Users Heard About Us">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.heardData} layout="vertical">
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...axis} />
                  <YAxis dataKey="name" type="category" {...axis} width={120} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Users" fill="url(#gCyanH)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Conversion Rate by Acquisition Channel">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.convByChannel} layout="vertical">
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...axis} unit="%" />
                  <YAxis dataKey="name" type="category" {...axis} width={120} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gVioletH)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Device platform — active sessions ∪ devices (staging backend only for now) */}
          {(stats.platformData ?? []).length > 0 && (
            <>
              <SectionHeader title="Device" />
              <ChartCard title="Users by Device Platform">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-ink-muted">
                        <th className="pb-2 font-medium">Platform</th>
                        <th className="pb-2 text-right font-medium">Users</th>
                        <th className="pb-2 text-right font-medium">% of known</th>
                        <th className="pb-2 text-right font-medium">Paying</th>
                        <th className="pb-2 text-right font-medium">Conv %</th>
                        <th className="pb-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.platformData ?? []).map((p) => (
                        <tr key={p.platform} className="border-b border-white/[0.04]">
                          <td className="py-2 font-medium text-ink">{platformLabel(p.platform)}</td>
                          <td className="py-2 text-right text-ink-muted num">{p.count.toLocaleString()}</td>
                          <td className="py-2 text-right text-ink-muted num">
                            {stats.platformCoverage ? ((p.count / stats.platformCoverage) * 100).toFixed(1) : "0.0"}%
                          </td>
                          <td className="py-2 text-right text-ink-muted num">{p.payingCount.toLocaleString()}</td>
                          <td className="py-2 text-right num font-medium text-jp-blue-light">{p.rate.toFixed(1)}%</td>
                          <td className="py-2 text-right num text-emerald-400">${p.totalSpend.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-ink-faint">
                  {(stats.platformCoverage ?? 0).toLocaleString()} of {total.toLocaleString()} users have an active session or device.
                  A user on more than one platform counts in each, so rows can exceed that total.
                </p>
              </ChartCard>
            </>
          )}

          {/* Location — storefront region + user-reported country (app-sent) */}
          <SectionHeader title="Location" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="App Store Region">
              {regionPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={regionPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} stroke="none" isAnimationActive={false} label={(p: any) => `${flagPrefix(p.name)}${p.name} ${(((p.percent as number) || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {regionPie.map((d, i) => <Cell key={d.name} fill={d.name === "Other" ? OTHER_COLOR : LOC_COLORS[i % LOC_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-center text-xs text-ink-faint">{regionCoverage.toLocaleString()} of {total.toLocaleString()} users report a store region</div>
                </>
              ) : locEmpty}
            </ChartCard>
            <ChartCard title="Country">
              {countryPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={countryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} stroke="none" isAnimationActive={false} label={(p: any) => `${flagPrefix(p.name)}${p.name} ${(((p.percent as number) || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {countryPie.map((d, i) => <Cell key={d.name} fill={d.name === "Other" ? OTHER_COLOR : LOC_COLORS[i % LOC_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-center text-xs text-ink-faint">{countryCoverage.toLocaleString()} of {total.toLocaleString()} users report a country</div>
                </>
              ) : locEmpty}
            </ChartCard>
          </div>

          {(stats.convByRegion ?? []).length > 0 && (
            <ChartCard title="Conversion Rate by App Store Region">
              <ResponsiveContainer width="100%" height={Math.max(250, (stats.convByRegion ?? []).slice(0, 15).length * 26)}>
                <BarChart data={(stats.convByRegion ?? []).slice(0, 15)} layout="vertical">
                  <Gradients />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...axis} unit="%" />
                  <YAxis dataKey="name" type="category" {...axis} width={140} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Conversion Rate" fill="url(#gVioletH)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[11px] text-ink-faint">
                Regions with at least 10 users reporting a store region, best rate first · top 15 of {(stats.convByRegion ?? []).length}.
              </p>
            </ChartCard>
          )}

          <ChartCard title="Users by App Store Region">
            {regionRows.length > 0 ? (
              <>
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-jp-navy-card/95 backdrop-blur-sm">
                      <tr className="border-b border-white/[0.06] text-left text-ink-muted">
                        <th className="w-12 pb-2 font-medium">Flag</th>
                        <th className="pb-2 font-medium">Country</th>
                        <th className="pb-2 text-right font-medium">Code</th>
                        <th className="pb-2 text-right font-medium">Users</th>
                        <th className="pb-2 text-right font-medium">%</th>
                        <th className="pb-2 text-right font-medium">Paying</th>
                        <th className="pb-2 text-right font-medium">Conv %</th>
                        <th className="pb-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionRows.map((r) => (
                        <tr key={r.code} className="border-b border-white/[0.04]">
                          <td className="py-2 text-lg leading-none">{prettyPlace(r.code).flag || "—"}</td>
                          <td className="py-2 font-medium text-ink">{prettyPlace(r.code).label || r.code}</td>
                          <td className="py-2 text-right font-mono text-xs text-ink-faint">{r.code}</td>
                          <td className="py-2 text-right text-ink-muted num">{r.count.toLocaleString()}</td>
                          <td className="py-2 text-right text-ink-muted num">{regionCoverage ? ((r.count / regionCoverage) * 100).toFixed(1) : "0.0"}%</td>
                          <td className="py-2 text-right text-ink-muted num">{(r.payingCount ?? 0).toLocaleString()}</td>
                          <td className="py-2 text-right num font-medium text-jp-blue-light">{(r.rate ?? 0).toFixed(1)}%</td>
                          <td className="py-2 text-right num text-emerald-400">${(r.totalSpend ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-ink-faint">{regionRows.length} region{regionRows.length === 1 ? "" : "s"} · % is of the {regionCoverage.toLocaleString()} users with store-region data.</p>
              </>
            ) : locEmpty}
          </ChartCard>
        </>
      )}
    </div>
  );
};

export default UserAnalysis;
