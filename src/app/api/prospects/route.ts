import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchJpProspects, fetchProspectPosts } from "@/lib/supabaseRest";
import { createProspect, updateProspect, promoteProspect, deleteProspect } from "@/lib/creatorsAdmin";
import type { Creator } from "@/lib/creators";

/**
 * Prospects (jp-prospect tag) — people we're evaluating but not yet working
 * with. Each row gets per-platform + combined average views over the window.
 * Mirrors jp-creators' listProspects. Lives under Research, so gated by the
 * `research` section.
 */
export const maxDuration = 60;

type Bucket = { views: number; count: number };

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") ?? 30)));
    const fromISO = searchParams.get("from") || new Date(Date.now() - days * 86400_000).toISOString();
    const toISO = searchParams.get("to") || new Date().toISOString();

    const list = (await fetchJpProspects(search)) as Creator[];
    if (list.length === 0) return NextResponse.json({ prospects: [], from: fromISO, to: toISO });

    const ids = list.map((c) => c.id);
    const posts = await fetchProspectPosts(ids, fromISO, toISO);

    const stats = new Map<string, { ig: Bucket; tt: Bucket; yt: Bucket }>();
    list.forEach((c) => stats.set(c.id, { ig: { views: 0, count: 0 }, tt: { views: 0, count: 0 }, yt: { views: 0, count: 0 } }));
    for (const p of posts) {
      const s = stats.get(p.creator_id);
      if (!s) continue;
      const slot = p.platform === "instagram" ? s.ig : p.platform === "tiktok" ? s.tt : p.platform === "youtube" ? s.yt : null;
      if (!slot) continue;
      slot.views += p.view_count || 0;
      slot.count += 1;
    }

    const prospects = list.map((c) => {
      const s = stats.get(c.id)!;
      const totalViews = s.ig.views + s.tt.views + s.yt.views;
      const totalPosts = s.ig.count + s.tt.count + s.yt.count;
      return {
        id: c.id, name: c.name, profile_image_url: c.profile_image_url,
        instagram_handle: c.instagram_handle, tiktok_handle: c.tiktok_handle, youtube_handle: c.youtube_handle,
        last_scraped_at: c.last_scraped_at,
        ig_avg_views: s.ig.count > 0 ? Math.round(s.ig.views / s.ig.count) : 0, ig_post_count: s.ig.count,
        tt_avg_views: s.tt.count > 0 ? Math.round(s.tt.views / s.tt.count) : 0, tt_post_count: s.tt.count,
        yt_avg_views: s.yt.count > 0 ? Math.round(s.yt.views / s.yt.count) : 0, yt_post_count: s.yt.count,
        combined_avg_views: totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0,
        total_posts: totalPosts, total_views: totalViews,
      };
    });

    return NextResponse.json({ prospects, from: fromISO, to: toISO });
  } catch (err) {
    console.error("Prospects API error:", err);
    return NextResponse.json({ error: "Failed to load prospects", details: String(err) }, { status: 500 });
  }
}

/** Prospect CRUD — POST { action: create|update|promote|delete, ... }. */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const body = await req.json();
    switch (body.action) {
      case "create": return NextResponse.json(await createProspect(body));
      case "update": return NextResponse.json(await updateProspect(body));
      case "promote": return NextResponse.json(await promoteProspect(String(body.id)));
      case "delete": return NextResponse.json(await deleteProspect(String(body.id)));
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("Prospect manage error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
