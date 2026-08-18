import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchPostForArchive, updatePost } from "@/lib/supabaseRest";
import { addManualOutlier } from "@/lib/creatorsAdmin";

/**
 * Outlier archive → publish pipeline, ported from jp-creators' archivePost /
 * setPublishedToTop / deleteArchive. POST { action, id, value? }:
 *   - archive       : resolve a fresh CDN URL via ScrapeCreators, download the
 *                     video, upload it to the public `top-videos` Storage
 *                     bucket, mark archived + backfill metadata. YouTube is
 *                     marked skipped_yt (link-out, no download).
 *   - publish       : flip published_to_top (gated on archived/skipped_yt) —
 *                     this is what actually promotes the post on the public site.
 *   - delete_archive: delete the blob + clear archive_* + published_to_top.
 * Gated by `creators`.
 */
export const maxDuration = 60;

const SC_BASE = "https://api.scrapecreators.com";
function scHeaders(): Record<string, string> | null {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : null;
}
const SUPA = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Meta = { caption?: string; view_count?: number; like_count?: number; comment_count?: number; thumbnail_url?: string | null; posted_at?: string };

async function runArchive(id: string): Promise<{ ok: boolean; status?: string; url?: string; error?: string }> {
  const post = await fetchPostForArchive(id);
  if (!post) return { ok: false, error: "Post not found" };

  if (post.archive_status === "archived" && post.archive_video_url) return { ok: true, status: "archived", url: post.archive_video_url };
  if (post.archive_status === "skipped_yt") return { ok: true, status: "skipped_yt" };

  // YouTube can't be downloaded from ScrapeCreators (metadata-only) — mark skip.
  if (post.platform === "youtube") {
    await updatePost(id, { archive_status: "skipped_yt", archived_at: new Date().toISOString(), archive_error: null });
    return { ok: true, status: "skipped_yt" };
  }
  if (post.platform !== "instagram" && post.platform !== "tiktok") {
    return { ok: false, error: `Unsupported platform: ${post.platform}` };
  }
  const headers = scHeaders();
  if (!headers) return { ok: false, error: "ScrapeCreators API key not configured." };

  // Mark in-flight (survives a mid-archive page refresh).
  await updatePost(id, { archive_status: "pending", archive_error: null }).catch(() => {});

  // 1. Resolve the fresh upstream CDN URL (+ metadata) via ScrapeCreators.
  let mediaUrl: string | null = null;
  let meta: Meta = {};
  try {
    if (post.platform === "tiktok") {
      const r = await fetch(`${SC_BASE}/v2/tiktok/video?url=${encodeURIComponent(post.url)}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(`SC TikTok ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const j = await r.json();
      const aw = j?.aweme_detail ?? {};
      mediaUrl = (aw?.video?.play_addr?.url_list as string[] | undefined)?.[0] ?? null;
      const stats = aw?.statistics ?? {};
      meta = {
        caption: typeof aw.desc === "string" ? aw.desc : undefined,
        view_count: Number(stats.play_count) || 0,
        like_count: Number(stats.digg_count) || 0,
        comment_count: Number(stats.comment_count) || 0,
        thumbnail_url: (aw?.video?.cover?.url_list as string[] | undefined)?.[0] ?? null,
        posted_at: aw.create_time ? new Date(Number(aw.create_time) * 1000).toISOString() : undefined,
      };
    } else {
      const r = await fetch(`${SC_BASE}/v1/instagram/post?url=${encodeURIComponent(post.url)}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(`SC Instagram ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const j = await r.json();
      const xdt = j?.data?.xdt_shortcode_media ?? {};
      mediaUrl = (xdt.video_url as string | undefined) ?? null;
      meta = {
        caption: xdt?.edge_media_to_caption?.edges?.[0]?.node?.text as string | undefined,
        view_count: Number(xdt.video_play_count) || Number(xdt.video_view_count) || 0,
        like_count: Number(xdt?.edge_media_preview_like?.count) || 0,
        comment_count: Number(xdt?.edge_media_preview_comment?.count) || 0,
        thumbnail_url: (xdt.display_url as string | undefined) ?? null,
        posted_at: xdt.taken_at_timestamp ? new Date(Number(xdt.taken_at_timestamp) * 1000).toISOString() : undefined,
      };
    }
  } catch (e) {
    const msg = (e as Error).message;
    await updatePost(id, { archive_status: "failed", archive_error: msg });
    return { ok: false, status: "failed", error: msg };
  }
  if (!mediaUrl) {
    const msg = "Upstream returned no video URL — post may have been deleted.";
    await updatePost(id, { archive_status: "failed", archive_error: msg });
    return { ok: false, status: "failed", error: msg };
  }

  // 2. Download the CDN bytes (Chrome UA + platform Referer; one retry).
  let bytes: ArrayBuffer | null = null;
  let contentType = "video/mp4";
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(mediaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
          Referer: post.platform === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/",
        },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`CDN ${r.status}`);
      contentType = r.headers.get("content-type") ?? "video/mp4";
      bytes = await r.arrayBuffer();
      break;
    } catch (e) {
      const err = e as Error & { cause?: unknown };
      const causeMsg = err.cause && typeof err.cause === "object" && "message" in err.cause ? String((err.cause as { message: unknown }).message) : err.cause ? String(err.cause) : "";
      lastError = causeMsg ? `${err.message} (${causeMsg})` : err.message;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  if (!bytes) {
    const msg = `Fetch failed: ${lastError ?? "unknown"}`;
    await updatePost(id, { archive_status: "failed", archive_error: msg });
    return { ok: false, status: "failed", error: msg };
  }

  // 3. Upload to the public `top-videos` bucket (keyed by post id, upsert).
  const objectPath = `posts/${id}.mp4`;
  const up = await fetch(`${SUPA()}/storage/v1/object/top-videos/${objectPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SVC()}`, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "public, max-age=31536000, immutable" },
    body: bytes,
  });
  if (!up.ok) {
    const msg = `Storage upload failed: ${up.status} ${(await up.text()).slice(0, 120)}`;
    await updatePost(id, { archive_status: "failed", archive_error: msg });
    return { ok: false, status: "failed", error: msg };
  }
  const publicUrl = `${SUPA()}/storage/v1/object/public/top-videos/${objectPath}`;

  // 4. Mark archived + backfill any fresher metadata from SC.
  const patch: Record<string, unknown> = { archive_status: "archived", archive_video_url: publicUrl, archived_at: new Date().toISOString(), archive_error: null };
  if (meta.caption && meta.caption.length > 0) patch.caption = meta.caption;
  if (meta.view_count && meta.view_count > 0) patch.view_count = meta.view_count;
  if (meta.like_count !== undefined) patch.like_count = meta.like_count;
  if (meta.comment_count !== undefined) patch.comment_count = meta.comment_count;
  if (meta.thumbnail_url) patch.thumbnail_url = meta.thumbnail_url;
  if (meta.posted_at) patch.posted_at = meta.posted_at;
  await updatePost(id, patch);

  return { ok: true, status: "archived", url: publicUrl };
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const body = await req.json();
    const { action, id, value } = body;

    // Add an outlier by pasting a URL (id not required for this one).
    if (action === "add_manual") {
      return NextResponse.json(await addManualOutlier(body));
    }

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (action === "archive") {
      const r = await runArchive(String(id));
      return NextResponse.json(r);
    }

    if (action === "publish") {
      const want = !!value;
      if (want) {
        const post = await fetchPostForArchive(String(id));
        if (!post || (post.archive_status !== "archived" && post.archive_status !== "skipped_yt")) {
          return NextResponse.json({ ok: false, published: false, error: "Archive must finish before publishing." }, { status: 400 });
        }
      }
      await updatePost(String(id), { published_to_top: want });
      return NextResponse.json({ ok: true, published: want });
    }

    if (action === "delete_archive") {
      await fetch(`${SUPA()}/storage/v1/object/top-videos/posts/${id}.mp4`, { method: "DELETE", headers: { Authorization: `Bearer ${SVC()}` } }).catch(() => {});
      await updatePost(String(id), { archive_status: null, archive_video_url: null, archived_at: null, archive_error: null, published_to_top: false });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Outliers action error:", err);
    return NextResponse.json({ error: "Action failed", details: String(err) }, { status: 500 });
  }
}
