import { captionMentionsBrand } from "@/lib/brand";
import "server-only";
import { appStateSet } from "@/lib/supabaseRest";

/**
 * ScrapeCreators ingestion — ported from jp-creators' actions.ts. Pulls a
 * creator's recent posts from IG/TikTok/YouTube, normalizes them, and upserts
 * into the shared `posts` table (+ today's view_snapshots row). Reimplemented
 * over PostgREST (this app talks raw REST, not the Supabase JS client).
 *
 * Used by the per-creator Refresh button, persona fan-out, refresh-all, and
 * the 8-hourly cron.
 */

export const SC_BASE = "https://api.scrapecreators.com";
const MAX_PAGES = 5;

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
// Auto-approve ONLY on a real @mention of our own account in the caption.
// The handles and matching rules live in lib/brand.ts so they can be changed
// in one place.
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
    const oldest = batch.reduce((min, p) => Math.min(min, new Date(p.posted_at).getTime()), Infinity);
    if (oldest <= cutoffMs) break;
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
    const oldest = batch.reduce((min, p) => Math.min(min, new Date(p.posted_at).getTime()), Infinity);
    if (oldest <= cutoffMs) break;
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
    const oldest = batch.reduce((min, p) => Math.min(min, new Date(p.posted_at).getTime()), Infinity);
    if (oldest <= cutoffMs) break;
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
    // Retroactive auto-approve: a JP-mention post gets approved on re-scrape too
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

export interface RefreshAllResult { ok: boolean; creators_processed: number; inserted: number; updated: number; failures: number; error?: string }

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
          headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "public, max-age=31536000, immutable" },
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
export async function refreshAllCreators(windowDays = 30): Promise<RefreshAllResult> {
  const headers = scHeaders();
  if (!headers) return { ok: false, creators_processed: 0, inserted: 0, updated: 0, failures: 0, error: "ScrapeCreators API key not configured." };
  const tag = encodeURIComponent("{jp-creators}");
  const leaves = await sbGet(`creators?select=id,instagram_handle,tiktok_handle,youtube_handle&tags=cs.${tag}&status=eq.active&type=neq.persona`);
  const withHandle = (leaves as any[]).filter((c) => c.instagram_handle || c.tiktok_handle || c.youtube_handle);
  const results = await Promise.all(withHandle.map((c) => pullCreatorPosts(c.id, windowDays).catch((e) => ({ ok: false, error: String(e) } as PullResult))));
  let inserted = 0, updated = 0, failures = 0;
  results.forEach((r) => { if (r.ok) { inserted += r.inserted ?? 0; updated += r.updated ?? 0; } else failures++; });
  return { ok: true, creators_processed: withHandle.length, inserted, updated, failures };
}
