import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ABLE_PHONE_SEARCH, ABLE_READS, ableFetch } from "@/lib/ableApi";

/**
 * Proxy to Able's API report routes: `/api/able?path=/stats`.
 *
 * The session check is the boundary here (the API only sees our server's
 * token), so each path is gated on its section's permission.
 */

export const maxDuration = 60;

function reply(r: { status: number; body: string }, noStore = false) {
  return new NextResponse(r.body, {
    status: r.status,
    headers: { "Content-Type": "application/json", ...(noStore ? { "Cache-Control": "no-store" } : {}) },
  });
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "";
  const section = ABLE_READS[path];
  if (!section) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guard = await requireSession(req, section);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  return reply(await ableFetch(path));
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "";
  if (path !== ABLE_PHONE_SEARCH) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guard = await requireSession(req, "marketing");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = (await req.json().catch(() => null)) as { phone?: unknown } | null;
  if (!body || typeof body.phone !== "string" || !body.phone.trim() || body.phone.length > 32) {
    return NextResponse.json({ error: "Enter a complete phone number" }, { status: 400 });
  }
  return reply(await ableFetch(path, { method: "POST", body: JSON.stringify({ phone: body.phone }) }), true);
}
