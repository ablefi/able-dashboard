import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { requireCreatorsSession, assertCreatorInMarket, marketErrorStatus } from "@/lib/creatorMarket";
import { pullCreatorProfile, pullAudienceCountry } from "@/lib/scrape";

/**
 * POST { action: "profile" | "audience", id }. Refreshes a creator's
 * avatar/profile (cached to the creator-avatars bucket) or pulls TikTok
 * audience-by-country demographics (~26 credits). Gated by `creators`.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;
  try {
    const { action, id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await assertCreatorInMarket(String(id), market);
    if (action === "audience") return NextResponse.json(await pullAudienceCountry(String(id)));
    return NextResponse.json(await pullCreatorProfile(String(id)));
  } catch (err) {
    const status = marketErrorStatus(err);
    if (status) return NextResponse.json({ ok: false, error: String((err as Error).message) }, { status });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
