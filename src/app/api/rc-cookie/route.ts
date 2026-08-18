import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchSnapshots, appState, appStateSet } from "@/lib/supabaseRest";

/**
 * RevenueCat cookie status + refresh.
 *
 * The revenue snapshot robot (on Adam's Mac) logs into RevenueCat with a
 * cookie that expires ~monthly. This route lets him refresh it from the
 * dashboard: POST saves the new cookie to app_state (`rc_auth_cookie`),
 * which the robot reads on its next run — no file edit / pm2 restart.
 *
 * GET reports how stale the revenue data is so the dashboard can warn the
 * moment the cookie has died, instead of weeks later.
 */

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "financials");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const [snapshots, cookieMeta] = await Promise.all([fetchSnapshots(null, null), appState("rc_auth_cookie_updated_at")]);
    const latest = snapshots.length ? snapshots[snapshots.length - 1].snapshot_date : null;
    let daysStale = 0;
    if (latest) {
      const today = new Date();
      const last = new Date(latest + "T00:00:00Z");
      daysStale = Math.max(0, Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - last.getTime()) / 86400000));
    }
    return NextResponse.json({ latestSnapshotDate: latest, daysStale, cookieUpdatedAt: typeof cookieMeta === "string" ? cookieMeta : null });
  } catch (err) {
    return NextResponse.json({ error: "Failed to read status", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "financials");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const { cookie } = await req.json();
    const value = String(cookie || "").trim();
    if (value.length < 20) {
      return NextResponse.json({ error: "That doesn't look like a valid cookie (too short)." }, { status: 400 });
    }
    // The robot reads `rc_auth_cookie`; we stamp `_updated_at` for the UI.
    await appStateSet("rc_auth_cookie", value);
    await appStateSet("rc_auth_cookie_updated_at", new Date().toISOString());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save cookie", details: String(err) }, { status: 500 });
  }
}
