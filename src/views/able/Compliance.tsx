"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import { useAbleReport } from "@/lib/useAbleReport";
import { STAT_NEGATIVE, STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import { fmtInt } from "@/lib/chartTheme";
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

function IpCell({ sig }: { sig: DeviceSignal | null }) {
  if (!sig?.ip) return dash;
  return (
    <div className="min-w-0">
      <span className="block truncate text-ink" title={sig.ip}>{sig.ip}</span>
      <span className="block truncate text-[11px] text-ink-faint" title={sig.userAgent || ""}>{uaShort(sig.userAgent)}</span>
    </div>
  );
}

const COLUMNS: { label: string; width: number; right?: boolean }[] = [
  { label: "User ID", width: 265 },
  { label: "Name", width: 180 },
  { label: "Phone", width: 130 },
  { label: "Country", width: 80 },
  { label: "KYC", width: 135 },
  { label: "Signup date", width: 110 },
  { label: "Signup IP / device", width: 180 },
  { label: "Last signin", width: 110 },
  { label: "Signin IP / device", width: 180 },
  { label: "Devices", width: 90, right: true },
];

export default function Compliance() {
  const { data, at, error, loading, refresh } = useAbleReport<ComplianceReport>("/compliance", { refreshMs: FIVE_MINUTES });

  const stats = useMemo(() => {
    if (!data) return null;
    // Signup IP -> user count, for the shared-IP fraud signal.
    const ipUsers = new Map<string, number>();
    let withSignupIp = 0;
    for (const u of data.users) {
      const ip = u.signup?.ip;
      if (ip) {
        withSignupIp++;
        ipUsers.set(ip, (ipUsers.get(ip) ?? 0) + 1);
      }
    }
    return {
      withSignupIp,
      distinctIps: ipUsers.size,
      sharedIps: [...ipUsers.values()].filter((n) => n > 1).length,
      kycBlocked: data.users.filter((u) => u.kyc === "blocked" || u.kyc === "rejected").length,
    };
  }, [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compliance"
        subtitle={at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Device and IP trail per user"}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">Could not load compliance data: {error}</div>}

      {!data || !stats ? (
        !error && (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading compliance data…
          </div>
        )
      ) : (
        <div className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4 transition-opacity"}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <FinCard label="Users" valueClass={STAT_NEUTRAL}>{fmtInt(data.count)}</FinCard>
            <FinCard label="Users with signup IP" valueClass={STAT_NEUTRAL}>{fmtInt(stats.withSignupIp)}</FinCard>
            <FinCard label="Distinct signup IPs" valueClass={STAT_NEUTRAL}>{fmtInt(stats.distinctIps)}</FinCard>
            <FinCard label="IPs shared by 2+ users" valueClass={stats.sharedIps ? STAT_NEGATIVE : STAT_POSITIVE}>{fmtInt(stats.sharedIps)}</FinCard>
            <FinCard label="KYC rejected or blocked" valueClass={stats.kycBlocked ? STAT_NEGATIVE : STAT_POSITIVE} note="Card provider KYC outcome">
              {fmtInt(stats.kycBlocked)}
            </FinCard>
          </div>

          <Card title="Users (newest first)" bodyClassName="p-0">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: COLUMNS.reduce((n, c) => n + c.width, 0) }}>
                <colgroup>
                  {COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-app-navy-card">
                  <tr className="border-b border-white/[0.06] text-left">
                    {COLUMNS.map((c) => (
                      <th key={c.label} className={cn("px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint", c.right && "text-right")}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => {
                    const kyc = String(u.kyc || "none");
                    const deviceList = u.devices
                      .map((d) => `${d.ip || "ip unknown"} / ${uaShort(d.userAgent)} / last seen ${day(d.lastSeenAt)}`)
                      .join("\n");
                    const flag = regionFlag(u.country);
                    return (
                      <tr key={u.userId} className="border-b border-white/[0.04] align-middle text-ink-muted hover:bg-white/[0.02]">
                        <td className="truncate px-4 py-3"><code className="font-mono text-xs text-ink-muted" title={u.userId}>{u.userId}</code></td>
                        <td className="px-4 py-3">
                          <span className="block truncate font-medium text-ink" title={u.name}>{u.name}</span>
                          {u.username && <span className="block truncate text-[11px] text-ink-faint" title={`@${u.username}`}>@{u.username}</span>}
                        </td>
                        <td className="truncate px-4 py-3 num">{u.phoneMasked}</td>
                        <td className="truncate px-4 py-3" title={u.country}>{flag ? `${flag} ` : ""}{u.country}</td>
                        <td className="px-4 py-3"><Badge variant={kycVariant(kyc)}>{kyc.replace(/_/g, " ")}</Badge></td>
                        <td className="px-4 py-3 num">{day(u.createdAt)}</td>
                        <td className="px-4 py-3"><IpCell sig={u.signup} /></td>
                        <td className="px-4 py-3 num">{u.lastSignin ? day(u.lastSignin.at) : dash}</td>
                        <td className="px-4 py-3"><IpCell sig={u.lastSignin} /></td>
                        <td className="px-4 py-3 text-right num" title={deviceList || undefined}>{fmtInt(u.devices.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.users.length === 0 && <Empty compact title="No users" />}
            </div>
            <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-ink-faint">
              Phones are masked to the country prefix and last 4 digits. Hover the Devices count for the per-device list. IP and device capture began 2026-07-19.
              KYC shows the provider state, or Card issued once a card exists.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
