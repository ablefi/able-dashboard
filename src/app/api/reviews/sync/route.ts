import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { appState, appStateSet } from "@/lib/supabaseRest";

/**
 * Ask for an App Store review sync.
 *
 * This route does NOT talk to App Store Connect. The ASC private key can post
 * replies that appear publicly under the app, so it deliberately never reaches
 * Vercel's environment — the same split that keeps this dashboard unable to
 * publish anything to the App Store on its own.
 *
 * So a Refresh here just records a request. The worker on the owner's computer
 * (`scripts/asc-review-sync.py`) polls every 30s, does the privileged fetch,
 * and stamps `app_store_review_sync_completed` when it is done. The UI watches
 * for that stamp to move.
 *
 * Consequence worth knowing: if that Mac is asleep, the request simply waits.
 */

const REQ_KEY = "app_store_review_sync_request";
const DONE_KEY = "app_store_review_sync_completed";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "reviews:read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const [requestedAt, completedAt] = await Promise.all([appState(REQ_KEY), appState(DONE_KEY)]);
  const requested = typeof requestedAt === "string" ? requestedAt : null;
  const completed = typeof completedAt === "string" ? completedAt : null;
  return NextResponse.json({ requestedAt: requested, completedAt: completed, pending: !!requested && requested !== completed });
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "reviews:write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const requestedAt = new Date().toISOString();
    await appStateSet(REQ_KEY, requestedAt);
    return NextResponse.json({ ok: true, requestedAt });
  } catch (err) {
    return NextResponse.json({ error: "Failed to request sync", details: String(err) }, { status: 500 });
  }
}
