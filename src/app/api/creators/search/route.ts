import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

/**
 * ScrapeCreators handle search — TikTok user + YouTube channel search in
 * parallel, normalized to { platform, handle, name, followers?, avatarUrl? }.
 * Used by the Add creator/prospect modal to autofill handles. Instagram has
 * no SC user-search endpoint (typed manually). Gated by `creators`.
 */
export const dynamic = "force-dynamic";
const SC_BASE = "https://api.scrapecreators.com";

interface SearchResult { platform: "tiktok" | "youtube"; handle: string; name: string; followers?: number; avatarUrl?: string }

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "API key not configured" }, { status: 500 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  const headers = { "x-api-key": apiKey };
  const [tt, yt] = await Promise.allSettled([
    fetch(`${SC_BASE}/v1/tiktok/search/users?query=${encodeURIComponent(q)}`, { headers, cache: "no-store" }).then((r) => r.json()),
    fetch(`${SC_BASE}/v1/youtube/search?query=${encodeURIComponent(q)}`, { headers, cache: "no-store" }).then((r) => r.json()),
  ]);

  const results: SearchResult[] = [];
  if (tt.status === "fulfilled") {
    for (const u of ((tt.value?.user_list ?? []) as any[]).slice(0, 8)) {
      const info = u.user_info ?? {};
      const handle = String(info.unique_id ?? info.uniqueId ?? "").trim();
      if (!handle) continue;
      results.push({ platform: "tiktok", handle, name: String(info.nickname ?? handle), followers: typeof info.follower_count === "number" ? info.follower_count : undefined, avatarUrl: (info.avatar_thumb ?? info.avatarThumb)?.url_list?.[0] });
    }
  }
  if (yt.status === "fulfilled") {
    for (const c of ((yt.value?.channels ?? []) as any[]).slice(0, 5)) {
      const rawHandle = String(c.handle ?? c.channelHandle ?? "").replace(/^@/, "");
      if (!rawHandle) continue;
      results.push({ platform: "youtube", handle: rawHandle, name: String(c.title ?? c.name ?? rawHandle), followers: typeof c.subscriberCountInt === "number" ? c.subscriberCountInt : undefined, avatarUrl: (c.thumbnail as string | undefined) || (c.avatar as { url?: string } | undefined)?.url });
    }
  }
  return NextResponse.json({ ok: true, results });
}
