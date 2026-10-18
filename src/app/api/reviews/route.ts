import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getState, applyPatches, counts, type Patch, type ReviewStatus } from "@/lib/appReviews";

/**
 * App Store review reply queue.
 *
 * GET  → drafts (optionally filtered by status/rating) + counts.
 * POST { patches: [{ id, status?, draft? }] } → apply a batch of ticks/edits.
 *
 * Read/write only against app_state. Nothing here talks to Apple; posting the
 * approved replies happens offline. Gated by `users`.
 */
export const dynamic = "force-dynamic";

const STATUSES: ReviewStatus[] = ["pending", "approved", "rejected", "posted", "failed"];

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "reviews:read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || "pending";
  const rating = sp.get("rating") || "all";
  const limit = Math.max(1, Math.min(200, Number(sp.get("limit")) || 25));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const st = await getState();
  let rows = st.drafts;
  if (status !== "all") rows = rows.filter((d) => d.status === status);
  if (rating !== "all") rows = rows.filter((d) => String(d.rating) === rating);
  // Worst ratings first, then oldest — the ones worth the owner's attention lead.
  rows = [...rows].sort((a, b) => a.rating - b.rating || a.createdDate.localeCompare(b.createdDate));

  return NextResponse.json({
    counts: counts(st.drafts),
    syncedAt: st.syncedAt,
    matched: rows.length,
    offset,
    limit,
    drafts: rows.slice(offset, offset + limit),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "reviews:write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const body = await req.json();
    const raw = Array.isArray(body?.patches) ? body.patches : [];
    if (raw.length === 0) return NextResponse.json({ error: "No patches" }, { status: 400 });
    if (raw.length > 1000) return NextResponse.json({ error: "Too many patches" }, { status: 400 });

    const patches: Patch[] = [];
    for (const p of raw) {
      const id = String(p?.id || "");
      if (!id) continue;
      const patch: Patch = { id };
      if (p.status) {
        if (!STATUSES.includes(p.status)) return NextResponse.json({ error: `Bad status: ${p.status}` }, { status: 400 });
        // The UI may only move things through the human part of the flow.
        if (p.status === "posted" || p.status === "failed") {
          return NextResponse.json({ error: "posted/failed are set when replies are sent, not here" }, { status: 400 });
        }
        patch.status = p.status;
      }
      if (typeof p.draft === "string") {
        if (p.draft.length > 5900) return NextResponse.json({ error: "Reply too long (Apple caps ~5,970)" }, { status: 400 });
        patch.draft = p.draft;
      }
      patches.push(patch);
    }

    const st = await applyPatches(patches);
    return NextResponse.json({ ok: true, applied: patches.length, counts: counts(st.drafts) });
  } catch (err) {
    console.error("Reviews queue error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Request failed" }, { status: 500 });
  }
}
