import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBackendToken, backendBaseFor } from "@/lib/auth";
import { fetchSnapshots, countRows, expenseStats, appState } from "@/lib/supabaseRest";
import { getRcOverview } from "@/lib/rc";

/**
 * Home Dashboard headline metrics (Adam's spec):
 * - totalRevenue: ALL-TIME GROSS (Σ daily snapshot revenue) — not estimated
 * - totalDownloads: Σ new_customers across snapshots
 * - totalUsers: registered accounts from the NestJS backend (caller's token
 *   forwarded — same backend the dashboard deployment targets)
 * - onboarding completion = users / downloads (computed client-side)
 * - freeCodesSent, activeSubscriptions (RC), cashRemaining
 * - appRating: Just Pray's App Store rating + review count, summed across
 *   the major storefronts (a single-country lookup vastly undercounts)
 */

const JP_APP_ID = "6747154163";
const STOREFRONTS = ["us", "gb", "ca", "au", "fr", "de", "nl", "se", "sa", "ae", "eg", "kw", "qa", "tr", "id", "my", "sg", "pk", "in", "bd", "ma", "dz", "ng", "za"];

async function getAppRating(): Promise<{ rating: number | null; reviews: number }> {
  try {
    const results = await Promise.all(
      STOREFRONTS.map(async (c) => {
        try {
          const r = await fetch(`https://itunes.apple.com/lookup?id=${JP_APP_ID}&country=${c}`, {
            signal: AbortSignal.timeout(6000),
            cache: "no-store",
          });
          if (!r.ok) return null;
          const d = await r.json();
          const app = d.results?.[0];
          if (!app) return null;
          return { rating: Number(app.averageUserRating) || 0, count: Number(app.userRatingCount) || 0 };
        } catch {
          return null;
        }
      })
    );
    let weighted = 0;
    let total = 0;
    for (const r of results) {
      if (!r || !r.count) continue;
      weighted += r.rating * r.count;
      total += r.count;
    }
    return { rating: total > 0 ? weighted / total : null, reviews: total };
  } catch {
    return { rating: null, reviews: 0 };
  }
}

async function getTotalUsers(req: NextRequest): Promise<number | null> {
  try {
    const host = req.headers.get("host") || "";
    const token = await getBackendToken(host); // server-minted master token
    if (!token) return null;
    const res = await fetch(`${backendBaseFor(host)}/admin/users?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.meta?.total === "number" ? d.meta.total : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "dashboard");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const [snapshots, freeCodesSent, rc, rating, totalUsers, incomeStats, costStats, startingCapitalRaw] = await Promise.all([
      fetchSnapshots(null, null),
      countRows(["code_sent=eq.true"]),
      getRcOverview(),
      getAppRating(),
      getTotalUsers(req),
      expenseStats({ category: "Income", excludeIncome: false }),
      expenseStats({ excludeIncome: true }),
      appState("starting_capital"),
    ]);

    const totalRevenue = snapshots.reduce((s, x) => s + (Number(x.revenue) || 0), 0);
    const totalDownloads = snapshots.reduce((s, x) => s + (Number(x.new_customers) || 0), 0);
    const startingCapital = typeof startingCapitalRaw === "number" ? startingCapitalRaw : 20000;

    return NextResponse.json({
      totalRevenue,
      totalDownloads,
      totalUsers,
      freeCodesSent,
      activeSubscriptions: rc.overview.active_subscriptions,
      cashRemaining: startingCapital + incomeStats.total - costStats.total,
      appRating: rating.rating,
      appReviews: rating.reviews,
      rcOk: rc.ok,
      latestSnapshotDate: snapshots.length ? snapshots[snapshots.length - 1].snapshot_date : null,
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    return NextResponse.json({ error: "Failed to load dashboard", details: String(err) }, { status: 500 });
  }
}
