import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { requireCreatorsSession, assertCreatorInMarket, marketCreatorIds, marketErrorStatus } from "@/lib/creatorMarket";
import { pullCreatorPosts, pullPersonaPosts, refreshAllCreators } from "@/lib/scrape";

/**
 * Manual refresh — pulls fresh posts from ScrapeCreators. POST { action, id?, windowDays? }:
 *   - creator : pull one creator's posts (id required)
 *   - persona : fan out to a persona's children (id = persona)
 *   - all     : refresh every active leaf creator (the Refresh-all button)
 * Gated by `creators`.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;

  try {
    const { action, id, windowDays } = await req.json();
    const days = Math.max(1, Math.min(365, Number(windowDays ?? 30)));

    if (action === "creator") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await assertCreatorInMarket(String(id), market);
      return NextResponse.json(await pullCreatorPosts(String(id), days));
    }
    if (action === "persona") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await assertCreatorInMarket(String(id), market);
      return NextResponse.json(await pullPersonaPosts(String(id), days));
    }
    if (action === "all") {
      // Only this section's creators: no spending credits on the other one.
      return NextResponse.json(await refreshAllCreators(days, await marketCreatorIds(market)));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const status = marketErrorStatus(err);
    if (status) return NextResponse.json({ ok: false, error: String((err as Error).message) }, { status });
    console.error("Refresh error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
