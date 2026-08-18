import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const maxDuration = 30;

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return { url: url.replace(/\/$/, ""), key };
}

function hdrs(extra: Record<string, string> = {}) {
  const { key } = cfg();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "all";
  const sort = searchParams.get("sort") || "views";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const { url } = cfg();
  const filters = ["select=*", "order=" + (sort === "views" ? "view_count.desc" : "posted_at.desc"), "limit=200"];
  if (type !== "all") filters.push(`type=eq.${type}`);
  if (from) filters.push(`posted_at=gte.${from}`);
  if (to) filters.push(`posted_at=lte.${to}`);

  const res = await fetch(`${url}/rest/v1/own_posts?${filters.join("&")}`, {
    headers: hdrs({ Prefer: "count=exact" }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Supabase error: ${res.status} ${text}` }, { status: 500 });
  }

  const posts = await res.json();

  // Compute stats from ALL posts (no type filter) for the stat bar
  const allRes = await fetch(`${url}/rest/v1/own_posts?select=type,view_count`, {
    headers: hdrs(),
    cache: "no-store",
  });
  const allPosts: { type: string; view_count: number }[] = allRes.ok ? await allRes.json() : [];

  const stats = {
    total: allPosts.length,
    carousels: allPosts.filter((p) => p.type === "carousel").length,
    reels: allPosts.filter((p) => p.type === "reel").length,
    images: allPosts.filter((p) => p.type === "image").length,
    totalViews: allPosts.reduce((sum, p) => sum + (p.view_count || 0), 0),
  };

  return NextResponse.json({ posts, stats });
}
