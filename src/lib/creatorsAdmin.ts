import "server-only";
import { sbGet, sbInsert, sbPatch, sbDelete } from "@/lib/scrape";
import { JPC_TAG, JPP_TAG, withResponsibility, slugForCreator, type Platform, type Responsibility } from "@/lib/creators";

/**
 * Creator + prospect management — ported from jp-creators' actions.ts CRUD
 * over PostgREST. Auto-pull on create/handle-change is triggered by the
 * client (it calls /api/creators/refresh + /profile after a successful
 * create), so these functions stay pure DB ops.
 */

const trim = (v: unknown): string => (v ? String(v).trim().replace(/^@/, "") : "");
const RESP_VALUES: Responsibility[] = ["adam", "salma", "both", "moving_to_salma"];
const FINANCE_ZEROS = { deal_type: null, flat_fee: 0, cpm_rate: 0, hybrid_base: 0, hybrid_cpm: 0, posts_per_month: 0, rate_per_view: 0 };

type Result = { ok: boolean; error?: string; id?: string; slug?: string; existingId?: string };

async function findByHandles(tag: string, handles: { ig?: string; tt?: string; yt?: string }, excludeId?: string): Promise<any | null> {
  const ors: string[] = [];
  if (handles.ig) ors.push(`instagram_handle.eq.${encodeURIComponent(handles.ig)}`);
  if (handles.tt) ors.push(`tiktok_handle.eq.${encodeURIComponent(handles.tt)}`);
  if (handles.yt) ors.push(`youtube_handle.eq.${encodeURIComponent(handles.yt)}`);
  if (ors.length === 0) return null;
  let q = `creators?select=id,name,instagram_handle,tiktok_handle,youtube_handle&tags=cs.${encodeURIComponent(`{${tag}}`)}&or=(${ors.join(",")})&limit=1`;
  if (excludeId) q += `&id=neq.${excludeId}`;
  const rows = await sbGet(q);
  return rows[0] ?? null;
}

export async function createCreator(input: Record<string, any>): Promise<Result> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  const type = ["persona", "daily_ugc", "youtuber", "influencer"].includes(input.type) ? input.type : "influencer";
  const ig = trim(input.instagram_handle), tt = trim(input.tiktok_handle), yt = trim(input.youtube_handle);
  if (type !== "persona" && !ig && !tt && !yt) return { ok: false, error: "At least one platform handle is required" };
  const parent_id = type !== "persona" && input.parent_id ? String(input.parent_id) : null;

  if (type !== "persona") {
    const existing = await findByHandles(JPC_TAG, { ig, tt, yt });
    if (existing) {
      const which = ig && existing.instagram_handle === ig ? `@${ig} (Instagram)` : tt && existing.tiktok_handle === tt ? `@${tt} (TikTok)` : yt && existing.youtube_handle === yt ? `@${yt} (YouTube)` : "that handle";
      return { ok: false, error: `${which} is already tracked as "${existing.name}".`, existingId: existing.id };
    }
  }
  const created = await sbInsert("creators", {
    name, instagram_handle: type === "persona" ? null : ig || null, tiktok_handle: type === "persona" ? null : tt || null, youtube_handle: type === "persona" ? null : yt || null,
    type, status: "active", parent_id, profile_image_url: null, tags: [JPC_TAG], ...FINANCE_ZEROS,
  }, true);
  const row = created[0];
  if (!row) return { ok: false, error: "Insert failed" };
  return { ok: true, id: row.id, slug: slugForCreator(row) };
}

export async function updateCreator(input: Record<string, any>): Promise<Result> {
  const id = String(input.id ?? "");
  if (!id) return { ok: false, error: "Missing id" };
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  const newType = ["persona", "daily_ugc", "youtuber", "influencer"].includes(input.type) ? input.type : "influencer";
  const ig = trim(input.instagram_handle), tt = trim(input.tiktok_handle), yt = trim(input.youtube_handle);
  if (newType !== "persona" && !ig && !tt && !yt) return { ok: false, error: "At least one platform handle is required" };
  const parent_id = newType !== "persona" && input.parent_id ? String(input.parent_id) : null;

  const cur = (await sbGet(`creators?select=type,instagram_handle,tiktok_handle,youtube_handle,tags&id=eq.${id}&limit=1`))[0] as any;

  // Leaf → persona conversion: spin off a child carrying the old handles + migrate posts.
  if (cur && cur.type !== "persona" && newType === "persona" && (cur.instagram_handle || cur.tiktok_handle || cur.youtube_handle)) {
    const childName = String(input.child_name ?? "").trim() || name;
    const child = await sbInsert("creators", {
      name: childName, instagram_handle: cur.instagram_handle, tiktok_handle: cur.tiktok_handle, youtube_handle: cur.youtube_handle,
      type: cur.type === "influencer" || cur.type === "youtuber" ? cur.type : "daily_ugc",
      status: "active", parent_id: id, profile_image_url: null, tags: [JPC_TAG], ...FINANCE_ZEROS,
    }, true);
    const childId = child[0]?.id;
    if (childId) await sbPatch("posts", `creator_id=eq.${id}`, { creator_id: childId });
  }

  const payload: Record<string, unknown> = {
    name, instagram_handle: newType === "persona" ? null : ig || null, tiktok_handle: newType === "persona" ? null : tt || null, youtube_handle: newType === "persona" ? null : yt || null, type: newType, parent_id,
  };
  // Responsibility: only touch tags when the field is explicitly present.
  if (input.responsibility !== undefined) {
    const next: Responsibility | null = input.responsibility === "" || input.responsibility == null ? null : RESP_VALUES.includes(input.responsibility) ? input.responsibility : null;
    payload.tags = withResponsibility(cur?.tags ?? [], next);
  }
  await sbPatch("creators", `id=eq.${id}`, payload);
  return { ok: true };
}

export async function setCreatorStatus(id: string, status: "active" | "archived"): Promise<Result> {
  if (!id) return { ok: false, error: "Missing id" };
  await sbPatch("creators", `id=eq.${id}`, { status });
  return { ok: true };
}

export async function detachChild(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Missing id" };
  await sbPatch("creators", `id=eq.${id}`, { parent_id: null });
  return { ok: true };
}

/** Cascade delete: view_snapshots → posts → creator. */
async function cascadeDelete(creatorId: string): Promise<void> {
  const posts = await sbGet(`posts?select=id&creator_id=eq.${creatorId}&limit=100000`);
  const ids = (posts as { id: string }[]).map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await sbDelete("view_snapshots", `post_id=in.(${batch.join(",")})`);
  }
  await sbDelete("posts", `creator_id=eq.${creatorId}`);
  await sbDelete("creators", `id=eq.${creatorId}`);
}

export async function deleteCreator(id: string, force = false): Promise<Result> {
  if (!id) return { ok: false, error: "Missing id" };
  const c = (await sbGet(`creators?select=status,parent_id&id=eq.${id}&limit=1`))[0] as { status?: string; parent_id?: string | null } | undefined;
  if (!c) return { ok: false, error: "Creator not found" };
  const isChild = !!c.parent_id;
  if (!isChild && !force && c.status !== "archived") return { ok: false, error: "Archive first, then delete." };
  await cascadeDelete(id);
  return { ok: true };
}

// ---- prospects ----
export async function createProspect(input: Record<string, any>): Promise<Result> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  const ig = trim(input.instagram_handle), tt = trim(input.tiktok_handle), yt = trim(input.youtube_handle);
  if (!ig && !tt && !yt) return { ok: false, error: "At least one platform handle is required" };
  const dupe = await findByHandles(JPP_TAG, { ig, tt, yt });
  if (dupe) return { ok: false, error: `Already tracked as prospect "${dupe.name}".` };
  const created = await sbInsert("creators", {
    name, instagram_handle: ig || null, tiktok_handle: tt || null, youtube_handle: yt || null,
    type: "daily_ugc", status: "active", parent_id: null, profile_image_url: null, tags: [JPP_TAG], ...FINANCE_ZEROS,
  }, true);
  const row = created[0];
  if (!row) return { ok: false, error: "Insert failed" };
  return { ok: true, id: row.id, slug: slugForCreator(row) };
}

export async function updateProspect(input: Record<string, any>): Promise<Result & { handleChanged?: boolean }> {
  const id = String(input.id ?? "");
  if (!id) return { ok: false, error: "Missing id" };
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  const ig = trim(input.instagram_handle), tt = trim(input.tiktok_handle), yt = trim(input.youtube_handle);
  if (!ig && !tt && !yt) return { ok: false, error: "At least one platform handle is required" };
  const cur = (await sbGet(`creators?select=instagram_handle,tiktok_handle,youtube_handle&id=eq.${id}&limit=1`))[0] as any;
  const changed: { ig?: string; tt?: string; yt?: string } = {};
  if (ig && ig !== cur?.instagram_handle) changed.ig = ig;
  if (tt && tt !== cur?.tiktok_handle) changed.tt = tt;
  if (yt && yt !== cur?.youtube_handle) changed.yt = yt;
  if (Object.keys(changed).length > 0) {
    const dupe = await findByHandles(JPP_TAG, changed, id);
    if (dupe) return { ok: false, error: `Already tracked as prospect "${dupe.name}".` };
  }
  const handleChanged = (ig || null) !== (cur?.instagram_handle ?? null) || (tt || null) !== (cur?.tiktok_handle ?? null) || (yt || null) !== (cur?.youtube_handle ?? null);
  await sbPatch("creators", `id=eq.${id}`, { name, instagram_handle: ig || null, tiktok_handle: tt || null, youtube_handle: yt || null });
  return { ok: true, handleChanged };
}

export async function promoteProspect(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Missing id" };
  await sbPatch("creators", `id=eq.${id}`, { tags: [JPC_TAG] });
  return { ok: true };
}
export async function deleteProspect(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Missing id" };
  await cascadeDelete(id);
  return { ok: true };
}

// ---- manual outlier ----
// Share/short links (tiktok.com/t/…, vm./vt.tiktok.com/…, instagram.com/share/…)
// don't contain the post id — they 301 to the canonical URL, so follow the
// redirect first and parse what it lands on.
const SHORT_LINK_RE = /(?:tiktok\.com\/t\/|v[mt]\.tiktok\.com\/|instagram\.com\/share\/)/i;
async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" },
    });
    return res.url || url;
  } catch {
    return url; // parse below fails with a clear message instead
  }
}

function parsePostUrl(raw: string): { platform: Platform; external_id: string; clean_url: string } | null {
  const url = raw.trim();
  // Canonicalize TikTok to strip share-tracking params when we know the handle.
  const tt = url.match(/tiktok\.com\/(?:@([^/?]+)\/)?(?:video|v)\/(\d+)/i);
  if (tt) return { platform: "tiktok", external_id: tt[2], clean_url: tt[1] ? `https://www.tiktok.com/@${tt[1]}/video/${tt[2]}` : url };
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { platform: "youtube", external_id: yt[1], clean_url: url };
  const ig = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return { platform: "instagram", external_id: ig[1], clean_url: url };
  // No silent fallback: the old "assume Instagram, whole URL as id" path filed
  // TikTok share links as broken IG posts whose archive could never succeed.
  return null;
}

async function ensureExternalCreator(): Promise<string> {
  const existing = await sbGet(`creators?select=id&name=eq.External&tags=cs.${encodeURIComponent(`{${JPC_TAG}}`)}&limit=1`);
  if (existing.length > 0) return existing[0].id;
  const created = await sbInsert("creators", { name: "External", type: "other", status: "archived", tags: [JPC_TAG], instagram_handle: null, tiktok_handle: null, youtube_handle: null, ...FINANCE_ZEROS }, true);
  if (!created[0]) throw new Error("Could not create External creator");
  return created[0].id;
}

export async function addManualOutlier(input: Record<string, any>): Promise<Result & { postId?: string }> {
  try {
    const explicit = String(input.creator_id ?? "").trim();
    const rawUrl = String(input.url ?? "").trim();
    const note = String(input.note ?? "").trim();
    if (!rawUrl || !/^https?:\/\//.test(rawUrl)) return { ok: false, error: "Paste a full https:// URL" };
    const resolved = SHORT_LINK_RE.test(rawUrl) ? await resolveShortLink(rawUrl) : rawUrl;
    const parsed = parsePostUrl(resolved);
    if (!parsed) {
      return { ok: false, error: "Couldn't read a post id from that URL. Paste the full post link (tiktok.com/@user/video/…, instagram.com/reel/…, youtube.com/watch…) — share links normally resolve automatically, but this one didn't." };
    }
    const { platform, external_id, clean_url } = parsed;

    let creatorId = explicit;
    if (!creatorId && platform === "tiktok") {
      const handle = clean_url.match(/tiktok\.com\/@([^/]+)\//i)?.[1];
      if (handle) {
        const m = await sbGet(`creators?select=id&tiktok_handle=eq.${encodeURIComponent(handle)}&limit=1`);
        if (m.length > 0) creatorId = m[0].id;
      }
    }
    if (!creatorId) creatorId = await ensureExternalCreator();

    const existing = await sbGet(`posts?select=id&creator_id=eq.${creatorId}&platform=eq.${platform}&external_id=eq.${encodeURIComponent(external_id)}&limit=1`);
    let postId: string;
    if (existing.length > 0) {
      postId = existing[0].id;
      await sbPatch("posts", `id=eq.${postId}`, { is_outlier: true, approved: true, archive_status: "pending" });
    } else {
      const created = await sbInsert("posts", {
        creator_id: creatorId, platform, external_id, url: clean_url, thumbnail_url: null,
        caption: note || "(fetching…)", hashtags: [], view_count: 0, like_count: 0, comment_count: 0,
        posted_at: new Date().toISOString(), discovered_at: new Date().toISOString(), excluded: false, approved: true, is_outlier: true, archive_status: "pending",
      }, true);
      if (!created[0]) return { ok: false, error: "Insert failed" };
      postId = created[0].id;
    }
    return { ok: true, postId };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Add failed" };
  }
}
