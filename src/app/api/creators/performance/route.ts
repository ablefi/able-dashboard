import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { requireCreatorsSession, marketCreatorIds } from "@/lib/creatorMarket";
import { fetchLeafCreators, fetchPerformancePosts, fetchSnapshots } from "@/lib/supabaseRest";
import { computePerformance, type Creator, type Granularity, type PerfPost, type PerfScope } from "@/lib/creators";

/**
 * Performance analytics for Creators › Performance. Mirrors roster'
 * getPerformanceStats: post roll-up with day/week/month buckets, per-platform
 * aggregation, and a by-views leaderboard. `scope=counted` (default) is the
 * for-us view (approval-gated); `scope=all` covers every post — the general
 * baseline. Gated by `creators`.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;

  try {
    const { searchParams } = new URL(req.url);
    const granularity = (["day", "week", "month"].includes(searchParams.get("granularity") || "") ? searchParams.get("granularity") : "day") as Granularity;
    const platform = searchParams.get("platform") || "all";
    const creatorType = searchParams.get("creator_type") || "all";
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") ?? 30)));
    const fromISO = searchParams.get("from") || new Date(Date.now() - days * 86400_000).toISOString();
    const toISO = searchParams.get("to") || new Date().toISOString();

    // Leaf creators only (personas have no posts of their own; children roll up).
    const inMarket = await marketCreatorIds(market);
    let leaves = ((await fetchLeafCreators()) as Creator[]).filter((c) => inMarket.has(c.id));
    if (creatorType !== "all") leaves = leaves.filter((c) => c.type === creatorType);
    const creatorMap = new Map(leaves.map((c) => [c.id, c]));
    const ids = leaves.map((c) => c.id);

    const scope: PerfScope = searchParams.get("scope") === "all" ? "all" : "counted";
    const posts = (await fetchPerformancePosts(ids, fromISO, toISO, platform)) as PerfPost[];
    const stats = computePerformance(posts, creatorMap, granularity, scope);

    // Installs over the same window, for the installs-per-1k-views ratio.
    // These are TOTAL app installs from RevenueCat — every source, not just
    // creators — so the ratio is two independent totals side by side, not an
    // attribution. Best effort: a snapshot problem shouldn't take the whole
    // performance page down.
    let installs: number | null = null;
    try {
      const snaps = await fetchSnapshots(fromISO.slice(0, 10), toISO.slice(0, 10));
      installs = snaps.reduce((sum, s) => sum + (Number(s.new_customers) || 0), 0);
    } catch (err) {
      console.error("Performance API: installs lookup failed", err);
    }

    return NextResponse.json({ ...stats, installs, from: fromISO, to: toISO, granularity });
  } catch (err) {
    console.error("Performance API error:", err);
    return NextResponse.json({ error: "Failed to load performance", details: String(err) }, { status: 500 });
  }
}
