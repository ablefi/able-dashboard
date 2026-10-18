import "server-only";
import { storageHeaders } from "@/lib/postThumbs";
import { appState, appStateSet } from "@/lib/supabaseRest";

/**
 * ScrapeCreators ingestion — ported from roster' actions.ts. Pulls a
 * creator's recent posts from IG/TikTok/YouTube, normalizes them, and upserts
 * into the shared `posts` table (+ today's view_snapshots row). Reimplemented
 * over PostgREST (this app talks raw REST, not the Supabase JS client).
 *
 * Used by the per-creator Refresh button, persona fan-out, refresh-all, and
 * the 8-hourly cron.
 */

export const SC_BASE = "https://api.scrapecreators.com";
/**
 * How deep to page a creator's feed per refresh.
 *
 * This is a safety cap, not a budget: every platform loop stops once an entire
 * page falls outside the 30-day window, so a normal creator still stops after
 * one or two pages. The cap only binds for accounts that genuinely post more
 * than `MAX_PAGES × 10` times inside the window.
 *
 * It was 5 — 50 posts — which silently froze the counts of high-volume
 * creators: once a post fell past the 50 most recent it was never re-scraped
 * again, so its view count stopped moving while the real one kept climbing.
 * Measured 1 Sep 2026: 237 of 930 posts from the previous fortnight had no
 * snapshot in 24h. These numbers are what creators get paid on, so a frozen
 * count is an underpayment.
 *
 * Sizing it to the current roster turned out to be the wrong instinct. It was
 * set to 25 when the heaviest account needed 21 pages; six days later that
 * account (Shakur Kelley, Instagram) was at 233 posts in 30 days, needing 24.
 * One page of headroom, on the metric creators get paid from, where running
 * out is silent.
 *
 * So this is now a runaway-loop stop rather than a fitted number. Raising it
 * costs nothing for anyone else: every loop already exits once a whole page
 * falls outside the window, so the roster's next-heaviest accounts still stop
 * at 8 pages or fewer. Only an account that genuinely posts this much ever
 * pages deeper, which is exactly the account that must not freeze.
 */
const MAX_PAGES = 60;

export type Platform = "instagram" | "tiktok" | "youtube";
export interface NormalizedPost {
  external_id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  posted_at: string;
  media_urls?: string[];
}

export function scHeaders(): Record<string, string> | null {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : null;
}

// ---- low-level PostgREST helpers (service role) ----
const SB = () => process.env.SUPABASE_URL!;
const sbHeaders = (extra: Record<string, string> = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
  ...extra,
});
/**
 * Every row, not the first thousand.
 *
 * PostgREST caps a response at 1000 rows and says so only in the Content-Range
 * header, so a plain sbGet on a table that has grown past that silently returns
 * a slice. For a "has this creator posted recently" lookup that slice reads as
 * "no", which would quietly stop refreshing the creators who ARE posting. The
 * 14-day window already sits at 989 rows.
 */
export async function sbGetAll(path: string, pageSize = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 100_000; from += pageSize) {
    const res = await fetch(`${SB()}/rest/v1/${path}`, {
      headers: sbHeaders({ Range: `${from}-${from + pageSize - 1}` }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`sbGetAll ${path}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    const chunk = (await res.json()) as any[];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

export async function sbGet(path: string): Promise<any[]> {
  const res = await fetch(`${SB()}/rest/v1/${path}`, { headers: sbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`sbGet ${path}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
}
export async function sbInsert(table: string, row: Record<string, unknown>, returnRep = false): Promise<any[]> {
  const res = await fetch(`${SB()}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders(returnRep ? { Prefer: "return=representation" } : { Prefer: "return=minimal" }),
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sbInsert ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  return returnRep ? res.json() : [];
}
export async function sbPatch(table: string, filter: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SB()}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sbPatch ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}
export async function sbDelete(table: string, filter: string): Promise<void> {
  const res = await fetch(`${SB()}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }), cache: "no-store" });
  if (!res.ok) throw new Error(`sbDelete ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}
async function sbRpc(fn: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SB()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}

function recordSCCredits(remaining: number): void {
  appStateSet("sc_credits", { remaining, recorded_at: new Date().toISOString() }).catch(() => {});
}
// Auto-approve ONLY on a real @mention of your app's account in the caption,
// not loose brand words in the text. Handles differ per platform, so list them
// all in BRAND_HANDLES (comma separated, without "@"). TikTok often renders a
// mention as the DISPLAY NAME ("@My App", with a space), so BRAND_DISPLAY_NAME
// is matched too. Everything is anchored on "@", so the bare brand phrase in an
// ordinary caption never auto-approves.
const BRAND_HANDLE_TOKENS = new Set(
  (process.env.BRAND_HANDLES || "able,ablefinance,able.finance").split(",").map((h) => h.trim().toLowerCase().replace(/^@/, "")).filter(Boolean),
);
const BRAND_DISPLAY_MENTION = (() => {
  const words = (process.env.BRAND_DISPLAY_NAME || "Able Finance").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`@\\s*${escaped.join("\\s+")}`, "i");
})();
function captionMentionsBrand(caption: string | null | undefined): boolean {
  if (!caption) return false;
  const c = caption.toLowerCase();
  for (const m of c.matchAll(/@([a-z0-9_.]+)/g)) {
    if (BRAND_HANDLE_TOKENS.has(m[1].replace(/\.+$/, ""))) return true;
  }
  return BRAND_DISPLAY_MENTION ? BRAND_DISPLAY_MENTION.test(c) : false;
}
function ytPostedAt(v: Record<string, unknown>): string {
  for (const k of ["publishDate", "publishedTime", "publish_date", "publishedAt"] as const) {
    const val = v[k];
    if (typeof val === "string" && !Number.isNaN(Date.parse(val))) return new Date(val).toISOString();
  }
  return new Date().toISOString();
}

// ---- platform fetchers (ScrapeCreators) ----
async function fetchTikTokPosts(handle: string, headers: Record<string, string>, cutoffMs: number): Promise<{ posts: NormalizedPost[]; regionFound: string | null }> {
  const all: NormalizedPost[] = [];
  let regionFound: string | null = null;
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const cursorParam: string = cursor ? `&max_cursor=${encodeURIComponent(cursor)}` : "";
    const res: Response = await fetch(`${SC_BASE}/v3/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&trim=true${cursorParam}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`TikTok ${res.status}: ${(await res.text()).slice(0, 100)}`);
    const data: any = await res.json();
    if (typeof data.credits_remaining === "number") recordSCCredits(data.credits_remaining);
    const items = (data.aweme_list ?? []) as Array<Record<string, any>>;
    if (items.length === 0) break;
    const batch: NormalizedPost[] = items.map((it) => {
      const stats = it.statistics ?? {};
      const video = it.video ?? {};
      const id = String(it.aweme_id);
      const region = typeof it.region === "string" ? it.region : "";
      if (!regionFound && region && region.length === 2) regionFound = region;
      return {
        external_id: id,
        url: `https://www.tiktok.com/@${handle}/video/${id}`,
        thumbnail_url: video.dynamic_cover?.url_list?.[0] ?? null,
        caption: String(it.desc ?? ""),
        view_count: Number(stats.play_count ?? 0),
        like_count: Number(stats.digg_count ?? 0),
        comment_count: Number(stats.comment_count ?? 0),
        posted_at: new Date(Number(it.create_time ?? 0) * 1000).toISOString(),
      };
    });
    all.push(...batch);
    // Where to stop paginating.
    //
    // This used to stop as soon as the page's OLDEST post crossed the cutoff,
    // which a single pinned video breaks completely: pins sit at the TOP of
    // page 1 and can be months old, so `oldest` was pre-cutoff on the very
    // first page and pagination ended immediately. For any creator with an old
    // pin, only the handful of recent posts sharing page 1 ever refreshed —
    // regardless of MAX_PAGES — and everything behind them froze. Pins can't
    // be filtered by flag either: `is_top` comes back 0 in trim-mode.
    //
    // A first attempt dropped only the LEADING run of pre-cutoff posts, on the
    // assumption that pins always sit above the real feed. They do not.
    // Instagram returns them interleaved — _saykurspeekss_ page 1 came back as
    // [Aug 29, Aug 30, MAR 29, Sep 7, Sep 6 ...], with the pin at index 2. One
    // fresh post above it was enough to put the pin back inside the boundary
    // test, so that creator still broke on page 1 and fourteen approved posts
    // sat frozen for four days.
    //
    // So the test looks at the TAIL of the page, not the head and not all of it.
    //
    // Requiring the whole page to be pre-cutoff is correct but always costs one
    // page PAST the boundary, on every feed, on every run — about 250 credits a
    // day across the roster, a third of the burn. The last two items are enough:
    // a feed is reverse-chronological below the pins, so once BOTH of the oldest
    // items on a page are outside the window the boundary is inside this page
    // and there is nothing newer further down. A stray pin at the very bottom
    // does not trigger it, because the item above it is still fresh.
    //
    // Two items rather than one deliberately: one would stop on a single
    // bottom-of-page pin. Fooling this needs two adjacent pins at the end of a
    // page, and pins cluster at the top.
    const tail = batch.slice(-2);
    if (tail.length > 0 && tail.every((p) => new Date(p.posted_at).getTime() <= cutoffMs)) break;
    cursor = (data.max_cursor as string | undefined) ?? (data.cursor as string | undefined) ?? null;
    if (!cursor || data.has_more === false) break;
  }
  return { posts: all.filter((p) => new Date(p.posted_at).getTime() >= cutoffMs), regionFound };
}

async function fetchInstagramPosts(handle: string, headers: Record<string, string>, cutoffMs: number): Promise<NormalizedPost[]> {
  const all: NormalizedPost[] = [];
  let maxId: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const cursorParam = maxId ? `&max_id=${encodeURIComponent(maxId)}` : "";
    const res = await fetch(`${SC_BASE}/v1/instagram/user/reels?handle=${encodeURIComponent(handle)}${cursorParam}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Instagram ${res.status}: ${(await res.text()).slice(0, 100)}`);
    const data = await res.json();
    if (typeof data.credits_remaining === "number") recordSCCredits(data.credits_remaining);
    const items = (data.items ?? []) as Array<{ media?: Record<string, any> }>;
    if (items.length === 0) break;
    const batch: NormalizedPost[] = items.map((wrapper) => {
      const m = wrapper.media ?? {};
      const code = String(m.code ?? "");
      const id = String(m.id ?? m.pk ?? code);
      const caption = (m.caption as { text?: string } | null)?.text ?? "";
      const iv = m.image_versions2 as { candidates?: Array<{ url?: string }>; additional_candidates?: { first_frame?: { url?: string } } } | undefined;
      const thumbnailUrl = iv?.candidates?.[0]?.url || iv?.additional_candidates?.first_frame?.url || null;
      return {
        external_id: id,
        url: code ? `https://www.instagram.com/reel/${code}/` : `https://www.instagram.com/p/${id}/`,
        thumbnail_url: thumbnailUrl,
        caption,
        view_count: Number(m.play_count ?? m.ig_play_count ?? 0),
        like_count: Number(m.like_count ?? 0),
        comment_count: Number(m.comment_count ?? 0),
        posted_at: new Date(Number(m.taken_at ?? 0) * 1000).toISOString(),
      };
    });
    all.push(...batch);
    // Where to stop paginating.
    //
    // This used to stop as soon as the page's OLDEST post crossed the cutoff,
    // which a single pinned video breaks completely: pins sit at the TOP of
    // page 1 and can be months old, so `oldest` was pre-cutoff on the very
    // first page and pagination ended immediately. For any creator with an old
    // pin, only the handful of recent posts sharing page 1 ever refreshed —
    // regardless of MAX_PAGES — and everything behind them froze. Pins can't
    // be filtered by flag either: `is_top` comes back 0 in trim-mode.
    //
    // A first attempt dropped only the LEADING run of pre-cutoff posts, on the
    // assumption that pins always sit above the real feed. They do not.
    // Instagram returns them interleaved — _saykurspeekss_ page 1 came back as
    // [Aug 29, Aug 30, MAR 29, Sep 7, Sep 6 ...], with the pin at index 2. One
    // fresh post above it was enough to put the pin back inside the boundary
    // test, so that creator still broke on page 1 and fourteen approved posts
    // sat frozen for four days.
    //
    // So the test looks at the TAIL of the page, not the head and not all of it.
    //
    // Requiring the whole page to be pre-cutoff is correct but always costs one
    // page PAST the boundary, on every feed, on every run — about 250 credits a
    // day across the roster, a third of the burn. The last two items are enough:
    // a feed is reverse-chronological below the pins, so once BOTH of the oldest
    // items on a page are outside the window the boundary is inside this page
    // and there is nothing newer further down. A stray pin at the very bottom
    // does not trigger it, because the item above it is still fresh.
    //
    // Two items rather than one deliberately: one would stop on a single
    // bottom-of-page pin. Fooling this needs two adjacent pins at the end of a
    // page, and pins cluster at the top.
    const tail = batch.slice(-2);
    if (tail.length > 0 && tail.every((p) => new Date(p.posted_at).getTime() <= cutoffMs)) break;
    const paging = data.paging_info as { max_id?: string; more_available?: boolean } | undefined;
    maxId = paging?.max_id ?? null;
    if (!maxId || paging?.more_available === false) break;
  }
  return all.filter((p) => new Date(p.posted_at).getTime() >= cutoffMs);
}

async function fetchYouTube(kind: "videos" | "shorts" | "community", handle: string, headers: Record<string, string>, cutoffMs: number): Promise<NormalizedPost[]> {
  const all: NormalizedPost[] = [];
  let cont: string | null = null;
  const endpoint = kind === "videos" ? "channel-videos" : kind === "shorts" ? "channel/shorts" : "channel/community-posts";
  for (let page = 0; page < MAX_PAGES; page++) {
    const contParam: string = cont ? `&continuationToken=${encodeURIComponent(cont)}` : "";
    const sortParam: string = kind === "videos" ? "&sort=latest" : "";
    const res: Response = await fetch(`${SC_BASE}/v1/youtube/${endpoint}?handle=${encodeURIComponent(handle)}${sortParam}${contParam}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`YouTube ${kind} ${res.status}: ${(await res.text()).slice(0, 100)}`);
    const data: any = await res.json();
    if (typeof data.credits_remaining === "number") recordSCCredits(data.credits_remaining);
    const items = (kind === "videos" ? (data.videos ?? data.items) : kind === "shorts" ? data.shorts : (data.posts ?? data.communityPosts ?? data.items)) ?? [];
    if ((items as any[]).length === 0) break;
    const batch: NormalizedPost[] = (items as Array<Record<string, any>>).map((v) => {
      const id = String(v.id ?? "");
      if (kind === "community") {
        const rawImages = (Array.isArray(v.images) ? v.images : v.image ? [v.image] : []) as Array<string | { url?: string }>;
        const imgs = rawImages.map((x) => (typeof x === "string" ? x : x?.url ?? null)).filter((x): x is string => typeof x === "string" && x.length > 0);
        const canonical = typeof v.url === "string" && v.url.includes("/post/") ? v.url : `https://www.youtube.com/post/${id}`;
        return {
          external_id: id, url: canonical, thumbnail_url: imgs[0] ?? v.video?.thumbnail ?? null,
          media_urls: imgs.length > 1 ? imgs : undefined, caption: String(v.content ?? v.text ?? ""),
          view_count: 0, like_count: Number(v.likeCount ?? v.likeCountInt ?? 0), comment_count: Number(v.commentCount ?? v.commentCountInt ?? 0), posted_at: ytPostedAt(v),
        };
      }
      return {
        external_id: id,
        url: kind === "videos" ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/shorts/${id}`,
        thumbnail_url: (v.thumbnail as string | undefined) ?? null,
        caption: String(v.title ?? ""),
        view_count: Number(v.viewCountInt ?? 0), like_count: Number(v.likeCountInt ?? 0), comment_count: Number(v.commentCountInt ?? 0), posted_at: ytPostedAt(v),
      };
    });
    all.push(...batch);
    // Where to stop paginating.
    //
    // This used to stop as soon as the page's OLDEST post crossed the cutoff,
    // which a single pinned video breaks completely: pins sit at the TOP of
    // page 1 and can be months old, so `oldest` was pre-cutoff on the very
    // first page and pagination ended immediately. For any creator with an old
    // pin, only the handful of recent posts sharing page 1 ever refreshed —
    // regardless of MAX_PAGES — and everything behind them froze. Pins can't
    // be filtered by flag either: `is_top` comes back 0 in trim-mode.
    //
    // A first attempt dropped only the LEADING run of pre-cutoff posts, on the
    // assumption that pins always sit above the real feed. They do not.
    // Instagram returns them interleaved — _saykurspeekss_ page 1 came back as
    // [Aug 29, Aug 30, MAR 29, Sep 7, Sep 6 ...], with the pin at index 2. One
    // fresh post above it was enough to put the pin back inside the boundary
    // test, so that creator still broke on page 1 and fourteen approved posts
    // sat frozen for four days.
    //
    // So the test looks at the TAIL of the page, not the head and not all of it.
    //
    // Requiring the whole page to be pre-cutoff is correct but always costs one
    // page PAST the boundary, on every feed, on every run — about 250 credits a
    // day across the roster, a third of the burn. The last two items are enough:
    // a feed is reverse-chronological below the pins, so once BOTH of the oldest
    // items on a page are outside the window the boundary is inside this page
    // and there is nothing newer further down. A stray pin at the very bottom
    // does not trigger it, because the item above it is still fresh.
    //
    // Two items rather than one deliberately: one would stop on a single
    // bottom-of-page pin. Fooling this needs two adjacent pins at the end of a
    // page, and pins cluster at the top.
    const tail = batch.slice(-2);
    if (tail.length > 0 && tail.every((p) => new Date(p.posted_at).getTime() <= cutoffMs)) break;
    cont = (data.continuationToken as string | undefined) ?? null;
    if (!cont) break;
  }
  return all.filter((p) => new Date(p.posted_at).getTime() >= cutoffMs);
}

// ---- upsert ----
async function upsertPost(creatorId: string, platform: Platform, post: NormalizedPost): Promise<"inserted" | "updated"> {
  const existing = await sbGet(`posts?select=id,excluded&creator_id=eq.${creatorId}&platform=eq.${platform}&external_id=eq.${encodeURIComponent(post.external_id)}&limit=1`);
  let postId: string;
  let action: "inserted" | "updated";
  if (existing.length > 0) {
    postId = existing[0].id;
    const patch: Record<string, unknown> = {
      view_count: post.view_count, like_count: post.like_count, comment_count: post.comment_count,
      thumbnail_url: post.thumbnail_url, caption: post.caption, url: post.url, posted_at: post.posted_at,
      media_urls: post.media_urls ?? null,
    };
    // Retroactive auto-approve: a brand-mention post gets approved on re-scrape too
    // (handles edited-in mentions + posts that predate approval). Never resurrect
    // a manually-excluded post — Exclude is the override to keep one out.
    if (captionMentionsBrand(post.caption) && !existing[0].excluded) patch.approved = true;
    await sbPatch("posts", `id=eq.${postId}`, patch);
    action = "updated";
  } else {
    const created = await sbInsert("posts", {
      creator_id: creatorId, platform, external_id: post.external_id, url: post.url,
      thumbnail_url: post.thumbnail_url, caption: post.caption, hashtags: [],
      view_count: post.view_count, like_count: post.like_count, comment_count: post.comment_count,
      posted_at: post.posted_at, discovered_at: new Date().toISOString(),
      excluded: false, approved: captionMentionsBrand(post.caption), media_urls: post.media_urls ?? null,
    }, true);
    if (!created[0]) throw new Error("Insert post returned no row");
    postId = created[0].id;
    action = "inserted";
  }
  // today's view snapshot
  const today = new Date().toISOString().slice(0, 10);
  const snap = await sbGet(`view_snapshots?select=id&post_id=eq.${postId}&snapshot_date=eq.${today}&limit=1`);
  if (snap.length > 0) {
    await sbPatch("view_snapshots", `id=eq.${snap[0].id}`, { view_count: post.view_count, snapshot_at: new Date().toISOString() });
  } else {
    await sbInsert("view_snapshots", { post_id: postId, view_count: post.view_count, snapshot_at: new Date().toISOString(), snapshot_date: today });
  }
  return action;
}

export interface PullResult { ok: boolean; inserted?: number; updated?: number; errors?: string[]; error?: string }

/** Pull a single creator's posts across every platform they have a handle for. */
export async function pullCreatorPosts(creatorId: string, windowDays = 30): Promise<PullResult> {
  if (!creatorId) return { ok: false, error: "Missing creator_id" };
  const cutoffMs = Date.now() - Math.max(1, Math.min(365, windowDays)) * 86400_000;
  const headers = scHeaders();
  if (!headers) return { ok: false, error: "ScrapeCreators API key not configured." };

  const rows = await sbGet(`creators?select=type,instagram_handle,tiktok_handle,youtube_handle&id=eq.${creatorId}&limit=1`);
  const c = rows[0] as { type?: string; instagram_handle?: string | null; tiktok_handle?: string | null; youtube_handle?: string | null } | undefined;
  if (!c) return { ok: false, error: "Creator not found" };

  const errors: string[] = [];
  let inserted = 0, updated = 0;
  const platformOk = { instagram: false, tiktok: false, youtube: false };
  const tasks: Array<Promise<unknown>> = [];
  let regionFromTT: string | null = null;

  const ingest = async (plat: Platform, posts: NormalizedPost[]) => {
    for (const p of posts) (await upsertPost(creatorId, plat, p)) === "inserted" ? inserted++ : updated++;
  };

  if (c.tiktok_handle) {
    tasks.push(fetchTikTokPosts(c.tiktok_handle, headers, cutoffMs).then(async ({ posts, regionFound }) => { await ingest("tiktok", posts); platformOk.tiktok = true; if (regionFound) regionFromTT = regionFound; }).catch((e) => errors.push(`TikTok: ${(e as Error).message}`)));
  }
  if (c.instagram_handle) {
    tasks.push(fetchInstagramPosts(c.instagram_handle, headers, cutoffMs).then(async (posts) => { await ingest("instagram", posts); platformOk.instagram = true; }).catch((e) => errors.push(`IG: ${(e as Error).message}`)));
  }
  if (c.youtube_handle) {
    const h = c.youtube_handle;
    tasks.push(fetchYouTube("shorts", h, headers, cutoffMs).then(async (posts) => { await ingest("youtube", posts); platformOk.youtube = true; }).catch((e) => errors.push(`YT shorts: ${(e as Error).message}`)));
    if (c.type === "youtuber") {
      tasks.push(fetchYouTube("videos", h, headers, cutoffMs).then(async (posts) => { await ingest("youtube", posts); platformOk.youtube = true; }).catch((e) => errors.push(`YT videos: ${(e as Error).message}`)));
      tasks.push(fetchYouTube("community", h, headers, cutoffMs).then(async (posts) => { await ingest("youtube", posts); platformOk.youtube = true; }).catch((e) => errors.push(`YT community: ${(e as Error).message}`)));
    }
  }
  await Promise.all(tasks);

  const nowISO = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (platformOk.instagram) patch.ig_pulled_at = nowISO;
  if (platformOk.tiktok) patch.tt_pulled_at = nowISO;
  if (platformOk.youtube) patch.yt_pulled_at = nowISO;
  if (Object.keys(patch).length > 0) await sbRpc("merge_scrape_status", { p_creator_id: creatorId, p_patch: patch }).catch(() => {});

  const finalUpdate: Record<string, unknown> = { last_scraped_at: nowISO };
  if (regionFromTT) finalUpdate.region = regionFromTT;
  await sbPatch("creators", `id=eq.${creatorId}`, finalUpdate);

  if (errors.length > 0 && inserted + updated === 0) return { ok: false, error: errors.join("; ") };
  return { ok: true, inserted, updated, errors: errors.length > 0 ? errors : undefined };
}

/** Persona refresh: fan out to every child. */
export async function pullPersonaPosts(personaId: string, windowDays = 30): Promise<PullResult> {
  const kids = await sbGet(`creators?select=id&parent_id=eq.${personaId}`);
  if (kids.length === 0) return { ok: true, inserted: 0, updated: 0 };
  const results = await Promise.all(kids.map((k: { id: string }) => pullCreatorPosts(k.id, windowDays)));
  let inserted = 0, updated = 0;
  const errors: string[] = [];
  results.forEach((r) => { inserted += r.inserted ?? 0; updated += r.updated ?? 0; if (r.errors) errors.push(...r.errors); if (r.error) errors.push(r.error); });
  return { ok: true, inserted, updated, errors: errors.length ? errors : undefined };
}

export interface RefreshAllResult { ok: boolean; creators_processed: number; creators_skipped_quiet?: number; inserted: number; updated: number; failures: number; error?: string }

/** Pull the avatar (TikTok preferred, else Instagram) → cache to the
 * creator-avatars bucket so it never expires. Ported from pullCreatorProfile. */
export async function pullCreatorProfile(creatorId: string): Promise<{ ok: boolean; avatarUrl?: string | null; error?: string }> {
  if (!creatorId) return { ok: false, error: "Missing creator_id" };
  const headers = scHeaders();
  if (!headers) return { ok: false, error: "ScrapeCreators API key not configured." };
  const rows = await sbGet(`creators?select=tiktok_handle,instagram_handle&id=eq.${creatorId}&limit=1`);
  const c = rows[0] as { tiktok_handle?: string | null; instagram_handle?: string | null } | undefined;
  if (!c) return { ok: false, error: "Creator not found" };

  let url: string | null = null;
  let source: "tiktok" | "instagram" = "tiktok";
  if (c.tiktok_handle) { url = `${SC_BASE}/v1/tiktok/profile?handle=${encodeURIComponent(c.tiktok_handle)}`; source = "tiktok"; }
  else if (c.instagram_handle) { url = `${SC_BASE}/v1/instagram/profile?handle=${encodeURIComponent(c.instagram_handle)}`; source = "instagram"; }
  if (!url) return { ok: false, error: "Creator has no TikTok or Instagram handle." };

  let payload: Record<string, any> = {};
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return { ok: false, error: `ScrapeCreators ${res.status}: ${(await res.text()).slice(0, 120)}` };
    payload = await res.json();
    if (typeof payload.credits_remaining === "number") recordSCCredits(payload.credits_remaining);
  } catch (e) { return { ok: false, error: (e as Error).message }; }

  let avatarUrl: string | null = null;
  if (source === "tiktok") {
    const u = payload.user as Record<string, any> | undefined;
    avatarUrl = u?.avatarLarger || u?.avatarMedium || u?.avatarThumb || null;
  } else {
    const inner = (payload.data as Record<string, any> | undefined) ?? payload;
    const u = (inner.user as Record<string, any> | undefined) ?? inner;
    avatarUrl = u?.profile_pic_url_hd || u?.profile_pic_url || null;
  }

  let storedUrl: string | null = null;
  if (avatarUrl) {
    try {
      const imgRes = await fetch(avatarUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", Referer: source === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/" },
        cache: "no-store",
      });
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("heic") || contentType.includes("heif") ? "heic" : "jpg";
        const objectPath = `creators/${creatorId}.${ext}`;
        const bytes = await imgRes.arrayBuffer();
        const upRes = await fetch(`${SB()}/storage/v1/object/creator-avatars/${objectPath}`, {
          method: "POST",
          // storageHeaders, not a bare Authorization: Storage needs `apikey`
          // too now the service key is sb_secret_ rather than a JWT. Without it
          // this silently fell through to the upstream avatar URL every time.
          headers: storageHeaders({ "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "public, max-age=31536000, immutable" }),
          body: bytes,
        });
        if (upRes.ok) storedUrl = `${SB()}/storage/v1/object/public/creator-avatars/${objectPath}`;
      }
    } catch { /* fall back to upstream url */ }
  }

  await sbPatch("creators", `id=eq.${creatorId}`, { profile_image_url: storedUrl ?? avatarUrl });
  await sbRpc("merge_scrape_status", { p_creator_id: creatorId, p_patch: { profile_image_at: new Date().toISOString(), profile_image_source: source, profile_image_cached: storedUrl !== null } }).catch(() => {});
  return { ok: true, avatarUrl: storedUrl ?? avatarUrl };
}

/** Pull TikTok audience-by-country demographics (~26 credits). */
export async function pullAudienceCountry(creatorId: string): Promise<{ ok: boolean; error?: string }> {
  if (!creatorId) return { ok: false, error: "Missing creator_id" };
  const headers = scHeaders();
  if (!headers) return { ok: false, error: "ScrapeCreators API key not configured." };
  const rows = await sbGet(`creators?select=tiktok_handle&id=eq.${creatorId}&limit=1`);
  const handle = (rows[0] as { tiktok_handle?: string | null } | undefined)?.tiktok_handle;
  if (!handle) return { ok: false, error: "Creator has no TikTok handle. Audience demos are TikTok-only." };
  try {
    const res = await fetch(`${SC_BASE}/v1/tiktok/user/audience?handle=${encodeURIComponent(handle)}`, { headers, cache: "no-store" });
    if (!res.ok) {
      const friendly = res.status >= 500 ? "ScrapeCreators is temporarily failing on the audience endpoint (500). Try again in a few minutes." : res.status === 404 ? "TikTok says this account doesn't exist or has no audience data exposed." : res.status === 401 || res.status === 403 ? "ScrapeCreators rejected our API key." : `ScrapeCreators ${res.status}`;
      return { ok: false, error: friendly };
    }
    const payload = await res.json();
    if (typeof payload.credits_remaining === "number") recordSCCredits(payload.credits_remaining);
    await sbRpc("merge_scrape_status", { p_creator_id: creatorId, p_patch: { audience_country: payload, audience_country_at: new Date().toISOString() } });
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Refresh every active leaf creator (the cron + Refresh-all button). */
/** Days without a post before a creator drops to one refresh a day. */
const QUIET_DAYS = 14;

/**
 * Which creators to walk on this run.
 *
 * Paging a feed costs a credit per page and the deepest accounts are 20+ pages,
 * so refreshing a creator who has not posted in a fortnight three times a day
 * buys nothing: their view counts still move, but a once-daily snapshot is
 * plenty for a monthly payout, and measured against the roster this is about a
 * fifth of the daily burn.
 *
 * Quiet creators are still refreshed on the 00:00 UTC run, so nobody goes more
 * than a day without a snapshot. Anyone signed in the last week is always
 * included — they have no posting history to judge them on yet.
 */
async function creatorsDueThisRun(all: any[], windowDays: number): Promise<any[]> {
  const deepRun = new Date().getUTCHours() < 8; // the 00:00 cron; the other two skip the quiet ones
  if (deepRun) return all;

  const quietCut = new Date(Date.now() - QUIET_DAYS * 86400_000).toISOString();
  const newCut = new Date(Date.now() - 7 * 86400_000).toISOString();

  const recent = await sbGetAll(
    `posts?select=creator_id&posted_at=gte.${quietCut}&order=posted_at.desc`
  ).catch(() => [] as any[]);
  // A read failure must not silently halve the refresh — fall back to everyone.
  if (!Array.isArray(recent) || recent.length === 0) return all;

  const posting = new Set((recent as any[]).map((r) => r.creator_id));
  return all.filter((c) => posting.has(c.id) || (c.created_at && c.created_at >= newCut));
}

/** `onlyIds` limits the run to one dashboard section's creators. The 8-hourly
 * cron passes nothing and refreshes everyone. */
export async function refreshAllCreators(windowDays = 30, onlyIds?: Set<string>): Promise<RefreshAllResult> {
  const headers = scHeaders();
  if (!headers) return { ok: false, creators_processed: 0, inserted: 0, updated: 0, failures: 0, error: "ScrapeCreators API key not configured." };
  const tag = encodeURIComponent("{roster}");
  const leaves = await sbGet(`creators?select=id,created_at,instagram_handle,tiktok_handle,youtube_handle&tags=cs.${tag}&status=eq.active&type=neq.persona`);
  const all = (leaves as any[]).filter((c) => (c.instagram_handle || c.tiktok_handle || c.youtube_handle) && (!onlyIds || onlyIds.has(c.id)));
  const withHandle = await creatorsDueThisRun(all, windowDays);
  const results = await Promise.all(withHandle.map((c) => pullCreatorPosts(c.id, windowDays).catch((e) => ({ ok: false, error: String(e) } as PullResult))));
  let inserted = 0, updated = 0, failures = 0;
  results.forEach((r) => { if (r.ok) { inserted += r.inserted ?? 0; updated += r.updated ?? 0; } else failures++; });
  return { ok: true, creators_processed: withHandle.length, creators_skipped_quiet: all.length - withHandle.length, inserted, updated, failures };
}


// ---------------------------------------------------------------------------
// YouTube auto-approve by description
// ---------------------------------------------------------------------------

/**
 * YouTubers put the brand plug in the DESCRIPTION, but the feed endpoints
 * only give us the title, which is what lands in `caption`. So
 * `captionMentionsBrand()` never fires for YouTube and every video waits for
 * a manual tick.
 *
 * The per-video endpoint returns the description and a parsed `descriptionLinks`
 * array, at a credit each. That is only affordable because each video is checked
 * ONCE: the checked ids live in app_state, pruned past the window, so the cron
 * pays for new videos rather than re-reading the backlog every eight hours.
 */

const YT_CHECKED_KEY = "yt_description_checked";
/** Below this, only the core scrape runs. Roughly two days of refreshes. */
const MIN_CREDITS_FOR_EXTRAS = 2000;
/** Ids are dropped once they age past this, so the record cannot grow forever. */
const YT_CHECK_RETENTION_DAYS = 45;

/** Domains that count as a link to your app (BRAND_LINK_DOMAINS, comma separated). */
const BRAND_LINK_DOMAINS = (process.env.BRAND_LINK_DOMAINS || "able.finance").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

/** A link to one of your BRAND_LINK_DOMAINS anywhere in the parsed links or text. */
function descriptionLinksBrand(links: unknown, description: string | null | undefined): boolean {
  const hay: string[] = [];
  if (Array.isArray(links)) {
    for (const l of links) {
      if (typeof l === "string") hay.push(l);
      else if (l && typeof l === "object") {
        const o = l as Record<string, unknown>;
        for (const v of Object.values(o)) if (typeof v === "string") hay.push(v);
      }
    }
  }
  if (description) hay.push(description);
  return BRAND_LINK_DOMAINS.length > 0 && hay.some((t) => BRAND_LINK_DOMAINS.some((d) => t.toLowerCase().includes(d)));
}

/**
 * The description straight from YouTube's own watch page, at no credit cost.
 *
 * The page embeds the player response as JSON and `shortDescription` in it is
 * the FULL description, links and all. Reading it here means this check no
 * longer competes with the view-count refresh for ScrapeCreators credits,
 * which is what had switched it off: the balance sat at 203 against a floor of
 * 2,000, so the job stood down every run and new videos never got looked at.
 *
 * Measured against the real backlog: 89 of 89 live videos parsed, the 90th was
 * an UNPLAYABLE (deleted or private) one, which the paid path cannot read
 * either. Returns null on anything it cannot parse, including a consent wall
 * or a markup change, and the caller falls back to the paid endpoint.
 *
 * YouTube RATE LIMITS this. Ninety requests four at a time earned a 429 and
 * every read after it came back empty, which is exactly how a "free" fix
 * quietly turns into no fix at all. So the reads are spaced out, and a 429
 * gives up on the free path for the rest of the run rather than grinding
 * through the remaining videos collecting nothing.
 */
const YT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function extractShortDescription(html: string): string | null {
  const marker = '"shortDescription":"';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  let i = at + marker.length;
  let raw = "";
  while (i < html.length) {
    const c = html[i];
    if (c === "\\") { raw += html[i] + html[i + 1]; i += 2; continue; }
    if (c === '"') break;
    raw += c;
    i++;
  }
  try {
    return JSON.parse('"' + raw + '"') as string;
  } catch {
    return null;
  }
}

/** How long to wait between watch-page reads. Polite enough not to trip 429. */
const YT_FREE_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FreeRead = { description: string | null; rateLimited: boolean };

async function youtubeDescriptionFree(url: string): Promise<FreeRead> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": YT_UA, "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
    });
    if (r.status === 429) return { description: null, rateLimited: true };
    if (!r.ok) return { description: null, rateLimited: false };
    return { description: extractShortDescription(await r.text()), rateLimited: false };
  } catch {
    return { description: null, rateLimited: false };
  }
}

/**
 * Long-form only. This check reads a video's description, and the other two
 * kinds of YouTube post do not have one to read:
 *
 *   /shorts/  the endpoint answers, but the description comes back empty every
 *             time (6 of 6 sampled). A Shorts plug lives in the title, which is
 *             already stored as `caption` and is not this function's job.
 *   /post/    community posts are not videos; the endpoint 404s on them.
 *
 * Without this, 307 of the 363 posts waiting were calls that could not return
 * an answer, at a credit each.
 */
function isLongFormYouTube(url: string): boolean {
  return !/\/shorts\/|\/post\//.test(url);
}

export interface YtApproveResult {
  ok: boolean;
  candidates: number;
  checked: number;
  approved: number;
  failures: number;
  error?: string;
}

/**
 * Check unapproved YouTube posts for a brand plug in the description and
 * approve the ones that have it.
 *
 * `limit` caps how many videos one run looks at. It used to be a credit
 * budget; now the reads are free and the only cost is time, so it is set high
 * enough to clear the whole 30 day window in a single run and the cron has 300
 * seconds to do it in.
 */
export async function autoApproveYouTubeDescriptions(
  windowDays = 30,
  limit = 250
): Promise<YtApproveResult> {
  const headers = scHeaders();

  // Refreshing view counts is what creators get paid on; clearing an approval
  // queue is a convenience. When the balance is low the first must not lose
  // credits to the second. That used to stop the whole job, which is why
  // nothing had been approved for days. Now only the PAID fallback stands
  // down: reading the description from YouTube costs nothing and always runs.
  const credits = (await appState("sc_credits")) as { remaining?: number } | null;
  const mayPay =
    !!headers && (typeof credits?.remaining !== "number" || credits.remaining >= MIN_CREDITS_FOR_EXTRAS);

  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const tag = encodeURIComponent("{roster}");
  const signed = await sbGet(`creators?select=id&tags=cs.${tag}&status=eq.active&type=neq.persona`);
  const signedIds = new Set((signed as any[]).map((c) => c.id));
  if (signedIds.size === 0) return { ok: true, candidates: 0, checked: 0, approved: 0, failures: 0 };

  const posts = (await sbGet(
    `posts?select=id,url,creator_id&platform=eq.youtube&approved=is.false&excluded=is.false&posted_at=gte.${cutoff}&order=posted_at.desc&limit=500`
  )) as any[];

  /**
   * The record of what has already been PAID for. It is no longer a reason to
   * skip a video outright: a creator can add the link to a description days
   * after posting, and under the old rule that video was marked checked once
   * and never read again, so it could never be approved. The free read costs
   * nothing, so every candidate is re-read every run and only the paid
   * fallback consults this.
   */
  const state = ((await appState(YT_CHECKED_KEY)) as Record<string, string> | null) ?? {};
  const candidates = posts.filter(
    (p) => signedIds.has(p.creator_id) && p.url && isLongFormYouTube(p.url)
  );

  let checked = 0, approved = 0, failures = 0;
  // Flipped off by a 429 and stays off for the rest of the run.
  let freeOk = true;
  for (const post of candidates.slice(0, limit)) {
    try {
      let hit: boolean | null = null;

      // Free first, while YouTube is still answering.
      let free: FreeRead = { description: null, rateLimited: false };
      if (freeOk) {
        free = await youtubeDescriptionFree(post.url);
        if (free.rateLimited) freeOk = false;
        else await sleep(YT_FREE_DELAY_MS);
      }

      if (free.description !== null) {
        checked++;
        hit =
          descriptionLinksBrand(null, free.description) ||
          captionMentionsBrand(free.description);
      } else if (mayPay && !state[post.id]) {
        // Only what the free read could not answer, and only once per video.
        const res = await fetch(
          `${SC_BASE}/v1/youtube/video?url=${encodeURIComponent(post.url)}`,
          { headers: headers!, cache: "no-store" }
        );
        checked++;
        if (!res.ok) {
          // 404 = deleted or private. Record it; re-asking every run buys nothing.
          if (res.status === 404) state[post.id] = new Date().toISOString();
          else failures++;
          continue;
        }
        const data = await res.json();
        if (typeof data.credits_remaining === "number") recordSCCredits(data.credits_remaining);
        state[post.id] = new Date().toISOString();
        const desc = typeof data.description === "string" ? data.description : null;
        hit = descriptionLinksBrand(data.descriptionLinks, desc) || captionMentionsBrand(desc);
      } else {
        // Unreadable for free and not payable right now. Leave it for next run
        // rather than recording a verdict nobody actually reached.
        continue;
      }

      if (hit) {
        // Re-read `excluded` at the moment of writing: Exclude is the manual
        // override and must win even if it was set during this run.
        const fresh = await sbGet(`posts?select=excluded,approved&id=eq.${post.id}&limit=1`);
        if (fresh[0] && !fresh[0].excluded && !fresh[0].approved) {
          await sbPatch("posts", `id=eq.${post.id}`, { approved: true });
          approved++;
        }
      }
    } catch {
      failures++;
    }
  }

  const keep = Date.now() - YT_CHECK_RETENTION_DAYS * 86400_000;
  const pruned: Record<string, string> = {};
  for (const [id, at] of Object.entries(state)) {
    if (new Date(at).getTime() >= keep) pruned[id] = at;
  }
  await appStateSet(YT_CHECKED_KEY, pruned).catch(() => {});

  return {
    ok: true,
    candidates: candidates.length,
    checked,
    approved,
    failures,
    ...(freeOk ? {} : { error: "YouTube rate limited the free reads; the rest wait for the next run." }),
  };
}
