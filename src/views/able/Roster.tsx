"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import { SortTh } from "@/components/ui/SortableHeader";
import { searchAbleUsersByPhone, useAbleReport } from "@/lib/useAbleReport";
import { STAT_NEUTRAL } from "@/lib/statColors";
import { ACCENT, CHART, CHART_H, SERIES, TOOLTIP_STYLE, axisProps, fmtInt, fmtPct, fmtUsd } from "@/lib/chartTheme";
import { regionFlag } from "@/lib/countries";
import { cn } from "@/lib/utils";

// GET /marketing (apps/api/src/marketing.ts computeMarketing); only the fields this
// page reads. `roster` and `platforms` shipped in later API deploys, so both are optional.
interface RosterRow {
  userId: string;
  name: string;
  username: string | null;
  /** Country prefix and last 4 digits, masked by the API. */
  phoneMasked: string;
  country: string;
  ageBand: string | null;
  createdAt: string;
  referredBy: string | null;
  /** KycState from the provider, or "card_issued" once a card exists. */
  kyc: string;
  balanceUsdt: number;
  depositUsdt: number;
  spendUsd: number;
  txns: number;
  lastActiveAt: string;
}

interface PlatformRow {
  label: string;
  users: number;
  activeLast30d: number;
}

interface MarketingReport {
  generatedAt: string;
  users: {
    total: number;
    newLast7d?: number;
    newLast30d?: number;
    /** Users who signed up with an invite code. */
    referred?: number;
    referredPct?: number | null;
    /** Any sign-in or trusted-device sighting in the window; signup itself counts. */
    activeLast7d?: number;
    activeLast30d?: number;
    avgAge: number | null;
  };
  deposits: { perSignupUsdt: number };
  spend: { perSignupUsd: number };
  platforms?: PlatformRow[];
  roster?: RosterRow[];
}

type SortKey = keyof Pick<RosterRow,
  "name" | "phoneMasked" | "country" | "ageBand" | "createdAt" | "referredBy" | "kyc"
  | "balanceUsdt" | "depositUsdt" | "spendUsd" | "txns" | "lastActiveAt">;

const FIVE_MINUTES = 5 * 60_000;
// A fresh text column sorts ascending; numbers and dates start descending.
const TEXT_COLS: SortKey[] = ["name", "phoneMasked", "country", "ageBand", "referredBy", "kyc"];

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "name", label: "User" },
  { key: "phoneMasked", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "ageBand", label: "Age band" },
  { key: "createdAt", label: "Joined" },
  { key: "referredBy", label: "Invite code" },
  { key: "kyc", label: "KYC" },
  { key: "balanceUsdt", label: "Wallet USDT", right: true },
  { key: "depositUsdt", label: "Deposited USDT", right: true },
  { key: "spendUsd", label: "Net spend USD", right: true },
  { key: "txns", label: "Card txns", right: true },
  { key: "lastActiveAt", label: "Last active" },
];

const inputCls =
  "h-7 w-full min-w-0 rounded-md border border-white/[0.08] bg-app-navy-light/60 px-2 text-xs text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none sm:w-56";
const labelCls = "text-[11px] font-medium uppercase tracking-wider text-ink-faint";
const btnCls = "h-7 rounded-md px-2.5 text-xs";

/** UTC calendar day, YYYY-MM-DD. The CSV keeps this form. */
const day = (iso: string | null | undefined) => String(iso ?? "").slice(0, 10);
/** UTC day for the table: "Oct 3", or "Oct 3, 2026" when the loaded rows span years. */
const fmtDate = (iso: string | null | undefined, withYear: boolean) => {
  const d = day(iso);
  if (!d) return "-";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
};
/** Share of all users as "12.3%", "-" when either side is unknown. */
const share = (part: number | null | undefined, whole: number) => (part == null || whole <= 0 ? "-" : fmtPct((part / whole) * 100));
const fmtNum = (n: number | null | undefined, dp = 2) =>
  n == null ? "-" : Number(n).toLocaleString("en-US", { maximumFractionDigits: dp });
const dash = <span className="text-ink-faint">-</span>;

function kycVariant(kyc: string): "success" | "danger" | "warning" | "default" {
  if (kyc === "card_issued" || kyc === "approved") return "success";
  if (kyc === "rejected" || kyc === "blocked") return "danger";
  if (kyc === "pending" || kyc === "action_required") return "warning";
  return "default";
}

/** Blanks sink in both directions, as in the Ops roster. */
function sortRows(rows: RosterRow[], key: SortKey, dir: 1 | -1): RosterRow[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : 1) * dir;
  });
}

const CSV_HEADERS = ["User", "Phone", "Country", "Age band", "Joined", "Code used", "KYC", "Balance USDT", "Deposited USDT", "Spent USD", "Purchases", "Last active"];

function csvValues(r: RosterRow): (string | number)[] {
  return [
    r.name + (r.username ? ` @${r.username}` : ""), r.phoneMasked, r.country, r.ageBand ?? "",
    day(r.createdAt), r.referredBy ?? "", r.kyc, r.balanceUsdt, r.depositUsdt,
    r.spendUsd, r.txns, day(r.lastActiveAt),
  ];
}

function csvCell(v: string | number | null | undefined, userText = false): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Names are free text from the signup form; keep spreadsheets from running them as formulas.
  if (userText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: RosterRow[]) {
  const lines = [CSV_HEADERS.join(",")].concat(
    rows.map((r) => csvValues(r).map((v, i) => csvCell(v, i === 0)).join(",")),
  );
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "able-users.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Roster() {
  const { data, at, error, loading, refresh } = useAbleReport<MarketingReport>("/marketing", { refreshMs: FIVE_MINUTES });

  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneRows, setPhoneRows] = useState<RosterRow[] | null>(null);
  const [phoneStatus, setPhoneStatus] = useState("");
  const [searching, setSearching] = useState(false);
  // Bumped by every input change so a slow search cannot overwrite a newer view.
  const phoneRequest = useRef(0);

  const roster = data?.roster;

  const rows = useMemo(() => {
    if (!roster) return [];
    const q = query.trim().toLowerCase();
    let base = phoneRows ?? roster;
    if (q) {
      base = base.filter((r) =>
        [r.name, r.username, r.referredBy, r.country, r.kyc].some((v) => v && String(v).toLowerCase().includes(q)));
    }
    return sortRows(base, sort.key, sort.dir);
  }, [roster, phoneRows, query, sort]);

  const resetPhone = () => {
    phoneRequest.current++;
    setPhoneRows(null);
    setPhoneStatus("");
    setSearching(false);
  };

  const filterLoaded = (value: string) => {
    resetPhone();
    setPhone("");
    setQuery(value);
  };

  const searchPhone = async (e: FormEvent) => {
    e.preventDefault();
    const value = phone.trim();
    if (!value) {
      setPhoneStatus("Enter a complete phone number.");
      return;
    }
    const request = ++phoneRequest.current;
    setSearching(true);
    setPhoneStatus("Searching…");
    try {
      const found = await searchAbleUsersByPhone<RosterRow>(value);
      if (request !== phoneRequest.current) return;
      setPhoneRows(found);
      setQuery("");
      setPhoneStatus(found.length ? `Found ${found.length} user${found.length === 1 ? "" : "s"}.` : "No user found.");
    } catch (err) {
      if (request === phoneRequest.current) setPhoneStatus(err instanceof Error && err.message ? err.message : "Search failed.");
    } finally {
      if (request === phoneRequest.current) setSearching(false);
    }
  };

  const toggleSort = (k: string) => {
    const key = k as SortKey;
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 1 ? -1 : 1 }
      : { key, dir: TEXT_COLS.includes(key) ? 1 : -1 });
  };


  // Show the year only when the loaded dates span more than one.
  const withYear = useMemo(() => {
    const years = new Set<string>();
    for (const r of roster ?? []) {
      years.add(day(r.createdAt).slice(0, 4));
      years.add(day(r.lastActiveAt).slice(0, 4));
    }
    years.delete("");
    return years.size > 1;
  }, [roster]);

  const heading = phoneRows !== null ? "Phone search results" : query.trim() ? "Users matching filter" : "All users";
  const countLine = !data || !roster ? "" : phoneRows === null
    ? `${rows.length.toLocaleString()} of ${data.users.total.toLocaleString()} users`
      + (data.users.total > roster.length ? `, newest ${roster.length.toLocaleString()} loaded` : "")
    : `${rows.length.toLocaleString()} matching user${rows.length === 1 ? "" : "s"}`;

  const platforms = data?.platforms;
  const u = data?.users;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Users"
        subtitle={at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">Could not load users: {error}</div>}

      {!data || !u ? (
        !error && (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading users…
          </div>
        )
      ) : (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          <div className="app-stat-grid grid">
            <FinCard label="Users" valueClass={STAT_NEUTRAL} note={u.newLast7d != null ? `+${fmtInt(u.newLast7d)} in last 7 days` : undefined}>
              {fmtInt(u.total)}
            </FinCard>
            <FinCard label="New users, last 30 days" valueClass={STAT_NEUTRAL} note={`${share(u.newLast30d, u.total)} of users`}>
              {fmtInt(u.newLast30d)}
            </FinCard>
            <FinCard label="Active, last 7 days" valueClass={STAT_NEUTRAL} note="Signed in or device seen">
              {fmtInt(u.activeLast7d)}
            </FinCard>
            <FinCard label="Active, last 30 days" valueClass={STAT_NEUTRAL} note={`${share(u.activeLast30d, u.total)} of users`}>
              {fmtInt(u.activeLast30d)}
            </FinCard>
            <FinCard label="Signed up with invite code" valueClass={STAT_NEUTRAL} note={u.referredPct != null ? `${fmtPct(u.referredPct)} of users` : undefined}>
              {fmtInt(u.referred)}
            </FinCard>
            <FinCard label="Average age, years" valueClass={STAT_NEUTRAL} note="Users with a date of birth">
              {u.avgAge === null ? "-" : fmtNum(u.avgAge, 1)}
            </FinCard>
            <FinCard label="Deposits per signup" valueClass={STAT_NEUTRAL} note="All time, over all users">
              {fmtNum(data.deposits.perSignupUsdt)} <span className="text-sm font-medium text-ink-faint">USDT</span>
            </FinCard>
            <FinCard label="Net card spend per signup" valueClass={STAT_NEUTRAL} note="All time, over all users">
              {fmtUsd(data.spend.perSignupUsd, 2)}
            </FinCard>
          </div>

          {platforms && (
            <Card title="Users by last-seen platform and app build" className="chart-card">
              {platforms.length > 0 ? (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={platforms} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} interval={0} />
                    <YAxis width={36} {...axisProps} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [fmtInt(v), name]} />
                    <Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} height={20} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="users" name="All users" fill={SERIES[1]} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                    <Bar dataKey="activeLast30d" name="Active, last 30 days" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: CHART_H }}><Empty compact title="No device data yet" /></div>
              )}
            </Card>
          )}

          {!roster ? (
            <Empty compact title="The user roster is not available yet" description="The API deploy serving this report does not include the roster." />
          ) : (
            <Card
              title={heading}
              bodyClassName="p-0"
              actions={<span className="text-[11px] text-ink-faint num">{countLine}</span>}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] px-3 py-2">
                <form className="flex min-w-0 flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); filterLoaded(query); }}>
                  <label htmlFor="roster-filter" className={labelCls}>Filter loaded</label>
                  <input
                    id="roster-filter"
                    type="search"
                    placeholder="Name, username, code, country, KYC"
                    className={inputCls}
                    value={query}
                    onChange={(e) => filterLoaded(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="secondary" className={btnCls}>Search</Button>
                  <Button type="button" size="sm" variant="ghost" className={btnCls} onClick={() => filterLoaded("")}>Clear</Button>
                </form>
                <form className="flex min-w-0 flex-wrap items-center gap-1.5" onSubmit={searchPhone}>
                  <label htmlFor="roster-phone" className={labelCls}>Full phone</label>
                  <input
                    id="roster-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="0562356156 or +971562356156"
                    className={inputCls}
                    value={phone}
                    onChange={(e) => { resetPhone(); setPhone(e.target.value); }}
                  />
                  <Button type="submit" size="sm" variant="secondary" className={btnCls} disabled={searching}>
                    {searching && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Search
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className={btnCls} onClick={() => { resetPhone(); setPhone(""); }}>Clear</Button>
                  {phoneStatus && <span role="status" aria-live="polite" className="text-xs text-ink-muted">{phoneStatus}</span>}
                </form>
                <Button size="sm" variant="secondary" className={cn(btnCls, "ml-auto")} onClick={() => downloadCsv(rows)} disabled={rows.length === 0}>
                  <Download className="h-3.5 w-3.5" /> Export visible CSV
                </Button>
              </div>

              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="sticky top-0 z-10 bg-app-navy-card">
                    <tr className="border-b border-white/[0.06] text-left">
                      {COLUMNS.map((c) => (
                        <SortTh
                          key={c.key}
                          label={c.label}
                          sortKey={c.key}
                          active={sort.key === c.key}
                          dir={sort.dir === 1 ? "asc" : "desc"}
                          onToggle={toggleSort}
                          className={cn("whitespace-nowrap", c.right && "text-right")}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const flag = regionFlag(r.country);
                      return (
                        <tr key={r.userId} className="whitespace-nowrap border-b border-white/[0.04] align-middle text-ink-muted hover:bg-white/[0.02]">
                          <td className="max-w-[16rem] truncate" title={r.username ? `${r.name} @${r.username}` : r.name}>
                            <span className="font-medium text-ink">{r.name}</span>
                            {r.username && <span className="ml-1.5 text-[11px] text-ink-faint">@{r.username}</span>}
                          </td>
                          <td className="num">{r.phoneMasked}</td>
                          <td title={r.country}>{flag ? `${flag} ` : ""}{r.country}</td>
                          <td>{r.ageBand ?? dash}</td>
                          <td className="num" title={day(r.createdAt)}>{fmtDate(r.createdAt, withYear)}</td>
                          <td>{r.referredBy ?? dash}</td>
                          <td><Badge variant={kycVariant(r.kyc)}>{String(r.kyc).replace(/_/g, " ")}</Badge></td>
                          <td className="text-right num">{fmtNum(r.balanceUsdt)}</td>
                          <td className="text-right num">{fmtNum(r.depositUsdt)}</td>
                          <td className="text-right num">{fmtNum(r.spendUsd)}</td>
                          <td className="text-right num">{fmtInt(r.txns)}</td>
                          <td className="num" title={day(r.lastActiveAt)}>{fmtDate(r.lastActiveAt, withYear)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <Empty compact title="No matching users" />}
              </div>
              <p className="border-t border-white/[0.06] px-3 py-1.5 text-[11px] text-ink-faint">
                Phones are masked to the country prefix and last 4 digits.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
