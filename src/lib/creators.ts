/**
 * Creators domain — types + post-counting rules, ported from jp-creators.
 * Pure (client+server safe); the data fetching lives in supabaseRest and the
 * aggregation in /api/creators.
 */

export type Platform = "instagram" | "tiktok" | "youtube";
export type CreatorType = "influencer" | "daily_ugc" | "youtuber" | "persona" | "ambassador" | "other";
export type CreatorStatus = "active" | "paused" | "archived";
export type Responsibility = "adam" | "salma" | "both" | "moving_to_salma";

export const JPC_TAG = "jp-creators";
export const JPP_TAG = "jp-prospect";

export interface Creator {
  id: string;
  name: string;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  youtube_handle: string | null;
  type: CreatorType;
  status: CreatorStatus;
  profile_image_url: string | null;
  tags: string[] | null;
  parent_id: string | null;
  last_scraped_at: string | null;
  region: string | null;
}

export interface CreatorWithStats extends Creator {
  total_views: number;
  total_posts: number;
  avg_views_per_post: number;
  /** Most recent counted ("for us") post in the window — ISO, rolled up across
   * a persona's children. null when there are no counted posts in the window. */
  last_posted_at: string | null;
  /** For personas: their child accounts (name + avatar) for the composite avatar. */
  accounts?: { id: string; name: string; profile_image_url: string | null }[];
}

export interface PostLite {
  creator_id: string;
  url?: string | null;
  view_count: number;
  approved: boolean;
  excluded: boolean;
  posted_at?: string | null;
}

// ---- responsibility tag (stored as resp:<value> in the tags column) ----
const RESP_PREFIX = "resp:";
const RESP_VALUES: Responsibility[] = ["adam", "salma", "both", "moving_to_salma"];
export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  adam: "Adam",
  salma: "Salma",
  both: "Adam + Salma",
  moving_to_salma: "Moving to Salma",
};
export function readResponsibility(tags: string[] | null | undefined): Responsibility | null {
  if (!tags) return null;
  for (const t of tags) {
    if (!t.startsWith(RESP_PREFIX)) continue;
    const v = t.slice(RESP_PREFIX.length) as Responsibility;
    if (RESP_VALUES.includes(v)) return v;
  }
  return null;
}
/** Return a new tags array with the responsibility tag set (or cleared if null). */
export function withResponsibility(tags: string[] | null | undefined, next: Responsibility | null): string[] {
  const cleaned = (tags ?? []).filter((t) => !t.startsWith(RESP_PREFIX));
  return next === null ? cleaned : [...cleaned, `${RESP_PREFIX}${next}`];
}

// ---- post-counting rules (ported verbatim) ----
export function isCommunityPost(post: { url?: string | null }): boolean {
  return !!post.url && post.url.includes("/post/");
}

/**
 * Label a post's platform, distinguishing YouTube Shorts / Videos / Community.
 * Rule (ported from PlatformBadge): non-youtuber YT posts are always Shorts
 * (we never pull long-form for them); youtuber posts split by URL shape.
 */
export function platformLabel(platform: string, url: string | null | undefined, creatorType: string | undefined): string {
  if (platform !== "youtube") return platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : platform;
  if (url && url.includes("/post/")) return "Community";
  if (creatorType && creatorType !== "youtuber") return "Short";
  if (url) return url.includes("/shorts/") ? "Short" : "Video";
  return "YouTube";
}
/** Short platform chip text (IG / TT / Short / Video / CP). */
export function platformChip(platform: string, url: string | null | undefined, creatorType: string | undefined): string {
  if (platform === "instagram") return "IG";
  if (platform === "tiktok") return "TT";
  if (platform === "youtube") {
    if (url && url.includes("/post/")) return "CP";
    if (creatorType && creatorType !== "youtuber") return "Short";
    if (url) return url.includes("/shorts/") ? "Short" : "Video";
    return "YT";
  }
  return platform;
}
/** Does this post count toward a creator's headline post/view totals? */
export function postCounts(creatorType: CreatorType, post: PostLite): boolean {
  if (isCommunityPost(post)) return false;
  if (creatorType === "influencer" || creatorType === "youtuber") return post.approved && !post.excluded;
  return !post.excluded; // persona/daily_ugc/ambassador/other
}
/** Counted YouTube community posts — own metric, same approval gate. */
export function communityPostCounts(post: { url?: string | null; approved: boolean; excluded: boolean }): boolean {
  if (!isCommunityPost(post)) return false;
  if (post.excluded) return false;
  return post.approved;
}

export function slugForCreator(c: Pick<Creator, "instagram_handle" | "tiktok_handle" | "youtube_handle" | "id">): string {
  return c.instagram_handle || c.tiktok_handle || c.youtube_handle || c.id;
}

/**
 * Aggregate posts → per-top-level-creator stats. Personas roll up their
 * children's counted posts; leaves count their own. Mirrors listCreators.
 */
export function computeRoster(
  topLevel: Creator[],
  children: Creator[],
  posts: PostLite[]
): CreatorWithStats[] {
  const childrenByParent = new Map<string, string[]>();
  const typeById = new Map<string, CreatorType>();
  const childById = new Map<string, Creator>();
  topLevel.forEach((c) => typeById.set(c.id, c.type));
  children.forEach((c) => {
    typeById.set(c.id, c.type);
    childById.set(c.id, c);
    if (!c.parent_id) return;
    const arr = childrenByParent.get(c.parent_id) ?? [];
    arr.push(c.id);
    childrenByParent.set(c.parent_id, arr);
  });

  const statsByCreator = new Map<string, { views: number; count: number; last: string | null }>();
  for (const p of posts) {
    const t = typeById.get(p.creator_id) ?? "other";
    if (!postCounts(t, p)) continue;
    const s = statsByCreator.get(p.creator_id) ?? { views: 0, count: 0, last: null };
    s.views += p.view_count || 0;
    s.count += 1;
    if (p.posted_at && (!s.last || Date.parse(p.posted_at) > Date.parse(s.last))) s.last = p.posted_at;
    statsByCreator.set(p.creator_id, s);
  }

  return topLevel.map((c) => {
    let views = 0;
    let count = 0;
    let lastPosted: string | null = null;
    let accounts: CreatorWithStats["accounts"];
    if (c.type === "persona") {
      const childIds = childrenByParent.get(c.id) ?? [];
      for (const cid of childIds) {
        const s = statsByCreator.get(cid);
        if (s) {
          views += s.views;
          count += s.count;
          if (s.last && (!lastPosted || Date.parse(s.last) > Date.parse(lastPosted))) lastPosted = s.last;
        }
      }
      accounts = childIds
        .map((cid) => childById.get(cid))
        .filter((x): x is Creator => !!x)
        .map((ch) => ({ id: ch.id, name: ch.name, profile_image_url: ch.profile_image_url }));
    } else {
      const s = statsByCreator.get(c.id) ?? { views: 0, count: 0, last: null };
      views = s.views;
      count = s.count;
      lastPosted = s.last;
    }
    return { ...c, total_views: views, total_posts: count, avg_views_per_post: count > 0 ? Math.round(views / count) : 0, last_posted_at: lastPosted, ...(accounts ? { accounts } : {}) };
  });
}

/**
 * Build the roster from DB-side aggregates (creator_roster_stats) instead of
 * raw post rows — identical output shape and counting rules to computeRoster,
 * with personas rolling up their children's aggregates.
 */
export function rosterFromAggregates(
  topLevel: Creator[],
  children: Creator[],
  agg: { creator_id: string; counted_posts: number; counted_views: number; last_posted_at: string | null }[]
): CreatorWithStats[] {
  const byId = new Map(agg.map((a) => [a.creator_id, a]));
  const childrenByParent = new Map<string, Creator[]>();
  for (const c of children) {
    if (!c.parent_id) continue;
    const arr = childrenByParent.get(c.parent_id) ?? [];
    arr.push(c);
    childrenByParent.set(c.parent_id, arr);
  }
  return topLevel.map((c) => {
    let views = 0;
    let count = 0;
    let last: string | null = null;
    let accounts: CreatorWithStats["accounts"];
    if (c.type === "persona") {
      const kids = childrenByParent.get(c.id) ?? [];
      for (const k of kids) {
        const a = byId.get(k.id);
        if (a) {
          views += Number(a.counted_views) || 0;
          count += Number(a.counted_posts) || 0;
          if (a.last_posted_at && (!last || a.last_posted_at > last)) last = a.last_posted_at;
        }
      }
      accounts = kids.map((k) => ({ id: k.id, name: k.name, profile_image_url: k.profile_image_url }));
    } else {
      const a = byId.get(c.id);
      if (a) {
        views = Number(a.counted_views) || 0;
        count = Number(a.counted_posts) || 0;
        last = a.last_posted_at;
      }
    }
    return { ...c, total_views: views, total_posts: count, avg_views_per_post: count > 0 ? Math.round(views / count) : 0, last_posted_at: last, ...(accounts ? { accounts } : {}) };
  });
}

// ---- performance analytics (ported from getPerformanceStats) ----
export type Granularity = "day" | "week" | "month";
export interface BucketPoint { date: string; rawDate: string; views: number; posts: number }
export interface PlatformAgg { platform: Platform; views: number; posts: number }
export interface TopCreator {
  id: string; name: string; profile_image_url: string | null;
  instagram_handle: string | null; tiktok_handle: string | null; youtube_handle: string | null;
  views: number; posts: number;
}
export interface PerformanceStats {
  total_views: number; total_posts: number; total_likes: number; total_comments: number;
  active_creators: number; total_community_posts: number;
  buckets: BucketPoint[]; platform: PlatformAgg[]; top_creators: TopCreator[];
}
export interface PerfPost {
  creator_id: string; platform: Platform; url?: string | null;
  view_count: number; like_count: number; comment_count: number;
  posted_at: string; approved: boolean; excluded: boolean;
}

export function bucketKey(g: Granularity, posted: Date): { key: string; label: string } {
  const y = posted.getUTCFullYear(), m = posted.getUTCMonth(), d = posted.getUTCDate();
  if (g === "month") {
    const start = new Date(Date.UTC(y, m, 1));
    return { key: start.toISOString().slice(0, 10), label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) };
  }
  if (g === "week") {
    const dow = posted.getUTCDay();
    const monday = new Date(Date.UTC(y, m, d + (dow === 0 ? -6 : 1 - dow)));
    return { key: monday.toISOString().slice(0, 10), label: "W/" + monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
  }
  const dayStart = new Date(Date.UTC(y, m, d));
  return { key: dayStart.toISOString().slice(0, 10), label: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
}

/** Which posts a performance roll-up covers: "counted" = the for-us view
 * (approval-gated via postCounts); "all" = every post the creator made —
 * the general baseline used to compare their average post against what
 * they deliver for us. */
export type PerfScope = "counted" | "all";

/**
 * Aggregate performance posts into the Performance roll-up. `creatorMap`
 * holds the (non-persona) leaf creators; community posts are tallied
 * separately and never roll into total_posts/views.
 */
export function computePerformance(posts: PerfPost[], creatorMap: Map<string, Creator>, granularity: Granularity, scope: PerfScope = "counted"): PerformanceStats {
  const counted = posts.filter((p) => {
    const c = creatorMap.get(p.creator_id);
    if (!c) return false;
    return scope === "all" ? !isCommunityPost(p) : postCounts(c.type, p);
  });
  const total_community_posts = posts.reduce((n, p) => ((scope === "all" ? isCommunityPost(p) : communityPostCounts(p)) ? n + 1 : n), 0);

  let total_views = 0, total_posts = 0, total_likes = 0, total_comments = 0;
  const activeCreators = new Set<string>();
  const buckets = new Map<string, { label: string; views: number; posts: number }>();
  const platform = new Map<Platform, { views: number; posts: number }>();
  const byCreator = new Map<string, { views: number; posts: number }>();

  for (const p of counted) {
    total_views += p.view_count || 0; total_likes += p.like_count || 0;
    total_comments += p.comment_count || 0; total_posts += 1;
    activeCreators.add(p.creator_id);
    const { key, label } = bucketKey(granularity, new Date(p.posted_at));
    const b = buckets.get(key) ?? { label, views: 0, posts: 0 };
    b.views += p.view_count || 0; b.posts += 1; buckets.set(key, b);
    const pa = platform.get(p.platform) ?? { views: 0, posts: 0 };
    pa.views += p.view_count || 0; pa.posts += 1; platform.set(p.platform, pa);
    const cc = byCreator.get(p.creator_id) ?? { views: 0, posts: 0 };
    cc.views += p.view_count || 0; cc.posts += 1; byCreator.set(p.creator_id, cc);
  }

  const bucketArr: BucketPoint[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rawDate, v]) => ({ rawDate, date: v.label, views: v.views, posts: v.posts }));
  const platformArr: PlatformAgg[] = (["instagram", "tiktok", "youtube"] as Platform[])
    .map((pl) => ({ platform: pl, ...(platform.get(pl) ?? { views: 0, posts: 0 }) }))
    .filter((p) => p.posts > 0 || p.views > 0);
  const topArr: TopCreator[] = Array.from(byCreator.entries())
    .map(([id, v]) => {
      const c = creatorMap.get(id)!;
      return { id, name: c.name, profile_image_url: c.profile_image_url ?? null, instagram_handle: c.instagram_handle, tiktok_handle: c.tiktok_handle, youtube_handle: c.youtube_handle, views: v.views, posts: v.posts };
    })
    .sort((a, b) => b.views - a.views);

  return { total_views, total_posts, total_likes, total_comments, active_creators: activeCreators.size, total_community_posts, buckets: bucketArr, platform: platformArr, top_creators: topArr };
}
