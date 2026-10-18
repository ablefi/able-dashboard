/**
 * Minimal server-side Supabase REST helpers. They use the service-role key, so
 * they must ONLY be imported from API routes (never client components). Plain
 * PostgREST over fetch; no SDK dependency.
 */

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return { url: url.replace(/\/$/, ""), key };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = cfg();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Creators roster (roster) — same `creators` / `posts` Supabase tables.
// ---------------------------------------------------------------------------

const CREATOR_COLS =
  "id,name,instagram_handle,tiktok_handle,youtube_handle,type,status,profile_image_url,tags,parent_id,last_scraped_at,region";

/** EVERY creator row in one call (the table is ~100 rows) — top-level,
 * children and prospects alike; callers slice in JS. Lets the roster make
 * ONE creators query instead of three. */
export async function fetchCreatorsUniverse(): Promise<any[]> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/creators?select=${CREATOR_COLS}&order=name&limit=2000`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`creators universe failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Per-creator counted-post aggregates from the `creator_roster_stats` DB
 * function — one round trip instead of paging raw post rows into JS. The SQL
 * mirrors postCounts()/isCommunityPost() exactly (verified equivalent). */
export async function fetchRosterStats(
  fromISO: string,
  toISO: string
): Promise<{ creator_id: string; counted_posts: number; counted_views: number; last_posted_at: string | null }[]> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/rpc/creator_roster_stats`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ p_from: fromISO, p_to: toISO }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`roster stats rpc failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Children of the given persona ids. */
export async function fetchCreatorChildren(parentIds: string[]): Promise<any[]> {
  if (parentIds.length === 0) return [];
  const { url } = cfg();
  const p = [`select=${CREATOR_COLS}`, `parent_id=in.(${parentIds.join(",")})`, "order=name", "limit=2000"];
  const res = await fetch(`${url}/rest/v1/creators?${p.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`creator children failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Leaf creators (roster, not personas) for the post feed's creator map. */
export async function fetchLeafCreators(): Promise<any[]> {
  const { url } = cfg();
  const p = [
    "select=id,name,type,instagram_handle,tiktok_handle,youtube_handle,profile_image_url",
    `tags=cs.${encodeURIComponent("{roster}")}`,
    "type=neq.persona",
    "limit=2000",
  ];
  const res = await fetch(`${url}/rest/v1/creators?${p.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`leaf creators failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const POST_FEED_COLS =
  "id,creator_id,platform,url,thumbnail_url,media_urls,caption,view_count,like_count,comment_count,posted_at,approved,excluded,is_outlier,archive_status,archive_video_url,published_to_top";

/** Post feed with server-side filters (state/YT-variant narrowed in JS by caller). */
export async function fetchPostsList(opts: {
  creatorIds: string[];
  platform?: string;
  outliersOnly?: boolean;
  excludedOnly?: boolean;
  creatorId?: string;
  search?: string;
  fromISO?: string;
  toISO?: string;
  sort?: "recent" | "views";
  limit?: number;
}): Promise<any[]> {
  if (opts.creatorIds.length === 0) return [];
  const { url } = cfg();
  const p = [`select=${POST_FEED_COLS}`, `creator_id=in.(${(opts.creatorId ? [opts.creatorId] : opts.creatorIds).join(",")})`];
  if (opts.platform && ["instagram", "tiktok", "youtube"].includes(opts.platform)) p.push(`platform=eq.${opts.platform}`);
  else if (opts.platform && opts.platform.startsWith("yt_")) p.push("platform=eq.youtube");
  if (opts.outliersOnly) p.push("is_outlier=eq.true");
  if (opts.excludedOnly) p.push("excluded=eq.true");
  if (opts.search) p.push(`caption=ilike.${encodeURIComponent(`%${opts.search}%`)}`);
  if (opts.fromISO) p.push(`posted_at=gte.${opts.fromISO}`);
  if (opts.toISO) p.push(`posted_at=lte.${opts.toISO}`);
  p.push(`order=${opts.sort === "views" ? "view_count" : "posted_at"}.desc`);
  p.push(`limit=${opts.limit ?? 300}`);
  const res = await fetch(`${url}/rest/v1/posts?${p.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`posts failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Post fields needed to archive/publish an outlier. */
export async function fetchPostForArchive(id: string): Promise<any | null> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/posts?select=id,platform,url,creator_id,archive_status,archive_video_url,published_to_top&id=eq.${id}&limit=1`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`post for archive failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

/** A single post's thumbnail URL (for the IG thumb proxy). */
export async function fetchPostThumbnail(id: string): Promise<string | null> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/posts?select=thumbnail_url&id=eq.${id}&limit=1`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`post thumbnail failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.length > 0 ? (data[0].thumbnail_url ?? null) : null;
}

export async function updatePost(id: string, patch: Record<string, unknown>): Promise<void> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`post update failed: ${res.status} ${await res.text()}`);
}

/** Posts for performance roll-up (likes/comments/platform too) — count first,
 * then all pages in parallel (was a sequential walk). */
export async function fetchPerformancePosts(creatorIds: string[], fromISO: string, toISO: string, platform?: string): Promise<any[]> {
  if (creatorIds.length === 0) return [];
  const { url } = cfg();
  const PAGE = 1000;
  const base = [
    "select=creator_id,platform,url,view_count,like_count,comment_count,posted_at,approved,excluded",
    `creator_id=in.(${creatorIds.join(",")})`,
    `posted_at=gte.${fromISO}`,
    `posted_at=lte.${toISO}`,
    "order=posted_at.desc",
    ...(platform && platform !== "all" ? [`platform=eq.${platform}`] : []),
  ].join("&");
  const head = await fetch(`${url}/rest/v1/posts?${base}&limit=1`, {
    method: "HEAD",
    headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    cache: "no-store",
  });
  const total = head.ok || head.status === 206 ? Number((head.headers.get("content-range") || "").split("/")[1]) || 0 : 0;
  if (total === 0) return [];
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) }, (_, i) =>
      fetch(`${url}/rest/v1/posts?${base}&limit=${PAGE}&offset=${i * PAGE}`, { headers: headers(), cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`performance posts failed: ${r.status}`);
        return r.json();
      })
    )
  );
  return pages.flat();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A creator's scrape_status JSONB (audience demographics, per-platform pulled-at). */
export async function fetchCreatorScrapeStatus(id: string): Promise<any | null> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/creators?select=scrape_status&id=eq.${id}&limit=1`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`scrape_status failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.length > 0 ? (data[0].scrape_status ?? null) : null;
}

/** Resolve a roster creator by UUID or platform handle (slug). */
export async function fetchCreatorBySlug(slug: string): Promise<any | null> {
  const { url } = cfg();
  const tag = `tags=cs.${encodeURIComponent("{roster}")}`;
  let filter: string;
  if (UUID_RE.test(slug)) filter = `id=eq.${slug}`;
  else filter = `or=(instagram_handle.eq.${encodeURIComponent(slug)},tiktok_handle.eq.${encodeURIComponent(slug)},youtube_handle.eq.${encodeURIComponent(slug)})`;
  const res = await fetch(`${url}/rest/v1/creators?select=${CREATOR_COLS}&${tag}&${filter}&limit=1`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`creator by slug failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

/** A creator row by UUID (no tag filter — used for persona parent lookups). */
export async function fetchCreatorById(id: string): Promise<any | null> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/creators?select=${CREATOR_COLS}&id=eq.${id}&limit=1`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`creator by id failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

/** A creator's posts over a window, each with its view_snapshots series.
 * Post pages and snapshot batches all fetch in parallel (was sequential). */
export async function fetchPostsWithSeries(creatorIds: string[], fromISO: string, toISO: string): Promise<any[]> {
  if (creatorIds.length === 0) return [];
  const { url } = cfg();
  const cols = "id,creator_id,platform,url,thumbnail_url,media_urls,caption,view_count,like_count,comment_count,posted_at,approved,excluded,is_outlier";
  const PAGE = 1000;
  const base = [`select=${cols}`, `creator_id=in.(${creatorIds.join(",")})`, `posted_at=gte.${fromISO}`, `posted_at=lte.${toISO}`, "order=posted_at.desc"].join("&");
  const head = await fetch(`${url}/rest/v1/posts?${base}&limit=1`, {
    method: "HEAD",
    headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    cache: "no-store",
  });
  const total = head.ok || head.status === 206 ? Number((head.headers.get("content-range") || "").split("/")[1]) || 0 : 0;
  if (total === 0) return [];
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) }, (_, i) =>
      fetch(`${url}/rest/v1/posts?${base}&limit=${PAGE}&offset=${i * PAGE}`, { headers: headers(), cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`creator posts failed: ${r.status}`);
        return r.json();
      })
    )
  );
  const posts: any[] = pages.flat();

  // Attach view-history snapshots — id batches (URL-length bound) in parallel.
  const ids = posts.map((p) => p.id);
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
  const snapResults = await Promise.all(
    batches.map((batch) =>
      fetch(`${url}/rest/v1/view_snapshots?select=post_id,view_count,snapshot_at&post_id=in.(${batch.join(",")})&order=snapshot_at.asc&limit=20000`, { headers: headers(), cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`view snapshots failed: ${r.status}`);
        return r.json() as Promise<{ post_id: string; view_count: number; snapshot_at: string }[]>;
      })
    )
  );
  const byPost = new Map<string, { snapshot_at: string; view_count: number }[]>();
  for (const s of snapResults.flat()) {
    const arr = byPost.get(s.post_id) ?? [];
    arr.push({ snapshot_at: s.snapshot_at, view_count: s.view_count });
    byPost.set(s.post_id, arr);
  }
  return posts.map((p) => ({ ...p, series: byPost.get(p.id) ?? [] }));
}

/** Posts in a window (for the calendar heatmap) — minimal cols, paged. */
export async function fetchCalendarPosts(creatorIds: string[], fromISO: string, toISO: string): Promise<any[]> {
  if (creatorIds.length === 0) return [];
  const { url } = cfg();
  const PAGE = 1000;
  const rows: any[] = [];
  const idFilter = `creator_id=in.(${creatorIds.join(",")})`;
  for (let from = 0; ; from += PAGE) {
    const p = [
      "select=creator_id,posted_at,approved,excluded,url",
      idFilter,
      `posted_at=gte.${fromISO}`,
      `posted_at=lt.${toISO}`,
      "order=posted_at.asc",
      `limit=${PAGE}`,
      `offset=${from}`,
    ];
    const res = await fetch(`${url}/rest/v1/posts?${p.join("&")}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`calendar posts failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Prospect roster (prospect tag, not archived). */
export async function fetchProspects(search?: string): Promise<any[]> {
  const { url } = cfg();
  const p = [`select=${CREATOR_COLS}`, `tags=cs.${encodeURIComponent("{prospect}")}`, "status=neq.archived", "order=name", "limit=2000"];
  if (search) p.push(`name=ilike.${encodeURIComponent(`%${search}%`)}`);
  const res = await fetch(`${url}/rest/v1/creators?${p.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`prospects failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Prospect posts over a window — for per-platform avg views. Paged. */
export async function fetchProspectPosts(creatorIds: string[], fromISO: string, toISO: string): Promise<any[]> {
  if (creatorIds.length === 0) return [];
  const { url } = cfg();
  const PAGE = 1000;
  const rows: any[] = [];
  const idFilter = `creator_id=in.(${creatorIds.join(",")})`;
  for (let from = 0; ; from += PAGE) {
    const p = [
      "select=creator_id,platform,view_count,posted_at",
      idFilter,
      `posted_at=gte.${fromISO}`,
      `posted_at=lte.${toISO}`,
      `limit=${PAGE}`,
      `offset=${from}`,
    ];
    const res = await fetch(`${url}/rest/v1/posts?${p.join("&")}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`prospect posts failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Posts for the given creator ids over a window — paged past the 1k cap. */
export async function fetchCreatorPostsForStats(creatorIds: string[], fromISO: string, toISO: string): Promise<any[]> {
  if (creatorIds.length === 0) return [];
  const { url } = cfg();
  const PAGE = 1000;
  const base = [
    "select=creator_id,url,view_count,approved,excluded,posted_at",
    `creator_id=in.(${creatorIds.join(",")})`,
    `posted_at=gte.${fromISO}`,
    `posted_at=lte.${toISO}`,
    "order=posted_at.desc",
  ].join("&");

  const fetchPage = async (offset: number): Promise<any[]> => {
    const res = await fetch(`${url}/rest/v1/posts?${base}&limit=${PAGE}&offset=${offset}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`creator posts failed: ${res.status} ${await res.text()}`);
    return res.json();
  };

  // Get the exact match count up front (index-assisted HEAD) so every page can
  // be fetched in parallel instead of walked one-by-one — this is the roster's
  // main slow point. Falls back to a sequential walk if the count is unavailable.
  let total = 0;
  try {
    const head = await fetch(`${url}/rest/v1/posts?${base}&limit=1`, {
      method: "HEAD",
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
      cache: "no-store",
    });
    if (head.ok || head.status === 206) total = Number((head.headers.get("content-range") || "").split("/")[1]) || 0;
  } catch {
    /* fall through to sequential */
  }

  if (total <= 0) {
    const rows: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const data = await fetchPage(offset);
      if (!data.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  // Fetch all pages, a few concurrent at a time to bound load on PostgREST.
  const pageCount = Math.ceil(total / PAGE);
  const CONC = 5;
  const rows: any[] = [];
  for (let i = 0; i < pageCount; i += CONC) {
    const batch: Promise<any[]>[] = [];
    for (let j = i; j < Math.min(i + CONC, pageCount); j++) batch.push(fetchPage(j * PAGE));
    for (const data of await Promise.all(batch)) rows.push(...data);
  }
  return rows;
}


/** revenue_snapshots, ascending, optional date range. */
export async function fetchSnapshots(from?: string | null, to?: string | null): Promise<any[]> {
  const { url } = cfg();
  const p = ["select=*", "order=snapshot_date.asc", "limit=100000"];
  if (from) p.push(`snapshot_date=gte.${from}`);
  if (to) p.push(`snapshot_date=lte.${to}`);
  const res = await fetch(`${url}/rest/v1/revenue_snapshots?${p.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`snapshots failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Single app_state value (e.g. starting_capital). */
export async function appState(key: string, throwOnError = false): Promise<any> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/app_state?select=key,value&key=eq.${encodeURIComponent(key)}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    if (throwOnError) throw new Error(`app_state read failed: ${res.status}`);
    return null;
  }
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

/** Upsert an app_state value (used to cache competitor rankings). */
export async function appStateSet(key: string, value: unknown): Promise<void> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/app_state?on_conflict=key`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`app_state set failed: ${res.status} ${await res.text()}`);
}

/** Insert an immutable daily snapshot; the unique key makes concurrent captures safe. */
export async function appStateSetOnce(key: string, value: unknown): Promise<void> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/app_state?on_conflict=key`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`app_state insert failed: ${res.status}`);
}

/** List matching keys only, paging without downloading historical payloads. */
export async function appStateKeys(prefix: string): Promise<string[]> {
  const { url } = cfg();
  const keys: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/app_state?select=key&key=like.${encodeURIComponent(prefix + "*")}&order=key.desc&limit=1000&offset=${offset}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`app_state keys failed: ${res.status}`);
    const rows: { key: string }[] = await res.json();
    keys.push(...rows.map((row) => row.key));
    if (rows.length < 1000) return keys;
  }
}

// ---------------------------------------------------------------------------
// Marketing: page_views + competitors
// ---------------------------------------------------------------------------

/** Slim page_views rows since an ISO timestamp (paged). */
export async function fetchPageViews(sinceIso?: string | null): Promise<any[]> {
  const { url } = cfg();
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const p = ["select=path,referrer,country,device,os,created_at", "order=created_at.desc", `limit=${PAGE}`, `offset=${from}`];
    if (sinceIso) p.push(`created_at=gte.${encodeURIComponent(sinceIso)}`);
    const res = await fetch(`${url}/rest/v1/page_views?${p.join("&")}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`page_views failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}


// ---------------------------------------------------------------------------
// Competitors (Growth → Competitors)
// ---------------------------------------------------------------------------

export async function fetchCompetitorRows(): Promise<any[]> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/competitors?select=*&order=name`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`competitors failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function insertCompetitor(row: Record<string, unknown>): Promise<any> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/competitors`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`competitor insert failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteCompetitorRow(id: string): Promise<void> {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/competitors?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`competitor delete failed: ${res.status} ${await res.text()}`);
}
