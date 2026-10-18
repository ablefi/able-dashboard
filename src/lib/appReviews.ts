import "server-only";
import { appState, appStateSet } from "@/lib/supabaseRest";

/**
 * App Store review replies — approval queue.
 *
 * Drafts are generated offline (an AI assistant pulls reviews from the App Store Connect
 * API, writes a proposed reply for each, and seeds them here). This dashboard is
 * purely the approval surface: the owner ticks, crosses, or edits each reply, and the
 * approved set is later posted back to App Store Connect offline.
 *
 * That split is deliberate: the ASC private key (.p8) never has to live in
 * Vercel's environment, and nothing here can post to the public App Store.
 *
 * All state lives in app_state under `app_store_review_replies`.
 */

const STATE_KEY = "app_store_review_replies";

export type ReviewStatus = "pending" | "approved" | "rejected" | "posted" | "failed";

export interface ReviewDraft {
  id: string; // App Store Connect customerReviews id
  rating: number;
  territory: string;
  title: string;
  body: string;
  nickname: string;
  createdDate: string; // YYYY-MM-DD
  draft: string; // the proposed reply, edited in place
  status: ReviewStatus;
  edited?: boolean; // true once the owner changes the wording
  postedAt?: string | null;
  error?: string | null;
}

export interface ReviewsState {
  drafts: ReviewDraft[];
  syncedAt: string | null;
}

const EMPTY: ReviewsState = { drafts: [], syncedAt: null };

export async function getState(): Promise<ReviewsState> {
  const v = (await appState(STATE_KEY)) as ReviewsState | null;
  return v && Array.isArray(v.drafts) ? { ...EMPTY, ...v } : { ...EMPTY };
}

export async function saveState(state: ReviewsState): Promise<void> {
  await appStateSet(STATE_KEY, state);
}

export function counts(drafts: ReviewDraft[]) {
  const by: Record<string, number> = { pending: 0, approved: 0, rejected: 0, posted: 0, failed: 0 };
  for (const d of drafts) by[d.status] = (by[d.status] ?? 0) + 1;
  return { total: drafts.length, ...by };
}

/**
 * Apply a batch of edits in ONE read-modify-write. The UI sends patches in
 * batches (and serialises them) so rapid ticking can't interleave two writes
 * and lose one.
 */
export interface Patch {
  id: string;
  status?: ReviewStatus;
  draft?: string;
}

export async function applyPatches(patches: Patch[]): Promise<ReviewsState> {
  const st = await getState();
  const byId = new Map(st.drafts.map((d) => [d.id, d]));
  for (const p of patches) {
    const d = byId.get(p.id);
    if (!d) continue;
    // Posted replies are done; never let the queue reopen or rewrite them.
    if (d.status === "posted") continue;
    if (typeof p.draft === "string" && p.draft !== d.draft) {
      d.draft = p.draft;
      d.edited = true;
    }
    if (p.status) d.status = p.status;
  }
  await saveState(st);
  return st;
}
