"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { ReportError, ReportLoading } from "@/components/ui/ReportState";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import DataTable, { useTablePrefs, type Column } from "@/components/ui/DataTable";
import { useAbleReport } from "@/lib/useAbleReport";
import { STAT_NEGATIVE, STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import { fmtInt, fmtPct } from "@/lib/chartTheme";
import { regionFlag } from "@/lib/countries";
import { cn } from "@/lib/utils";

// GET /compliance (apps/api/src/stats.ts computeCompliance). Phones arrive masked.
interface DeviceSignal {
  ip: string;
  userAgent: string;
  at: string;
}

interface ComplianceDevice {
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
}

interface ComplianceUser {
  userId: string;
  name: string;
  username: string | null;
  phoneMasked: string;
  country: string;
  createdAt: string;
  /** KycState from the provider, or "card_issued" once a card exists. */
  kyc: string;
  signup: DeviceSignal | null;
  lastSignin: DeviceSignal | null;
  devices: ComplianceDevice[];
}

interface ComplianceReport {
  generatedAt: string;
  count: number;
  users: ComplianceUser[];
}

const FIVE_MINUTES = 5 * 60_000;

/** Short device label from a user agent; mirrors the API's platform buckets. */
function uaShort(ua: string | null | undefined): string {
  if (!ua) return "unknown device";
  const able = ua.match(/^Able\/\d+/);
  if (able) return `${able[0]} app`;
  if (/iPhone|iPad|CFNetwork|Darwin/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  const browser = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\//);
  if (!browser) return ua.slice(0, 24);
  return ({ Edg: "Edge", OPR: "Opera" } as Record<string, string>)[browser[1]] ?? browser[1];
}

function kycVariant(kyc: string): "success" | "danger" | "warning" | "default" {
  if (kyc === "card_issued" || kyc === "approved") return "success";
  if (kyc === "rejected" || kyc === "blocked") return "danger";
  if (kyc === "pending" || kyc === "action_required") return "warning";
  return "default";
}

const day = (iso: string | null | undefined) => String(iso ?? "").slice(0, 10);
const dash = <span className="text-ink-faint">-</span>;

/** UTC day for display: "Oct 3", or "Oct 3, 2026" when the rows span years. */
function fmtDate(iso: string | null | undefined, withYear: boolean): string {
  const d = day(iso);
  if (!d) return "-";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

const share = (part: number, whole: number) => (whole > 0 ? fmtPct((part / whole) * 100) : "-");

/** Date, IP and short device on one line; the full user agent is in the hover title. */
function SignalCell({ sig, withYear }: { sig: DeviceSignal | null; withYear: boolean }) {
  if (!sig) return dash;
  return (
    <span title={[day(sig.at), sig.ip || "IP unknown", sig.userAgent || "user agent unknown"].join(", ")}>
      <span className="num text-ink-muted">{fmtDate(sig.at, withYear)}</span>
      <span className="ml-2 text-ink">{sig.ip || "IP unknown"}</span>
      <span className="ml-2 text-[11px] text-ink-faint">{uaShort(sig.userAgent)}</span>
    </span>
  );
}

function columns(withYear: boolean): Column<ComplianceUser>[] {
  return [
    {
      key: "user",
      header: "User",
      width: 190,
      sortValue: (u) => u.name.toLowerCase(),
      cell: (u) => (
        <span title={u.username ? `${u.name} @${u.username}` : u.name}>
          <span className="font-medium text-ink">{u.name}</span>
          {u.username && <span className="ml-1.5 text-[11px] text-ink-faint">@{u.username}</span>}
        </span>
      ),
    },
    {
      key: "userId",
      header: "User ID",
      width: 250,
      sortValue: (u) => u.userId,
      cell: (u) => <code className="font-mono text-[11px] text-ink-muted" title={u.userId}>{u.userId}</code>,
    },
    { key: "phone", header: "Phone", width: 120, sortValue: (u) => u.phoneMasked, cell: (u) => <span className="num">{u.phoneMasked}</span> },
    {
      key: "country",
      header: "Country",
      width: 80,
      sortValue: (u) => u.country,
      cell: (u) => {
        const flag = regionFlag(u.country);
        return <span title={u.country}>{flag ? `${flag} ` : ""}{u.country}</span>;
      },
    },
    {
      key: "kyc",
      header: "KYC",
      width: 115,
      sortValue: (u) => String(u.kyc || "none"),
      cell: (u) => {
        const kyc = String(u.kyc || "none");
        return <Badge variant={kycVariant(kyc)}>{kyc.replace(/_/g, " ")}</Badge>;
      },
    },
    {
      key: "signup",
      header: "Signed up, IP, device",
      width: 280,
      sortValue: (u) => u.createdAt,
      cell: (u) =>
        u.signup ? (
          <SignalCell sig={{ ...u.signup, at: u.createdAt }} withYear={withYear} />
        ) : (
          <span title={day(u.createdAt)}>
            <span className="num text-ink-muted">{fmtDate(u.createdAt, withYear)}</span>
            <span className="ml-2 text-ink-faint">no signup IP</span>
          </span>
        ),
    },
    {
      key: "signin",
      header: "Last sign-in, IP, device",
      width: 280,
      sortValue: (u) => u.lastSignin?.at ?? "",
      cell: (u) => <SignalCell sig={u.lastSignin} withYear={withYear} />,
    },
    {
      key: "devices",
      header: "Devices",
      width: 80,
      align: "right",
      sortValue: (u) => u.devices.length,
      cell: (u) => {
        const list = u.devices
          .map((d) => `${d.ip || "ip unknown"} / ${uaShort(d.userAgent)} / last seen ${day(d.lastSeenAt)}`)
          .join("\n");
        return <span className="num" title={list || undefined}>{fmtInt(u.devices.length)}</span>;
      },
    },
  ];
}

/** Column keys and widths only, for the persisted table preferences. */
const PREF_COLUMNS = columns(false);

export default function Compliance() {
  const { data, at, error, loading, refresh } = useAbleReport<ComplianceReport>("/compliance", { refreshMs: FIVE_MINUTES });
  const prefs = useTablePrefs("able-compliance-users", PREF_COLUMNS);

  const stats = useMemo(() => {
    if (!data) return null;
    // Signup IP -> user count, for the shared-IP fraud signal.
    const ipUsers = new Map<string, number>();
    let withSignupIp = 0;
    const years = new Set<string>();
    for (const u of data.users) {
      years.add(day(u.createdAt).slice(0, 4));
      if (u.lastSignin?.at) years.add(day(u.lastSignin.at).slice(0, 4));
      const ip = u.signup?.ip;
      if (ip) {
        withSignupIp++;
        ipUsers.set(ip, (ipUsers.get(ip) ?? 0) + 1);
      }
    }
    years.delete("");
    const shared = [...ipUsers.values()].filter((n) => n > 1);
    return {
      withSignupIp,
      distinctIps: ipUsers.size,
      sharedIps: shared.length,
      usersOnSharedIps: shared.reduce((n, c) => n + c, 0),
      multiDevice: data.users.filter((u) => u.devices.length > 1).length,
      kycBlocked: data.users.filter((u) => u.kyc === "blocked" || u.kyc === "rejected").length,
      withYear: years.size > 1,
    };
  }, [data]);

  const cols = useMemo(() => columns(stats?.withYear ?? false), [stats?.withYear]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Compliance"
        subtitle={at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <ReportError error={error} onRetry={() => void refresh()} stale={!!data} />}

      {!data || !stats ? (
        !error && (
          <ReportLoading label="Loading compliance" />
        )
      ) : (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          <div className="app-stat-grid grid">
            <FinCard label="Users" valueClass={STAT_NEUTRAL}>{fmtInt(data.count)}</FinCard>
            <FinCard label="Users with signup IP" valueClass={STAT_NEUTRAL} note={`${share(stats.withSignupIp, data.count)} of users`}>
              {fmtInt(stats.withSignupIp)}
            </FinCard>
            <FinCard label="Distinct signup IPs" valueClass={STAT_NEUTRAL}>{fmtInt(stats.distinctIps)}</FinCard>
            <FinCard label="IPs shared by 2+ users" valueClass={stats.sharedIps ? STAT_NEGATIVE : STAT_POSITIVE}>{fmtInt(stats.sharedIps)}</FinCard>
            <FinCard label="Users on a shared signup IP" valueClass={stats.usersOnSharedIps ? STAT_NEGATIVE : STAT_POSITIVE}>
              {fmtInt(stats.usersOnSharedIps)}
            </FinCard>
            <FinCard label="Users with 2+ devices" valueClass={STAT_NEUTRAL}>{fmtInt(stats.multiDevice)}</FinCard>
            <FinCard label="KYC rejected or blocked" valueClass={stats.kycBlocked ? STAT_NEGATIVE : STAT_POSITIVE} note="Provider or Sumsub outcome">
              {fmtInt(stats.kycBlocked)}
            </FinCard>
          </div>

          <Card
            title="Device and IP trail per user"
            bodyClassName="p-0"
            actions={<span className="text-[11px] text-ink-faint num">{fmtInt(data.users.length)} users</span>}
          >
            {data.users.length > 0 ? (
              <DataTable
                columns={cols}
                rows={data.users}
                rowKey={(u) => u.userId}
                hidden={prefs.hidden}
                widths={prefs.widths}
                setWidths={prefs.setWidths}
                defaultSort={{ key: "signup", dir: "desc" }}
              />
            ) : (
              <Empty compact title="No users" />
            )}
            <p className="border-t border-white/[0.06] px-3 py-1.5 text-[11px] text-ink-faint">
              Phones are masked to the country prefix and last 4 digits. IP and device capture began Jul 19, 2026. KYC is
              the provider state, or card issued once a card exists. Hover a Devices count for the device list.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
