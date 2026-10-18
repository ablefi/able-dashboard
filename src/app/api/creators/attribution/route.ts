import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { requireCreatorsSession, marketCreatorIds } from "@/lib/creatorMarket";
import { readAttribution, refreshAttribution } from "@/lib/attributionStore";

/**
 * Creator attribution, from the onboarding "how did you hear about us" answer.
 *
 *   GET  — the stored payload. Cheap; the Creators pages read this.
 *   POST — recompute from the backend and store. Takes ~30s, so it is the
 *          8-hourly cron's job; this exists for a manual refresh.
 *
 * Gated by `creators`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;
  try {
    const attribution = await readAttribution(req.headers.get("host") ?? "");
    if (!attribution) return NextResponse.json({ attribution });
    // Per-creator figures for this section's creators only.
    const inMarket = await marketCreatorIds(market);
    return NextResponse.json({ attribution: { ...attribution, creators: attribution.creators.filter((c) => inMarket.has(c.creatorId)) } });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;
  try {
    if (market === "alt") return NextResponse.json({ error: "Recomputing attribution is done from the main Creators section; it covers both sections." }, { status: 400 });
    const result = await refreshAttribution(req.headers.get("host") ?? "");
    if ("error" in result) return NextResponse.json({ ok: false, ...result }, { status: 502 });
    return NextResponse.json({ ok: true, attribution: result });
  } catch (err) {
    return NextResponse.json({ error: "Failed to refresh", details: String(err) }, { status: 500 });
  }
}
