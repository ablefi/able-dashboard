import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
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
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { action, id, windowDays } = await req.json();
    const days = Math.max(1, Math.min(365, Number(windowDays ?? 30)));

    if (action === "creator") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await pullCreatorPosts(String(id), days));
    }
    if (action === "persona") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await pullPersonaPosts(String(id), days));
    }
    if (action === "all") {
      return NextResponse.json(await refreshAllCreators(days));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Refresh error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
