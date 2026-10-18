import { NextRequest, NextResponse } from "next/server";
import { refreshAllCreators, autoApproveYouTubeDescriptions } from "@/lib/scrape";

/**
 * Auto-refresh cron — fired every 8h by Vercel (see vercel.json). Pulls the
 * last 30 days of posts for every active leaf creator. Ported from
 * roster; this is what keeps the dashboard's creator data fresh once
 * roster' own cron is switched off.
 *
 * Auth: CRON_SECRET bearer only.
 *
 * This used to ALSO accept an `x-vercel-cron: 1` header as proof the caller was
 * Vercel's scheduler. That header is just a header — anyone can send it — so it
 * was an open door to a cron route. Vercel's scheduler
 * already sends `Authorization: Bearer $CRON_SECRET` when the variable is set,
 * which it is, so dropping the header check costs nothing.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  /**
   * `?step=youtube` runs the description pass on its own.
   *
   * The full refresh re-scrapes every creator and spends ScrapeCreators
   * credits; the description pass costs nothing now. Being able to run just
   * the cheap half means a backlog can be cleared, or a fix verified, without
   * paying for a scrape nobody asked for.
   */
  const youtubeOnly = req.nextUrl.searchParams.get("step") === "youtube";
  const result = youtubeOnly
    ? { ok: true, skipped: "refresh (step=youtube)" }
    : await refreshAllCreators(30);
  // YouTubers put the plug in the description, which the feed endpoints do not
  // return, so those videos never auto-approve on caption alone and pile up in
  // the manual queue. Runs after ingest so this pass sees the new videos, and
  // never blocks the refresh: a failure here must not lose a run of snapshots.
  const youtube = await autoApproveYouTubeDescriptions(30).catch((e) => ({
    ok: false, candidates: 0, checked: 0, approved: 0, failures: 0, error: String(e),
  }));
  return NextResponse.json({ ...result, youtube });
}
