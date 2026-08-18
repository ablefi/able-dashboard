import { NextRequest, NextResponse } from "next/server";
import { refreshAllCreators } from "@/lib/scrape";

/**
 * Auto-refresh cron — fired every 8h by Vercel (see vercel.json). Pulls the
 * last 30 days of posts for every active leaf creator. Ported from
 * jp-creators; this is what keeps the dashboard's creator data fresh once
 * jp-creators' own cron is switched off.
 *
 * Auth: Vercel Cron sends `x-vercel-cron: 1`; we also accept a CRON_SECRET
 * bearer for manual/curl runs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!isVercelCron && (!expected || auth !== `Bearer ${expected}`)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await refreshAllCreators(30);
  return NextResponse.json(result);
}
