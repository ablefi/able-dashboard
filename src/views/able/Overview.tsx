"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import DataTable, { useTablePrefs, type Column } from "@/components/ui/DataTable";
import UserGlobe from "@/components/UserGlobe";
import { useAbleReport } from "@/lib/useAbleReport";
import { STAT_NEGATIVE, STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import {
  ACCENT,
  CHART,
  CHART_H,
  CHART_H_SM,
  MONEY_IN,
  MONEY_OUT,
  SERIES,
  TOOLTIP_STYLE,
  axisProps,
  fmtInt,
  fmtPct,
  fmtUsd,
} from "@/lib/chartTheme";
import { regionFlag, regionName } from "@/lib/countries";
import { cn } from "@/lib/utils";

// ---- API shapes (apps/api/src: server.ts /health, admin.ts /health/upstream, stats.ts computeStats) ----

interface Health {
  ok: boolean;
  service: string;
  store: "postgres" | "memory";
  /** Short deployed commit on Railway, null locally. */
  commit: string | null;
  time: string;
}

interface Upstream {
  ok: boolean;
  immersve: { ok: boolean; baseUrl: string; configured: boolean; partnerConfigured: boolean };
  /** null when the API runs without an Interlace client. */
  interlace: {
    ok: boolean | null;
    baseUrl: string;
    configured: boolean;
    sandbox: boolean;
    binConfigured: boolean;
    chains: string[];
    webhooks: "enabled" | "disabled";
  } | null;
  /** `ms` is measured by the API against Sumsub, not by this browser. */
  sumsub: { enabled: boolean; ok: boolean | null; ms?: number; error?: string } | null;
  routing: {
    default: string;
    immersveCountries: string[];
    interlaceCountries: string[];
    walletModel: "privy" | "none" | "privy_on_demand";
    policy: string;
  } | null;
  chain: { ok: boolean; chainId: number; block: number | null; fundingMode: "approval" | "deposit" };
  otp: { real: boolean };
  store: string;
  /** Immersve webhook listener; Interlace reports its own under `interlace`. */
  webhooks: "enabled" | "disabled";
  time: string;
}

type KycState = "none" | "action_required" | "pending" | "approved" | "rejected" | "blocked";

/**
 * Units: every USDT figure is a decimal number already converted from micro
 * USDT by the API (fromMicro). Card spend is USD, converted from integer cents.
 * Day buckets are UTC calendar days, a fixed zero-filled 30-day axis.
 */
interface Stats {
  generatedAt: string;
  users: { total: number; newLast7d: number; withCustomer: number; withCard: number; withDepositAddress: number; funded: number };
  signupsByDay: { date: string; count: number }[];
  /** ISO alpha-2 signup country, sorted by count descending. */
  byCountry: { code: string; count: number }[];
  funnel: { signedUp: number; customerCreated: number; cardIssued: number; funded: number };
  kyc: Record<KycState, number>;
  balances: { totalUsdt: number; holders: number };
  ledger: { type: string; count: number; volumeUsdt: number }[];
  depositsByDay: { date: string; usdt: number }[];
  cardSpend: {
    count: number;
    volumeUsd: number;
    refundCount: number;
    refundUsd: number;
    byDay: { date: string; usd: number }[];
  };
  referrals: { code: string; count: number }[];
  ageBands: { band: string; count: number }[];
}

// ---- health checks, timed in this browser -------------------------------------

const HEALTH_MS = 60_000;
const STATS_MS = 5 * 60_000;
/** 24 hours of minutely samples. */
const SAMPLE_CAP = 1440;

type Timed<T> = { ok: true; ms: number; value: T } | { ok: false; ms: number; error: string };

/** Round trip through the dashboard's /api/able proxy, so it includes that hop. */
async function timedGet<T>(path: string): Promise<Timed<T>> {
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  try {
    const res = await fetch(`/api/able?path=${encodeURIComponent(path)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, ms: elapsed(), error: body?.error || `HTTP ${res.status}` };
    return { ok: true, ms: elapsed(), value: body as T };
  } catch (e) {
    return { ok: false, ms: elapsed(), error: e instanceof Error ? e.message : "unreachable" };
  }
}

interface HealthCheck {
  at: number;
  api: Timed<Health>;
  upstream: Timed<Upstream>;
}

type ServiceKey =
  | "api" | "db" | "immersve" | "interlace" | "sumsub" | "chain"
  | "immersveWebhooks" | "interlaceWebhooks" | "otp" | "routing";

interface Service {
  key: ServiceKey;
  label: string;
  /** null = not applicable or unknown (neutral), never counted as down. */
  ok: boolean | null;
  ms: number | null;
  sub: string;
}

/** Probes whose pass/fail is tracked for the session uptime figure. */
const UPTIME_KEYS: ReadonlySet<ServiceKey> = new Set(["api", "immersve", "interlace", "sumsub", "chain"]);

interface Sample {
  t: number;
  /** Latency of successful requests only; failures leave a gap. */
  api: number | null;
  upstream: number | null;
  oks: Partial<Record<ServiceKey, boolean>>;
}

function hostOf(url: string | null | undefined): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url || "unknown");
  }
}

const listOrNone = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function buildServices({ api, upstream }: HealthCheck): Service[] {
  const h = api.ok ? api.value : null;
  const up = upstream.ok ? upstream.value : null;
  const probeFailed = upstream.ok ? "" : upstream.error || "probe failed";
  const unknown = (key: ServiceKey, label: string): Service => ({ key, label, ok: null, ms: null, sub: probeFailed });
  const out: Service[] = [];

  out.push({
    key: "api",
    label: "API",
    ok: h?.ok === true,
    ms: api.ms,
    sub: h
      ? `Railway, store: ${h.store || "unknown"}${h.commit ? `, commit ${h.commit}` : ""}`
      : (!api.ok && api.error) || "unreachable",
  });

  // Postgres is reported through the API health payload rather than probed directly.
  const store = h?.store ?? up?.store ?? null;
  out.push({
    key: "db",
    label: "Database",
    ok: store === null ? null : store === "postgres",
    ms: null,
    sub: store === null ? "Unknown, API down" : store === "postgres" ? "Railway Postgres, attached" : `Not on Postgres: ${store}`,
  });

  if (up) {
    const im = up.immersve;
    out.push({
      key: "immersve",
      label: "Immersve",
      ok: im.configured ? im.ok === true : null,
      // One round trip covers every upstream, so this row carries its latency.
      ms: upstream.ms,
      sub: !im.configured
        ? "Not configured, cards disabled"
        : `${im.ok ? "Cards" : "Unreachable"}, ${hostOf(im.baseUrl)}` +
          (im.partnerConfigured ? ", partner keys set" : ", partner keys missing (3DS and webhooks off)"),
    });
  } else {
    out.push(unknown("immersve", "Immersve"));
  }

  const il = up?.interlace;
  if (il) {
    out.push({
      key: "interlace",
      label: "Interlace",
      ok: il.configured ? il.ok === true : null,
      ms: null,
      sub: !il.configured
        ? "Not configured"
        : `${il.ok ? "Cards" : "Unreachable"}, ${hostOf(il.baseUrl)}, ${il.sandbox ? "sandbox" : "production"}` +
          (il.binConfigured ? "" : ", card BIN not set") +
          `, deposits on ${listOrNone(il.chains)}`,
    });
  } else if (!up) {
    out.push(unknown("interlace", "Interlace"));
  }

  if (up) {
    const ss = up.sumsub;
    out.push({
      key: "sumsub",
      label: "Sumsub",
      ok: ss?.enabled ? ss.ok : null,
      ms: ss?.enabled && ss.ms != null ? ss.ms : null,
      sub: !ss || !ss.enabled
        ? "Not configured, identity checks off"
        : ss.ok
          ? "Identity verification reachable, timed by the API"
          : `Unreachable${ss.error ? `, ${ss.error}` : ""}`,
    });

    const ch = up.chain;
    out.push({
      key: "chain",
      label: "BNB Smart Chain",
      ok: ch.ok === true,
      ms: null,
      sub:
        (ch.ok && ch.block != null ? `RPC ok, block ${fmt(ch.block, 0)}` : "RPC unreachable") +
        `, chain ${ch.chainId}, funding mode ${ch.fundingMode || "approval"}`,
    });

    // A webhook listener only matters for a configured provider; otherwise neutral.
    out.push({
      key: "immersveWebhooks",
      label: "Immersve webhooks",
      ok: up.immersve.configured ? up.webhooks === "enabled" : null,
      ms: null,
      sub: up.webhooks === "enabled" ? "Listener token set, payloads wake a re-read" : "Disabled, polling only",
    });
    if (il) {
      out.push({
        key: "interlaceWebhooks",
        label: "Interlace webhooks",
        ok: il.configured ? il.webhooks === "enabled" : null,
        ms: null,
        sub: il.webhooks === "enabled" ? "Listener token set, payloads wake a re-read" : "Disabled, polling only",
      });
    }

    // OTP has no probe, only a mode. Mock codes are a valid dev state, so neutral.
    out.push({
      key: "otp",
      label: "Twilio OTP",
      ok: up.otp?.real ? true : null,
      ms: null,
      sub: up.otp?.real ? "Twilio Verify, real SMS" : "Mock codes, no real SMS",
    });

    const r = up.routing;
    out.push({
      key: "routing",
      label: "Card routing",
      ok: null,
      ms: null,
      sub: r
        ? `Default ${titleCase(r.default)}. Interlace countries: ${listOrNone(r.interlaceCountries)}. ` +
          `Immersve countries: ${listOrNone(r.immersveCountries)}. Wallet model ${r.walletModel}, policy ${r.policy}.`
        : "Not reported",
    });
  } else {
    out.push(
      unknown("sumsub", "Sumsub"),
      unknown("chain", "BNB Smart Chain"),
      unknown("immersveWebhooks", "Immersve webhooks"),
      unknown("otp", "Twilio OTP"),
      unknown("routing", "Card routing"),
    );
  }
  return out;
}

function toSample(check: HealthCheck, services: Service[]): Sample {
  const oks: Sample["oks"] = {};
  for (const s of services) if (UPTIME_KEYS.has(s.key) && s.ok !== null) oks[s.key] = s.ok;
  return {
    t: check.at,
    api: check.api.ok ? check.api.ms : null,
    upstream: check.upstream.ok ? check.upstream.ms : null,
    oks,
  };
}

/** Checks /health and /health/upstream now and every minute while the tab is visible. */
function useHealthChecks() {
  const [latest, setLatest] = useState<HealthCheck | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const [api, upstream] = await Promise.all([timedGet<Health>("/health"), timedGet<Upstream>("/health/upstream")]);
      if (!alive.current) return;
      const result: HealthCheck = { at: Date.now(), api, upstream };
      setLatest(result);
      setSamples((prev) => [...prev.slice(-(SAMPLE_CAP - 1)), toSample(result, buildServices(result))]);
    } finally {
      inFlight.current = false;
      if (alive.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void check();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, HEALTH_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [check]);

  return { latest, samples, checking, check };
}

// ---- formatting -----------------------------------------------------------------

/** Up to `dp` decimals, grouped. Used for USDT amounts and plain counts. */
function fmt(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: dp });
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** "2026-10-02" (a UTC day) -> "Oct 2", or "Oct 2, 2026" when the series spans years. */
const fmtDay = (d: string, withYear = false) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });

const spansYears = (days: { date: string }[]) =>
  days.length > 1 && days[0].date.slice(0, 4) !== days[days.length - 1].date.slice(0, 4);

/** Share of a whole as "12.3%", "-" on an empty base. */
const share = (part: number, whole: number) => (whole > 0 ? fmtPct((part / whole) * 100) : "-");

const LINE_CURSOR = { stroke: "var(--color-rule-strong)", strokeWidth: 1 };

const KYC_SLICES: { key: KycState; label: string; color: string }[] = [
  { key: "none", label: "Not started", color: "var(--color-ink-faint)" },
  { key: "action_required", label: "Action required", color: "var(--color-app-orange)" },
  { key: "pending", label: "Pending", color: "var(--color-app-blue)" },
  { key: "approved", label: "Approved", color: "var(--color-app-green)" },
  { key: "rejected", label: "Rejected", color: "var(--color-app-red-text)" },
  { key: "blocked", label: "Blocked", color: "var(--color-app-violet)" },
];

/** Ledger rows on the Interlace card rail carry a provider-held USD balance, not wallet USDT. */
const ledgerUnit = (type: string) => (type.startsWith("card_") ? "USD" : "USDT");

// ---- small pieces -----------------------------------------------------------------

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-sm font-medium text-ink-faint">{children}</span>;
}

const TH = "text-[11px] font-semibold uppercase tracking-wider text-ink-faint";

function ServicesTable({ services, uptime }: { services: Service[]; uptime: Map<ServiceKey, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left">
            <th className={cn(TH, "w-5")}>
              <span className="sr-only">Status</span>
            </th>
            <th className={TH}>Service</th>
            <th className={TH}>Detail</th>
            <th className={cn(TH, "text-right")}>Latency ms</th>
            <th className={cn(TH, "text-right")}>Uptime</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => {
            const up = uptime.get(s.key);
            return (
              <tr key={s.key} className="border-b border-white/[0.04] align-top text-ink-muted last:border-b-0">
                <td>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 block h-2 w-2 rounded-full",
                      s.ok === null ? "bg-ink-faint/50" : s.ok ? "bg-app-green" : "bg-app-red-text",
                    )}
                  />
                </td>
                <td className="whitespace-nowrap font-medium text-ink">
                  {s.label}
                  <span className="sr-only">{s.ok === null ? ", not checked" : s.ok ? ", up" : ", down"}</span>
                </td>
                <td className="text-xs">
                  {s.ok === false && <span className="font-medium text-app-red-text">Down, </span>}
                  {s.sub}
                </td>
                <td className="text-right num">{s.ms != null ? fmt(s.ms, 0) : "-"}</td>
                <td className="text-right num">{up != null ? fmtPct(up) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChartEmpty({ height, title, description }: { height: number; title: string; description?: string }) {
  return (
    <div style={{ height }}>
      <Empty compact title={title} description={description} />
    </div>
  );
}

// ---- tables -----------------------------------------------------------------------

type LedgerRow = Stats["ledger"][number];
type ReferralRow = Stats["referrals"][number];
type CountryRow = { code: string; label: string; count: number; share: number };

const LEDGER_COLUMNS: Column<LedgerRow>[] = [
  { key: "type", header: "Type", width: 140, cell: (r) => <span className="font-mono text-xs text-ink">{r.type}</span>, sortValue: (r) => r.type },
  { key: "count", header: "Entries", width: 90, align: "right", cell: (r) => <span className="num">{fmtInt(r.count)}</span>, sortValue: (r) => r.count },
  {
    key: "volume",
    header: "Volume",
    width: 150,
    align: "right",
    cell: (r) => (
      <span className="num text-ink">
        {fmt(r.volumeUsdt)} <span className="text-ink-faint">{ledgerUnit(r.type)}</span>
      </span>
    ),
    sortValue: (r) => r.volumeUsdt,
  },
];

const REFERRAL_COLUMNS: Column<ReferralRow>[] = [
  { key: "code", header: "Code", width: 180, cell: (r) => <span className="font-mono text-xs text-ink">{r.code}</span>, sortValue: (r) => r.code },
  { key: "count", header: "Signups", width: 90, align: "right", cell: (r) => <span className="num text-ink">{fmtInt(r.count)}</span>, sortValue: (r) => r.count },
];

const COUNTRY_COLUMNS: Column<CountryRow>[] = [
  { key: "country", header: "Country", width: 200, cell: (r) => <span className="text-ink" title={r.code}>{r.label}</span>, sortValue: (r) => r.label },
  { key: "count", header: "Users", width: 90, align: "right", cell: (r) => <span className="num text-ink">{fmtInt(r.count)}</span>, sortValue: (r) => r.count },
  { key: "share", header: "Share", width: 90, align: "right", cell: (r) => <span className="num">{fmtPct(r.share)}</span>, sortValue: (r) => r.share },
];

// ---- page -------------------------------------------------------------------------

const GRID_3 = "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3";
const GRID_2 = "grid grid-cols-1 gap-3 lg:grid-cols-2";

export default function Overview() {
  const stats = useAbleReport<Stats>("/stats", { refreshMs: STATS_MS });
  const health = useHealthChecks();
  const ledgerPrefs = useTablePrefs("able-overview-ledger", LEDGER_COLUMNS);
  const refPrefs = useTablePrefs("able-overview-referrers", REFERRAL_COLUMNS);
  const countryPrefs = useTablePrefs("able-overview-countries", COUNTRY_COLUMNS);

  const services = useMemo(() => (health.latest ? buildServices(health.latest) : []), [health.latest]);

  const uptime = useMemo(() => {
    const tally = new Map<ServiceKey, { ok: number; n: number }>();
    for (const s of health.samples) {
      for (const [k, ok] of Object.entries(s.oks) as [ServiceKey, boolean][]) {
        const t = tally.get(k) ?? { ok: 0, n: 0 };
        t.n++;
        if (ok) t.ok++;
        tally.set(k, t);
      }
    }
    const out = new Map<ServiceKey, number>();
    for (const [k, t] of tally) out.set(k, Math.round((t.ok / t.n) * 1000) / 10);
    return out;
  }, [health.samples]);

  const known = services.filter((s) => s.ok !== null);
  const anyDown = known.some((s) => s.ok === false);
  const overall = !health.latest
    ? { variant: "default" as const, label: "Checking" }
    : anyDown
      ? { variant: "danger" as const, label: "Issues detected" }
      : known.length > 0
        ? { variant: "success" as const, label: "All systems operational" }
        : { variant: "default" as const, label: "Checking" };

  const s = stats.data;
  const derived = useMemo(() => {
    if (!s) return null;
    const ledgerType = (t: string) => s.ledger.find((x) => x.type === t) ?? { count: 0, volumeUsdt: 0 };
    const yearSig = spansYears(s.signupsByDay);
    const yearDep = spansYears(s.depositsByDay);
    const yearSpend = spansYears(s.cardSpend?.byDay ?? []);
    const days = s.signupsByDay.map((d) => ({ date: d.date, label: fmtDay(d.date, yearSig), count: d.count }));
    const deposits = s.depositsByDay.map((d) => ({ label: fmtDay(d.date, yearDep), usdt: d.usdt }));
    const spend = (s.cardSpend?.byDay ?? []).map((d) => ({ label: fmtDay(d.date, yearSpend), usd: d.usd }));
    // Setup order in the app: deposit address or wallet -> provider account -> card -> funded.
    // Counts are actual user states, so a stage can exceed its predecessor.
    const funnel = [
      { stage: "Signed up", count: s.funnel.signedUp },
      { stage: "Deposit address", count: s.users.withDepositAddress },
      { stage: "Provider account", count: s.funnel.customerCreated },
      { stage: "Has a card", count: s.funnel.cardIssued },
      { stage: "Balance above 0", count: s.funnel.funded },
    ];
    const countryTotal = s.byCountry.reduce((n, c) => n + c.count, 0);
    const countries: CountryRow[] = s.byCountry.map((c) => ({
      code: c.code,
      label: `${regionFlag(c.code)} ${regionName(c.code) || c.code}`.trim(),
      count: c.count,
      share: countryTotal > 0 ? (c.count / countryTotal) * 100 : 0,
    }));
    const kyc = KYC_SLICES.map((k) => ({ ...k, count: s.kyc?.[k.key] ?? 0 }));
    return {
      dep: ledgerType("deposit"),
      out: ledgerType("withdrawal"),
      days,
      deposits,
      spend,
      funnel,
      countries,
      kyc,
      kycTotal: kyc.reduce((n, k) => n + k.count, 0),
    };
  }, [s]);

  const latency = useMemo(
    () => health.samples.map((x) => ({ t: x.t, api: x.api, upstream: x.upstream })),
    [health.samples],
  );

  const refresh = () => {
    void stats.refresh();
    void health.check();
  };
  const busy = stats.loading || health.checking;

  const latest = health.latest;
  const healthUnreachable =
    latest && !latest.api.ok && !latest.upstream.ok ? latest.api.error : null;
  const errors = [
    stats.error ? `Could not load stats: ${stats.error}` : null,
    healthUnreachable ? `Could not check service health: ${healthUnreachable}` : null,
  ].filter((e): e is string => Boolean(e));

  const fade = cn("transition-opacity", stats.loading && "opacity-60");

  return (
    <div className="space-y-3">
      <PageHeader
        title="Dashboard"
        subtitle={stats.at ? `Updated ${clock(stats.at)}` : undefined}
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} disabled={busy}>
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {errors.map((e) => (
        <div key={e} className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">
          {e}
        </div>
      ))}

      {/* ---- Headline numbers ---- */}
      {s && derived ? (
        <div className={cn("app-stat-grid grid", fade)}>
          <FinCard label="Users" valueClass={STAT_NEUTRAL} note={`+${fmtInt(s.users.newLast7d)} in last 7 days`}>
            {fmtInt(s.users.total)}
          </FinCard>
          <FinCard label="Card provider accounts" valueClass={STAT_NEUTRAL} note={`${share(s.users.withCustomer, s.users.total)} of users`}>
            {fmtInt(s.users.withCustomer)}
          </FinCard>
          <FinCard label="Users with a card" valueClass={STAT_NEUTRAL} note={`${share(s.users.withCard, s.users.total)} of users`}>
            {fmtInt(s.users.withCard)}
          </FinCard>
          <FinCard label="Users with deposit address" valueClass={STAT_NEUTRAL} note={`${share(s.users.withDepositAddress, s.users.total)} of users`}>
            {fmtInt(s.users.withDepositAddress)}
          </FinCard>
          <FinCard label="Wallet balances" valueClass={STAT_POSITIVE} note={`${fmtInt(s.balances.holders)} wallets above 0, excl. Interlace`}>
            {fmt(s.balances.totalUsdt)}
            <Unit>USDT</Unit>
          </FinCard>
          <FinCard label="Wallet deposits, all time" valueClass={STAT_POSITIVE} note={`${fmtInt(derived.dep.count)} deposits`}>
            {fmt(derived.dep.volumeUsdt)}
            <Unit>USDT</Unit>
          </FinCard>
          <FinCard label="Withdrawals, all time" valueClass={STAT_NEGATIVE} note={`${fmtInt(derived.out.count)} to external addresses`}>
            {fmt(derived.out.volumeUsdt)}
            <Unit>USDT</Unit>
          </FinCard>
          <FinCard
            label="Net card spend, all time"
            valueClass={STAT_NEGATIVE}
            note={
              `${fmtInt(s.cardSpend?.count ?? 0)} purchases` +
              (s.cardSpend?.refundCount ? `, ${fmtUsd(s.cardSpend.refundUsd, 2)} refunded` : "")
            }
          >
            {fmtUsd(s.cardSpend?.volumeUsd ?? 0, 2)}
          </FinCard>
        </div>
      ) : stats.error ? (
        <Empty compact title="Stats are unavailable" description="Refresh to try again." />
      ) : (
        <div className="flex items-center justify-center py-8 text-sm text-ink-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading stats…
        </div>
      )}

      {/* ---- Services and latency ---- */}
      <div className={GRID_2}>
        <Card
          title="Services"
          actions={
            <>
              {latest && <span className="text-[11px] text-ink-faint">Checked {clock(latest.at)}</span>}
              <Badge variant={overall.variant}>{overall.label}</Badge>
            </>
          }
          bodyClassName="p-0"
        >
          {latest ? (
            <ServicesTable services={services} uptime={uptime} />
          ) : (
            <div className="flex items-center justify-center py-6 text-sm text-ink-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking services…
            </div>
          )}
          <p className="border-t border-white/[0.06] px-3 py-1.5 text-[11px] text-ink-faint">
            Latency and uptime cover this tab&apos;s checks since it opened. Immersve shows the shared upstream probe;
            Sumsub is timed by the API.
          </p>
        </Card>

        <Card title="Round-trip latency per check, this session (ms)" className="chart-card">
          {latency.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_H}>
              <LineChart data={latency}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => clock(t)}
                  minTickGap={40}
                  {...axisProps}
                />
                <YAxis width={40} allowDecimals={false} {...axisProps} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  cursor={LINE_CURSOR}
                  labelFormatter={(t: number) => clock(t)}
                  formatter={(v: number, name: string) => [`${fmt(v, 0)} ms`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" align="right" verticalAlign="top" height={20} />
                <Line
                  name="API /health"
                  type="monotone"
                  dataKey="api"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={latency.length < 3 ? { r: 3 } : false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  name="Upstream probe, all providers"
                  type="monotone"
                  dataKey="upstream"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  dot={latency.length < 3 ? { r: 3 } : false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty height={CHART_H} title="Waiting for the first check" />
          )}
        </Card>
      </div>

      {s && derived && (
        <div className={cn("space-y-3", fade)}>
          {/* ---- Charts ---- */}
          <div className={GRID_3}>
            <Card title="Signups per day, last 30 days" className="chart-card">
              <ResponsiveContainer width="100%" height={CHART_H_SM}>
                <BarChart data={derived.days}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                  <YAxis width={32} allowDecimals={false} {...axisProps} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Signups"]} />
                  <Bar dataKey="count" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Wallet deposits per day, last 30 days (USDT)" className="chart-card">
              <ResponsiveContainer width="100%" height={CHART_H_SM}>
                <AreaChart data={derived.deposits}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                  <YAxis width={48} {...axisProps} tickFormatter={(v: number) => fmt(v, 0)} />
                  <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} formatter={(v: number) => [`${fmt(v)} USDT`, "Deposits"]} />
                  <Area
                    type="monotone"
                    dataKey="usdt"
                    stroke={MONEY_IN}
                    fill={MONEY_IN}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Net card spend per day, last 30 days (USD)" className="chart-card">
              {derived.spend.length > 0 ? (
                <ResponsiveContainer width="100%" height={CHART_H_SM}>
                  <AreaChart data={derived.spend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                    <YAxis width={48} {...axisProps} tickFormatter={(v: number) => fmtUsd(v)} />
                    <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} formatter={(v: number) => [fmtUsd(v, 2), "Card spend"]} />
                    <Area
                      type="monotone"
                      dataKey="usd"
                      stroke={MONEY_OUT}
                      fill={MONEY_OUT}
                      fillOpacity={0.1}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty height={CHART_H_SM} title="No purchases yet" />
              )}
            </Card>

            <Card title="Users by card setup stage, current state" className="chart-card">
              <ResponsiveContainer width="100%" height={CHART_H_SM}>
                <BarChart data={derived.funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axisProps} />
                  <YAxis dataKey="stage" type="category" width={104} interval={0} {...axisProps} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Users"]} />
                  <Bar dataKey="count" fill={ACCENT} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Users by card provider KYC state" className="chart-card">
              {derived.kycTotal > 0 ? (
                <div className="flex items-center gap-4" style={{ height: CHART_H_SM }}>
                  <div className="shrink-0" style={{ width: CHART_H_SM, height: CHART_H_SM }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={derived.kyc.filter((k) => k.count > 0)}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={50}
                          outerRadius={74}
                          stroke="var(--color-app-navy-card)"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {derived.kyc
                            .filter((k) => k.count > 0)
                            .map((k) => (
                              <Cell key={k.key} fill={k.color} />
                            ))}
                        </Pie>
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [fmtInt(v), name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1 text-xs">
                    {derived.kyc.map((k) => (
                      <li key={k.key} className="flex items-center gap-2">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: k.color }} />
                        <span className="min-w-0 flex-1 truncate text-ink-muted">{k.label}</span>
                        <span className="num text-ink">{fmtInt(k.count)}</span>
                        <span className="w-12 text-right text-ink-faint num">{share(k.count, derived.kycTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ChartEmpty height={CHART_H_SM} title="No users yet" />
              )}
            </Card>

            <Card title="Users by age band, with a date of birth" className="chart-card">
              {s.ageBands.length > 0 ? (
                <ResponsiveContainer width="100%" height={CHART_H_SM}>
                  <BarChart data={s.ageBands}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="band" interval={0} {...axisProps} />
                    <YAxis width={32} allowDecimals={false} {...axisProps} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtInt(v), "Users"]} />
                    <Bar dataKey="count" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty height={CHART_H_SM} title="No dates of birth yet" />
              )}
            </Card>
          </div>

          {/* ---- Geography ---- */}
          <div className={GRID_2}>
            <UserGlobe countries={s.byCountry} compact title="Users by country of residence, map" />

            <Card title={`Users by country of residence, ${fmtInt(derived.countries.length)} countries`} bodyClassName="p-0">
              {derived.countries.length > 0 ? (
                <DataTable
                  columns={COUNTRY_COLUMNS}
                  rows={derived.countries}
                  rowKey={(r) => r.code}
                  hidden={countryPrefs.hidden}
                  widths={countryPrefs.widths}
                  setWidths={countryPrefs.setWidths}
                  defaultSort={{ key: "count", dir: "desc" }}
                  className="max-h-[22rem]"
                />
              ) : (
                <Empty compact title="No signups yet" />
              )}
            </Card>
          </div>

          {/* ---- Tables ---- */}
          <div className={GRID_2}>
            <Card title="Ledger entries by type, all time, excluding failed" bodyClassName="p-0">
              {s.ledger.length > 0 ? (
                <DataTable
                  columns={LEDGER_COLUMNS}
                  rows={s.ledger}
                  rowKey={(r) => r.type}
                  hidden={ledgerPrefs.hidden}
                  widths={ledgerPrefs.widths}
                  setWidths={ledgerPrefs.setWidths}
                  defaultSort={{ key: "volume", dir: "desc" }}
                  className="max-h-[28rem]"
                />
              ) : (
                <Empty compact title="No ledger activity yet" />
              )}
            </Card>

            <Card title="Top 10 invite codes by signups" bodyClassName="p-0">
              {s.referrals.length > 0 ? (
                <DataTable
                  columns={REFERRAL_COLUMNS}
                  rows={s.referrals}
                  rowKey={(r) => r.code}
                  hidden={refPrefs.hidden}
                  widths={refPrefs.widths}
                  setWidths={refPrefs.setWidths}
                  defaultSort={{ key: "count", dir: "desc" }}
                  className="max-h-[28rem]"
                />
              ) : (
                <Empty compact title="No referrals yet" />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
