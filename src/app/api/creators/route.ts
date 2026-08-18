import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchCreatorsUniverse, fetchRosterStats, fetchCreatorPostsForStats, appState } from "@/lib/supabaseRest";
import { computeRoster, rosterFromAggregates, type Creator } from "@/lib/creators";

/**
 * Creators roster — top-level jp-creators with post/view stats over a window
 * (personas roll up their children). Mirrors jp-creators' listCreators +
 * getCreatorCounts. Gated by the `creators` section.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "active";
    const type = searchParams.get("type") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") ?? 30)));
    const fromISO = searchParams.get("from") || new Date(Date.now() - days * 86400_000).toISOString();
    const toISO = searchParams.get("to") || new Date().toISOString();

    // ONE parallel burst: every creator row (the table is ~100 rows — top-level,
    // children and prospects come from the same call), the per-creator counted
    // aggregates from the DB function, and the SC credit balance. This replaced
    // a 4-stage sequential chain (2× creators + children + paged raw posts)
    // that paid cross-region latency on every hop.
    const [universe, agg, scCredits] = await Promise.all([
      fetchCreatorsUniverse() as Promise<Creator[]>,
      fetchRosterStats(fromISO, toISO).catch(() => null), // null → JS fallback below
      appState("sc_credits").then((v) => (typeof v?.remaining === "number" ? v.remaining : null)).catch(() => null),
    ]);

    const isJp = (c: Creator) => (c.tags ?? []).includes("jp-creators");
    const allTopLevel = universe.filter((c) => isJp(c) && !c.parent_id);
    const counts = {
      active: allTopLevel.filter((c) => c.status === "active").length,
      archived: allTopLevel.filter((c) => c.status === "archived").length,
      total: allTopLevel.length,
    };

    let list = allTopLevel;
    if (status !== "all") list = list.filter((c) => c.status === status);
    if (type !== "all") list = list.filter((c) => c.type === type);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

    const personaIds = new Set(list.filter((c) => c.type === "persona").map((c) => c.id));
    const children = universe.filter((c) => c.parent_id && personaIds.has(c.parent_id));

    let roster;
    if (agg) {
      roster = rosterFromAggregates(list, children, agg);
    } else {
      // Fallback (RPC unavailable): the original raw-rows path.
      const ids = new Set<string>();
      list.forEach((c) => ids.add(c.id));
      children.forEach((c) => ids.add(c.id));
      const posts = await fetchCreatorPostsForStats([...ids], fromISO, toISO);
      roster = computeRoster(list, children, posts);
    }
    return NextResponse.json({ creators: roster, counts, scCredits, from: fromISO, to: toISO });
  } catch (err) {
    console.error("Creators API error:", err);
    return NextResponse.json({ error: "Failed to load creators", details: String(err) }, { status: 500 });
  }
}
