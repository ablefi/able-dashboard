/**
 * Keeping a copy of a post's thumbnail.
 *
 * TikTok and Instagram serve thumbnails from signed CDN URLs that expire. We
 * were storing those URLs verbatim, so every thumbnail on the Outliers page
 * eventually turned into an empty rectangle: all 18 starred posts returned 403,
 * and no User-Agent or Referer brings them back, because the signature is dead
 * rather than the request being refused. The only fix is to hold our own copy.
 *
 * Mirroring happens at archive time, which is the moment we decide a post is
 * worth keeping, and where a fresh thumbnail URL is already in hand from the
 * ScrapeCreators call the archive makes anyway. So this costs no extra API
 * credits.
 *
 * Deliberately NOT done for every scraped post. That is hundreds a day whose
 * thumbnails are only looked at while they are recent and the CDN link still
 * works, and mirroring them all would trade a real storage bill for nothing.
 */

const SUPA = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Headers for a Supabase Storage call.
 *
 * `apikey` is not optional, and its absence is what broke archiving. Since the
 * 1 Sep key rotation the service key is `sb_secret_…` rather than a JWT, and
 * Storage given only `Authorization: Bearer` tries to parse that as a JWT and
 * fails with `{"statusCode":"403","error":"Unauthorized","message":"Invalid
 * Compact JWS"}` behind an HTTP 400. Sending both headers is what every
 * working call in supabaseRest.ts already does.
 */
export function storageHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SVC(), Authorization: `Bearer ${SVC()}`, ...extra };
}

/** Public URL for an object we have uploaded. */
export function publicObjectUrl(bucket: string, path: string): string {
  return `${SUPA()}/storage/v1/object/public/${bucket}/${path}`;
}

/** True for a thumbnail we host, i.e. one that will not expire. */
export function isOwnThumb(url: string | null | undefined): boolean {
  return !!url && !!process.env.SUPABASE_URL && url.startsWith(`${SUPA()}/storage/v1/object/public/`);
}

const EXT: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };

/**
 * Download a thumbnail from its CDN URL and store it as ours.
 *
 * Returns our public URL, or null if anything failed — the caller should then
 * keep whatever it had, since a dead upstream URL is still better than none.
 * `media` is the bucket: `top-videos` rejects images outright, it is configured
 * for video mime types only.
 */
export async function mirrorPostThumbnail(
  postId: string,
  cdnUrl: string | null | undefined,
  platform: string
): Promise<string | null> {
  if (!cdnUrl) return null;
  if (isOwnThumb(cdnUrl)) return cdnUrl; // already mirrored

  try {
    const res = await fetch(cdnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: platform === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;

    const path = `post-thumbs/${postId}.${EXT[contentType] ?? "jpg"}`;
    const up = await fetch(`${SUPA()}/storage/v1/object/media/${path}`, {
      method: "POST",
      body: bytes,
      headers: storageHeaders({
        "Content-Type": contentType,
        "x-upsert": "true",
        "Cache-Control": "public, max-age=31536000, immutable",
      }),
    });
    if (!up.ok) return null;
    return publicObjectUrl("media", path);
  } catch {
    return null;
  }
}
