import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchPageViews } from "@/lib/supabaseRest";

/** Website analytics — slim page_views rows for a time range; the page
 * aggregates client-side (incl. the marketing-only toggle). Admin-guarded. */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "social");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const now = Date.now();
    const since =
      range === "24h" ? new Date(now - 24 * 3600_000).toISOString()
      : range === "7d" ? new Date(now - 7 * 24 * 3600_000).toISOString()
      : range === "30d" ? new Date(now - 30 * 24 * 3600_000).toISOString()
      : null;

    const views = await fetchPageViews(since);
    return NextResponse.json({ views });
  } catch (err) {
    console.error("Website analytics error:", err);
    return NextResponse.json({ error: "Failed to load page views", details: String(err) }, { status: 500 });
  }
}
