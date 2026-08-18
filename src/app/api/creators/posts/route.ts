import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchLeafCreators, fetchPostsList, updatePost } from "@/lib/supabaseRest";
import { postCounts, isCommunityPost, type Creator, type CreatorType } from "@/lib/creators";

/**
 * Post feed for the Creators › Posts tab. GET returns the filtered feed +
 * an all-time top-10-by-views rail. PATCH toggles approve/exclude/outlier.
 * Mirrors jp-creators' listAllPosts + PostActions. Gated by `creators`.
 */
export const maxDuration = 60;

type FeedPost = {
  id: string; creator_id: string; platform: string; url: string; thumbnail_url: string | null;
  caption: string | null; view_count: number; like_count: number; comment_count: number;
  posted_at: string; approved: boolean; excluded: boolean; is_outlier: boolean;
  archive_status: string | null; archive_video_url: string | null; published_to_top: boolean;
  creator: Pick<Creator, "id" | "name" | "type" | "profile_image_url" | "instagram_handle" | "tiktok_handle" | "youtube_handle">;
};

function ytVariantOk(platform: string | undefined, p: FeedPost): boolean {
  if (!platform || !platform.startsWith("yt_")) return true;
  const u = p.url ?? "";
  const isCommunity = u.includes("/post/");
  const isShort = !isCommunity && (p.creator.type !== "youtuber" || u.includes("/shorts/"));
  const isVideo = !isCommunity && !isShort;
  if (platform === "yt_short") return isShort;
  if (platform === "yt_video") return isVideo;
  if (platform === "yt_community") return isCommunity;
  return true;
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") || "all";
    const state = searchParams.get("state") || "counted";
    const sort = (searchParams.get("sort") === "views" ? "views" : "recent") as "recent" | "views";
    const search = searchParams.get("search")?.trim() || "";
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") ?? 365)));
    const fromISO = searchParams.get("from") || new Date(Date.now() - days * 86400_000).toISOString();
    const toISO = searchParams.get("to") || new Date().toISOString();

    const leaves = (await fetchLeafCreators()) as Creator[];
    const creatorMap = new Map(leaves.map((c) => [c.id, c]));
    const ids = leaves.map((c) => c.id);

    const [rawFeed, rawTop] = await Promise.all([
      fetchPostsList({
        creatorIds: ids,
        platform,
        outliersOnly: state === "outliers",
        excludedOnly: state === "excluded",
        search,
        fromISO,
        toISO,
        sort,
        limit: 300,
      }),
      // All-time top-10-by-views among COUNTED posts. We over-fetch (the
      // raw top-by-views is dominated by unapproved influencer + community
      // posts that don't count), then filter to counted and slice 10.
      fetchPostsList({ creatorIds: ids, sort: "views", limit: 1000 }),
    ]);

    const join = (rows: any[]): FeedPost[] =>
      rows
        .map((p) => ({ ...p, creator: creatorMap.get(p.creator_id) }))
        .filter((p) => p.creator)
        .map((p) => ({ ...p, creator: { id: p.creator.id, name: p.creator.name, type: p.creator.type, profile_image_url: p.creator.profile_image_url, instagram_handle: p.creator.instagram_handle, tiktok_handle: p.creator.tiktok_handle, youtube_handle: p.creator.youtube_handle } }));

    let feed = join(rawFeed);
    feed = feed.filter((p) => ytVariantOk(platform, p));
    feed = feed.filter((p) => {
      const t = p.creator.type as CreatorType;
      if (state === "counted") return postCounts(t, p);
      if (state === "needs_review") return (t === "influencer" || t === "youtuber") && !p.approved && !p.excluded && !isCommunityPost(p);
      return true; // all / excluded / outliers already SQL-filtered
    });

    const topTen = join(rawTop).filter((p) => postCounts(p.creator.type as CreatorType, p)).slice(0, 10);

    return NextResponse.json({ feed, topTen, from: fromISO, to: toISO });
  } catch (err) {
    console.error("Posts API error:", err);
    return NextResponse.json({ error: "Failed to load posts", details: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { id, field, value } = await req.json();
    if (!id || !["approved", "excluded", "is_outlier"].includes(field)) {
      return NextResponse.json({ error: "id + valid field required" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { [field]: !!value };
    // Approving clears excluded and vice-versa (can't be both).
    if (field === "approved" && value) patch.excluded = false;
    if (field === "excluded" && value) patch.approved = false;
    await updatePost(String(id), patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Posts PATCH error:", err);
    return NextResponse.json({ error: "Failed to update post", details: String(err) }, { status: 500 });
  }
}
