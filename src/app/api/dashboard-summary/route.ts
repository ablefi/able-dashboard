import { NextRequest, NextResponse } from "next/server";
import { requireSession, backendBaseFor } from "@/lib/auth";
import { fetchSnapshots, fetchRosterStats, fetchCreatorsUniverse } from "@/lib/supabaseRest";
import { getRcOverview } from "@/lib/rc";

/** Home period flows plus closing subscriptions. Views are the latest counted
 * views on roster creators' posts published in the selected period. Rating has
 * no reliable daily history, so it is always current. */

/** Your App Store app id (the number in the App Store URL). */
const APPLE_APP_ID = process.env.APPLE_APP_ID || "";
const STOREFRONTS = ["us", "gb", "ca", "au", "fr", "de", "nl", "se", "sa", "ae", "eg", "kw", "qa", "tr", "id", "my", "sg", "pk", "in", "bd", "ma", "dz", "ng", "za"];

async function getAppRating(): Promise<{ rating: number | null; reviews: number }> {
  if (!APPLE_APP_ID) return { rating: null, reviews: 0 };
  try {
    const results = await Promise.all(
      STOREFRONTS.map(async (c) => {
        try {
          const r = await fetch(`https://itunes.apple.com/lookup?id=${APPLE_APP_ID}&country=${c}`, {
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

/**
 * Total users, fetched as the SIGNED-IN admin rather than with the stored
 * master credential.
 *
 * Two reasons. It respects their permissions — someone without `users:read`
 * gets null and the tile simply shows nothing, instead of a number the API
 * would refuse them. And it removes a dependency on the shared credential in
 * the environment, which silently breaks this whole page whenever that
 * password is rotated on the backend.
 */
async function getTotalUsers(req: NextRequest, token: string, from?: string, to?: string): Promise<number | null> {
  try {
    const host = req.headers.get("host") || "";
    if (!token) return null;
    const params = new URLSearchParams({ page: "1", limit: "1" });
    if (from) params.set("createdAtStart", `${from}T00:00:00.000Z`);
    if (to) params.set("createdAtEnd", `${to}T23:59:59.999Z`);
    const res = await fetch(`${backendBaseFor(host)}/admin/users?${params}`, {
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

  const from = req.nextUrl.searchParams.get("from") || undefined;
  const requestedTo = req.nextUrl.searchParams.get("to") || undefined;
  const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!!from !== !!requestedTo || (from && requestedTo && (!validDay(from) || !validDay(requestedTo) || from > requestedTo))) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const to = requestedTo && requestedTo < today ? requestedTo : today;
  const historical = to < today;
  try {
    const [snapshots, rc, rating, totalUsers, views] = await Promise.all([
      fetchSnapshots(null, to),
      historical ? Promise.resolve(null) : getRcOverview(),
      getAppRating(),
      getTotalUsers(req, guard.session.backendToken, from, from ? to : undefined),
      Promise.all([
        fetchRosterStats(`${from || "2000-01-01"}T00:00:00.000Z`, `${to}T23:59:59.999Z`),
        fetchCreatorsUniverse(),
      ]).then(([stats, creators]) => {
        const tagged = new Set(creators.filter(c => (c.tags || []).includes("roster")).map(c => c.id));
        const ids = new Set(creators.filter(c => tagged.has(c.id) || tagged.has(c.parent_id)).map(c => c.id));
        // Each account appears once; personas must not double-count child posts.
        return stats.filter(row => ids.has(row.creator_id)).reduce((sum, row) => sum + (Number(row.counted_views) || 0), 0);
      }).catch(() => null),
    ]);
    const period = snapshots.filter(row => !from || row.snapshot_date >= from);
    const totalRevenue = period.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
    const totalDownloads = period.reduce((sum, row) => sum + (Number(row.new_customers) || 0), 0);
    const last = snapshots.at(-1);
    const activeSubscriptions = historical ? last?.active_subscriptions ?? null : rc?.overview.active_subscriptions ?? null;

    return NextResponse.json({
      totalRevenue,
      totalDownloads,
      totalUsers,
      views,
      activeSubscriptions,
      subscriptionsDate: historical ? last?.snapshot_date ?? null : null,
      appRating: rating.rating,
      appReviews: rating.reviews,
      rcOk: rc?.ok ?? !!last,
      latestSnapshotDate: snapshots.length ? snapshots[snapshots.length - 1].snapshot_date : null,
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    return NextResponse.json({ error: "Failed to load dashboard", details: String(err) }, { status: 500 });
  }
}
