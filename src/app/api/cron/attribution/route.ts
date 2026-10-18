import { NextRequest, NextResponse } from "next/server";
import { refreshAttribution } from "@/lib/attributionStore";

/**
 * Recomputes creator attribution every 8h (see vercel.json).
 *
 * Auth: CRON_SECRET bearer only, the same rule as the other crons. The header
 * shortcut is deliberately absent: a header proves nothing.
 *
 * Runs on the host it was called on, so the production cron writes the
 * production key and never touches staging's.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await refreshAttribution(req.headers.get("host") ?? "");
  if ("error" in result) return NextResponse.json({ ok: false, ...result }, { status: 502 });
  return NextResponse.json({ ok: true, totals: result.totals, creators: result.creators.length });
}
