import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchCompetitorRows, insertCompetitor, deleteCompetitorRow } from "@/lib/supabaseRest";

/** Competitors CRUD (admin-guarded; same `competitors` Supabase table as localhost). */

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json(await fetchCompetitorRows());
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch competitors", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const { name, app_store_id, instagram_handle, tiktok_handle, youtube_handle, website, notes } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const data = await insertCompetitor({
      name: name.trim(),
      app_store_id: app_store_id || null,
      instagram_handle: instagram_handle || null,
      tiktok_handle: tiktok_handle || null,
      youtube_handle: youtube_handle || null,
      website: website || null,
      notes: notes || null,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to add competitor", details: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteCompetitorRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete competitor", details: String(err) }, { status: 500 });
  }
}
