import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ableFetch, isCreatorWrite } from "@/lib/ableApi";

/**
 * Creator edits on Able's API: `/api/able/write?path=/creators/<id>/refresh`.
 *
 * Exact allowlist (isCreatorWrite), the creators:write permission, and the
 * scoped CREATORS_API_TOKEN. The API validates every body; we only forward a
 * JSON object.
 */

// A full refresh scrapes every creator's feeds through ScrapeCreators.
export const maxDuration = 300;

async function forward(req: NextRequest, method: "POST" | "DELETE") {
  const path = req.nextUrl.searchParams.get("path") || "";
  if (!isCreatorWrite(method, path)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guard = await requireSession(req, "creators:write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: string | undefined;
  if (method === "POST") {
    const raw = await req.text();
    if (raw.length > 20_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    let parsed: unknown = {};
    try {
      if (raw) parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
    }
    body = JSON.stringify(parsed);
  }

  const r = await ableFetch(path, { method, body, creatorsWrite: true, timeoutMs: 280_000 });
  return new NextResponse(r.body, {
    status: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  return forward(req, "POST");
}

export async function DELETE(req: NextRequest) {
  return forward(req, "DELETE");
}
