import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchCreatorBySlug, fetchCreatorById, fetchCreatorChildren, fetchPostsWithSeries, fetchCreatorScrapeStatus } from "@/lib/supabaseRest";
import {
  postCounts,
  communityPostCounts,
  isCommunityPost,
  slugForCreator,
  bucketKey,
  type Creator,
  type CreatorType,
  type Granularity,
} from "@/lib/creators";

/**
 * Creator detail for /creators/[slug] — mirrors jp-creators' c/[slug] page
 * data. Resolves by handle or UUID; personas aggregate their children with
 * per-child counting rules (an influencer child needs approval, a UGC child
 * doesn't). Supports ?from/?to (or days), ?account=<childId> to narrow a
 * persona to one account, and ?granularity=day|week|month for the chart.
 * Gated by `creators`.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { slug } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") ?? 30)));
    const fromISO = searchParams.get("from") || new Date(Date.now() - days * 86400_000).toISOString();
    const toISO = searchParams.get("to") || new Date().toISOString();
    const granularity = (["day", "week", "month"].includes(searchParams.get("granularity") || "") ? searchParams.get("granularity") : "day") as Granularity;
    const accountFilter = searchParams.get("account")?.trim() || null;

    const creator = (await fetchCreatorBySlug(slug)) as Creator | null;
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

    const isPersona = creator.type === "persona";

    // If this is a child of a persona, surface the parent for the backlink chip.
    let parent: { name: string; slug: string } | null = null;
    if (creator.parent_id) {
      const p = (await fetchCreatorById(creator.parent_id)) as Creator | null;
      if (p) parent = { name: p.name, slug: slugForCreator(p) };
    }

    // Persona → children carry the posts; build the per-child type map.
    const children = isPersona ? ((await fetchCreatorChildren([creator.id])) as Creator[]) : [];
    const typeById = new Map<string, CreatorType>(children.map((c) => [c.id, c.type]));
    const effectiveType = (creatorId: string): CreatorType => (isPersona ? (typeById.get(creatorId) ?? "other") : creator.type);

    const allIds = isPersona ? children.map((c) => c.id) : [creator.id];
    const allPosts = allIds.length ? await fetchPostsWithSeries(allIds, fromISO, toISO) : [];

    // Per-account stats over the window — computed from the FULL set so the
    // account cards stay stable while ?account narrows the sections below.
    const accounts = isPersona
      ? children.map((c) => {
          const own = allPosts.filter((p) => p.creator_id === c.id);
          const counted = own.filter((p) => postCounts(c.type, p));
          const views = counted.reduce((s, p) => s + (p.view_count || 0), 0);
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            slug: slugForCreator(c),
            profile_image_url: c.profile_image_url,
            instagram_handle: c.instagram_handle,
            tiktok_handle: c.tiktok_handle,
            youtube_handle: c.youtube_handle,
            last_scraped_at: c.last_scraped_at,
            total_posts: counted.length,
            total_views: views,
          };
        })
      : undefined;

    // Optional narrowing to one child account (persona view).
    const posts = accountFilter ? allPosts.filter((p) => p.creator_id === accountFilter) : allPosts;

    // Per-platform split powers the "Segment by platform" toggle on the detail
    // page: each counted post's views land in its platform's running total and
    // in that platform's slot within the date bucket (one chart line each).
    const platformOf = (p: { platform?: string | null }): "instagram" | "tiktok" | "youtube" | null =>
      p.platform === "instagram" || p.platform === "tiktok" || p.platform === "youtube" ? p.platform : null;

    let total_views = 0, total_likes = 0, total_comments = 0, total_posts = 0, community_posts = 0;
    const by_platform = {
      instagram: { views: 0, posts: 0 },
      tiktok: { views: 0, posts: 0 },
      youtube: { views: 0, posts: 0 },
    };
    const buckets = new Map<string, { label: string; views: number; instagram: number; tiktok: number; youtube: number }>();
    for (const p of posts) {
      if (communityPostCounts(p)) community_posts++;
      if (!postCounts(effectiveType(p.creator_id), p)) continue;
      const v = p.view_count || 0;
      total_views += v;
      total_likes += p.like_count || 0;
      total_comments += p.comment_count || 0;
      total_posts += 1;
      const pl = platformOf(p);
      if (pl) { by_platform[pl].views += v; by_platform[pl].posts += 1; }
      const { key, label } = bucketKey(granularity, new Date(p.posted_at));
      const b = buckets.get(key) ?? { label, views: 0, instagram: 0, tiktok: 0, youtube: 0 };
      b.views += v;
      if (pl) b[pl] += v;
      buckets.set(key, b);
    }
    const bucketArr = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ date: v.label, views: v.views, instagram: v.instagram, tiktok: v.tiktok, youtube: v.youtube }));

    const stats = {
      total_views, total_likes, total_comments, total_posts, community_posts,
      avg_views_per_post: total_posts > 0 ? Math.round(total_views / total_posts) : 0,
      by_platform,
    };

    // Community posts often store their image in media_urls, not thumbnail_url.
    const enriched = posts.map((p) => {
      const t = effectiveType(p.creator_id);
      const community = isCommunityPost(p);
      const thumb = p.thumbnail_url ?? (community && Array.isArray(p.media_urls) && p.media_urls.length ? p.media_urls[0] : null);
      return { ...p, thumbnail_url: thumb, is_community: community, counts: postCounts(t, p), creator_type: t };
    });

    // Audience-by-country (TikTok demographics) lives in scrape_status; surface
    // it for leaf creators so the pull actually has somewhere to display.
    let audience: unknown = null;
    let audienceAt: string | null = null;
    if (!isPersona) {
      const ss = await fetchCreatorScrapeStatus(creator.id).catch(() => null);
      audience = ss?.audience_country ?? null;
      audienceAt = ss?.audience_country_at ?? null;
    }

    return NextResponse.json({ creator, parent, accounts, posts: enriched, stats, buckets: bucketArr, audience, audienceAt, from: fromISO, to: toISO, granularity });
  } catch (err) {
    console.error("Creator detail API error:", err);
    return NextResponse.json({ error: "Failed to load creator", details: String(err) }, { status: 500 });
  }
}
