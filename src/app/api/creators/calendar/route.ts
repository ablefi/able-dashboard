import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchLeafCreators, fetchCalendarPosts } from "@/lib/supabaseRest";
import { postCounts, slugForCreator, type Creator, type CreatorType } from "@/lib/creators";

/**
 * Content-calendar heatmap for Creators › Calendar. For a given month
 * returns, per day, the set of creators who shipped a counted post —
 * deduped per creator per day. Mirrors jp-creators' calendar page.
 * Gated by `creators`.
 */
export const maxDuration = 60;

function monthBounds(monthStr: string) {
  const [y, m] = monthStr.split("-").map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const fmtMonth = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: fmtMonth(prev),
    next: fmtMonth(next),
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") || "") ? searchParams.get("month")! : fallback;
    const bounds = monthBounds(month);

    const creators = (await fetchLeafCreators()) as Creator[];
    const byId = new Map(creators.map((c) => [c.id, c]));
    const posts = await fetchCalendarPosts(creators.map((c) => c.id), bounds.startISO, bounds.endISO);

    const days: Record<string, { id: string; name: string; profile_image_url: string | null; slug: string }[]> = {};
    const seenPerDay = new Map<string, Set<string>>();
    const uniqueCreators = new Set<string>();
    let totalPosts = 0;

    for (const p of posts) {
      const c = byId.get(p.creator_id);
      if (!c) continue;
      if (!postCounts(c.type as CreatorType, { creator_id: p.creator_id, url: p.url, view_count: 0, approved: p.approved, excluded: p.excluded })) continue;
      totalPosts++;
      uniqueCreators.add(c.id);
      const iso = String(p.posted_at).slice(0, 10);
      let seen = seenPerDay.get(iso);
      if (!seen) { seen = new Set(); seenPerDay.set(iso, seen); days[iso] = []; }
      if (!seen.has(c.id)) {
        seen.add(c.id);
        days[iso].push({ id: c.id, name: c.name, profile_image_url: c.profile_image_url, slug: slugForCreator(c) });
      }
    }

    return NextResponse.json({ month, label: bounds.label, prev: bounds.prev, next: bounds.next, totalPosts, totalCreators: uniqueCreators.size, days });
  } catch (err) {
    console.error("Calendar API error:", err);
    return NextResponse.json({ error: "Failed to load calendar", details: String(err) }, { status: 500 });
  }
}
