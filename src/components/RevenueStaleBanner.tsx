"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Check, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Smoke alarm + one-click refresh for the RevenueCat cookie.
 *
 * The snapshot robot (on Adam's Mac) uses a cookie that dies ~monthly. When
 * it dies, revenue stops updating. This banner appears the moment data goes
 * stale and lets him paste a fresh cookie straight from the dashboard — it
 * saves to app_state, and the robot picks it up on its next run.
 *
 * Add `?refreshcookie=1` to the URL to open the refresh box proactively
 * (e.g. to migrate the cookie before it expires).
 */

const STALE_DAYS = 2;

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function RevenueStaleBanner() {
  const [status, setStatus] = useState<{ daysStale: number; latestSnapshotDate: string | null; cookieUpdatedAt: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [cookie, setCookie] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rc-cookie", { headers: authHeaders() });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("refreshcookie")) setOpen(true);
  }, [load]);

  const stale = (status?.daysStale ?? 0) >= STALE_DAYS;
  if (!stale && !open) return null;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/rc-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ cookie }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      setSaved(true);
      setCookie("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`overflow-hidden rounded-xl border ${stale ? "border-amber-500/40 bg-amber-500/10" : "border-white/[0.1] bg-jp-navy-card/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className={`h-4 w-4 shrink-0 ${stale ? "text-amber-300" : "text-ink-muted"}`} />
          {stale ? (
            <span className="text-amber-200">
              Revenue data is <strong>{status?.daysStale} {status?.daysStale === 1 ? "day" : "days"}</strong> old — the RevenueCat cookie has likely expired and the snapshot robot has stopped.
            </span>
          ) : (
            <span className="text-ink-muted">Refresh the RevenueCat cookie.</span>
          )}
        </div>
        <Button size="sm" variant={stale ? "primary" : "secondary"} onClick={() => setOpen((o) => !o)}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh cookie
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/[0.08] px-4 py-4">
          {saved ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Check className="h-4 w-4" /> Saved. The robot will use the new cookie on its next run (within ~3 hours) and this warning will clear.
            </div>
          ) : (
            <>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-ink-muted">
                <li>
                  Open <a href="https://app.revenuecat.com" target="_blank" rel="noopener noreferrer" className="text-jp-blue-light hover:underline">app.revenuecat.com</a> in Chrome (logged in).
                </li>
                <li>
                  Press <kbd className="rounded bg-white/[0.08] px-1 font-mono">⌥⌘I</kbd> → <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>app.revenuecat.com</strong>.
                </li>
                <li>
                  Click the row named <code className="rounded bg-white/[0.08] px-1 font-mono">rc_auth_token</code> and copy its <strong>Value</strong>.
                </li>
                <li>Paste it below and Save.</li>
              </ol>
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                rows={3}
                placeholder="Paste the rc_auth_token value here…"
                className="w-full resize-y rounded-lg border border-white/[0.08] bg-jp-navy-light/60 p-2.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none"
              />
              {err && <div className="text-xs text-rose-300">{err}</div>}
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={save} disabled={saving || cookie.trim().length < 20}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save cookie
                </Button>
                {status?.cookieUpdatedAt && (
                  <span className="text-[11px] text-ink-faint">Last refreshed {new Date(status.cookieUpdatedAt).toLocaleString()}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
