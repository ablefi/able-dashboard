import "server-only";
import { appState, appStateSet } from "@/lib/supabaseRest";
import { backendBaseFor, getBackendToken, BACKEND_BASES } from "@/lib/auth";
import { computeAttribution, ATTRIBUTION_KEY_PROD, ATTRIBUTION_KEY_STAGING, type AttributionPayload } from "@/lib/attributionJob";
import { readReview } from "./attributionReviewStore";
import { applyReview, rollupPersonaAttribution } from "./attributionReview";
import type { CreatorRow } from "@/lib/attribution";

/**
 * Reading and refreshing the stored creator-attribution payload.
 *
 * Kept separate from attributionJob.ts so that file stays a plain function
 * with no Next.js or session dependency and can be exercised directly. This is
 * the half that touches auth, Supabase and `server-only`.
 */

/**
 * Namespaced per environment, because staging and production share ONE
 * Supabase. The globe tally learned this the hard way: an un-namespaced key
 * let a crawl of staging's dozen users overwrite production's figures.
 */
function keyFor(host: string): string {
  return backendBaseFor(host) === BACKEND_BASES.production ? ATTRIBUTION_KEY_PROD : ATTRIBUTION_KEY_STAGING;
}

const SUPA = () => process.env.SUPABASE_URL!;
const SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function fetchAttributionCreators(): Promise<CreatorRow[]> {
  const cols = "id,name,type,instagram_handle,tiktok_handle,youtube_handle,attribution_names,parent_id";
  const r = await fetch(`${SUPA()}/rest/v1/creators?select=${cols}`, {
    headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Could not load creators");
  return (await r.json()) as CreatorRow[];
}

export async function readAttribution(host: string): Promise<AttributionPayload | null> {
  const payload = (await appState(keyFor(host))) as AttributionPayload | null;
  if (!payload) return null;
  const [review, roster] = await Promise.all([readReview(host), fetchAttributionCreators()]);
  return rollupPersonaAttribution(applyReview(payload, review), roster);
}

/** Recompute from the backend and store. Returns the payload it wrote. */
export async function refreshAttribution(host: string): Promise<AttributionPayload | { error: string }> {
  const base = backendBaseFor(host);
  const token = await getBackendToken(host);
  if (!token) return { error: "No backend token" };

  const creators = await fetchAttributionCreators();
  if (!creators.length) return { error: "No creators" };

  const review = await readReview(host);
  const result = await computeAttribution({ base, token, creators, decisions: review.answers });
  if ("error" in result) return result;

  if ((await readReview(host)).revision !== review.revision) {
    return { error: "Attribution decisions changed during the refresh. The previous snapshot was kept; please run the scan again." };
  }
  await appStateSet(keyFor(host), result);
  return result;
}
