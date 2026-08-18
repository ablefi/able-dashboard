import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchPostThumbnail } from "@/lib/supabaseRest";

/**
 * Instagram thumbnail proxy — ported from jp-creators' /api/thumb/[id].
 * IG CDN URLs are blocked by tracker blockers and expire in ~24h, so we
 * fetch them server-side and serve from our own domain, edge-cached.
 * TikTok/YouTube thumbs are served direct by the client (no proxy needed).
 */
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { id } = await ctx.params;
    const upstream = await fetchPostThumbnail(id);
    if (!upstream) return new NextResponse(null, { status: 404 });

    const res = await fetch(upstream, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      cache: "no-store",
    });
    if (!res.ok) return new NextResponse(null, { status: 502 });

    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        // Edge-cache for a day — IG URLs rot, but the bytes we grabbed don't.
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
