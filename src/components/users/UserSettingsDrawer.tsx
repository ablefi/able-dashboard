"use client";

import React, { useEffect, useRef, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import Badge from "@/components/ui/Badge";
import type { User, UserAppSettings } from "@/api/usersApi";
import { useAxios } from "@/api/axiosInstance";
import { accessStatusLabel, accessStatusVariant } from "@/lib/userAccess";
import { fmtDateTime } from "@/lib/dates";
import { accessPlatformFor } from "@/lib/platform";
import { useAuth } from "@/context/AuthContext";

type UserAccess = {
  access: string;
  source: string;
  history: string;
  model: string;
  status: string;
  countryTier: string;
  hasEverPaid: boolean;
  expiresAt?: string | null;
  firstPurchaseContext?: unknown;
  grants?: unknown[];
  reasons?: { subscription?: { status: string; isActive: boolean; expiresAt?: string | null; productId?: string | null } | null; liveGrant?: { reason: string; expiresAt?: string | null; codeBatch?: string | null } | null };
};

/**
 * What one user has actually configured in the app.
 *
 * Two sources sit here side by side and are deliberately NOT merged:
 *
 *  - `settings` — the blob newer app builds upload. Null until someone saves
 *    from a new build, which is the normal case right now.
 *  - `userProfile` — the old per-column values.
 *
 * They are allowed to disagree (a user can have a setting on in one and off in the other),
 * and picking a winner would invent an answer neither source supports. So each
 * is labelled with where it came from and shown as-is.
 */

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  // camelCase enums read better spaced out: someSettingValue -> Some Setting Value
  const s = String(v);
  return /^[a-z]+([A-Z][a-z]*)+$/.test(s) ? s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : s;
};

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-1.5 last:border-0">
      <span className="text-xs text-ink-faint">{label}</span>
      <span className="text-right text-xs font-medium text-ink">{fmt(value)}</span>
    </div>
  );
}

/** Renders only the rows the blob actually contains — a partial blob must not
 *  look like a user who turned everything off. */
function Group({ title, rows }: { title: string; rows: [string, unknown][] }) {
  const present = rows.filter(([, v]) => v !== undefined);
  if (present.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {present.map(([label, v]) => <Row key={label} label={label} value={v} />)}
    </div>
  );
}

export default function UserSettingsDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const axios = useAxios();
  const platform = accessPlatformFor(user?.platforms);
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessReload, setAccessReload] = useState(0);
  // A reload after a grant change keeps the old figures on screen; a new user
  // clears them so one person's access never shows under another's name.
  const accessUserRef = useRef<string | null>(null);
  const { can } = useAuth();
  useEffect(() => {
    if (!user) return;
    let current = true;
    if (accessUserRef.current !== user.id) setAccess(null);
    accessUserRef.current = user.id;
    setAccessError(null);
    setAccessLoading(true);
    axios.get<UserAccess>(`/admin/users/${user.id}/access`, { params: { platform } })
      .then(({ data }) => { if (current) setAccess(data); })
      .catch((error) => { if (current) setAccessError(error.response?.data?.message || "Access details could not be loaded."); })
      .finally(() => { if (current) setAccessLoading(false); });
    return () => { current = false; };
  }, [axios, user?.id, platform, accessReload]);
  const s: UserAppSettings | null = user ? (user.settings ?? user.userProfile?.settings ?? null) : null;
  const prof = user?.userProfile;

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={prof?.name || user?.email || "User"}
      subtitle={user?.email}
      width="lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-app-navy-card/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Account and access</h3>
          </div>
          <Row label="Email" value={user?.email} />
          <Row label="User ID" value={user?.id} />
          <Row label="Joined" value={user?.createdAt ? fmtDateTime(user.createdAt) : null} />
          <Row label="Store region" value={user?.appStoreRegion} />
          <Row label="Total spent" value={user?.totalSpent != null ? `$${user.totalSpent.toFixed(2)}` : null} />
          {accessLoading && <p className="mt-3 text-xs text-ink-muted">Loading access…</p>}
          {accessError && <p className="mt-3 text-xs text-app-red-text">{accessError}</p>}
          {access && <>
            <div className="mt-3 flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
              <span className="text-xs text-ink-faint">Current status</span>
              <Badge variant={accessStatusVariant(access.status)}>{accessStatusLabel(access.status)}</Badge>
            </div>
            <Row label="Access now" value={access.access === "pro" ? "Pro" : "Free"} />
            <Row label="Why" value={access.source === "free_code" ? "Grant" : access.source === "purchase" ? "Purchase" : access.source === "region" ? "Region" : "No Pro source"} />
            <Row label="Ever paid" value={access.hasEverPaid ? "Yes" : "No"} />
            <Row label="Payment history" value={access.history?.replaceAll("_", " ")} />
            <Row label="Paywall model" value={access.model?.replaceAll("_", " ")} />
            <Row label="Country tier" value={access.countryTier} />
            {access.expiresAt && <Row label="Access expires" value={fmtDateTime(access.expiresAt)} />}
            {access.reasons?.liveGrant && <Row label="Live grant" value={`${access.reasons.liveGrant.reason}${access.reasons.liveGrant.expiresAt ? ` · until ${fmtDateTime(access.reasons.liveGrant.expiresAt)}` : " · no expiry"}`} />}
            {access.reasons?.subscription && <Row label="Subscription" value={`${access.reasons.subscription.status}${access.reasons.subscription.productId ? ` · ${access.reasons.subscription.productId}` : ""}`} />}
          </>}
        </div>
        <details className="rounded-xl border border-white/[0.08] bg-app-navy-card/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Show more info · app settings and onboarding</summary>
          <div className="mt-4 space-y-4">
        {!s ? (
          <div className="rounded-xl border border-white/[0.08] bg-app-navy-card/40 p-4 text-sm text-ink-muted">
            <div className="mb-1 font-medium text-ink">No app settings yet</div>
            This user has not saved settings from a build that uploads them. That means unknown,
            not &ldquo;defaults&rdquo;, the old profile values below are all we have for them.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              <Badge variant="info">From the app</Badge>
              {s.updatedAt && <span>updated {new Date(s.updatedAt).toLocaleString()}</span>}
              {s.schemaVersion !== undefined && <span>· schema v{s.schemaVersion}</span>}
            </div>

            {/* Add a <Group> per area of your app's settings here, e.g.
                <Group title="Notifications" rows={[["Enabled", s.notifications?.enabled]]} />
                The raw JSON below always shows everything the app uploaded. */}
          </>
        )}

        <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Onboarding answers
          </h3>
          <p className="mb-2 text-[0.7rem] text-ink-faint">
            Collected at signup. Separate from the app settings above and may disagree with them.
          </p>
          <Row label="Age" value={prof?.age} />
          <Row label="Gender" value={prof?.gender} />
          <Row label="Heard about us from" value={prof?.heard} />
        </div>

        {s && (
          <details className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Raw JSON
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-[0.7rem] leading-relaxed text-ink-faint">
              {JSON.stringify(s, null, 2)}
            </pre>
          </details>
        )}
          </div>
        </details>
      </div>
    </Drawer>
  );
}
