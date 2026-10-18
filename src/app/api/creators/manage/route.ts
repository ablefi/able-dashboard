import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { requireCreatorsSession, assertCreatorInMarket, marketErrorStatus, marketPermission } from "@/lib/creatorMarket";
import { createCreator, updateCreator, setCreatorStatus, deleteCreator, detachChild } from "@/lib/creatorsAdmin";

/**
 * Creator CRUD — POST { action, ... }. action ∈
 * create | update | archive | unarchive | delete | detach.
 * Gated by `creators`. Auto-pull on create is triggered client-side.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireCreatorsSession(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const market = guard.market;
  try {
    const body = await req.json();
    const { action, id } = body;
    // Everything except create acts on an existing creator of this section.
    if (action !== "create") await assertCreatorInMarket(String(id), market);
    // Moving a creator to the other section needs access to both.
    if (action === "update" && (body.market === "alt" || body.market === "en") && body.market !== market) {
      const other = await requireSession(req, marketPermission(body.market));
      if (!other.ok) return NextResponse.json({ error: "You need access to both creator sections to move a creator." }, { status: 403 });
    }
    switch (action) {
      case "create": return NextResponse.json(await createCreator({ ...body, market }));
      case "update": return NextResponse.json(await updateCreator(body));
      case "archive": return NextResponse.json(await setCreatorStatus(String(id), "archived"));
      case "unarchive": return NextResponse.json(await setCreatorStatus(String(id), "active"));
      case "delete": return NextResponse.json(await deleteCreator(String(id), !!body.force));
      case "detach": return NextResponse.json(await detachChild(String(id)));
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const status = marketErrorStatus(err);
    if (status) return NextResponse.json({ ok: false, error: String((err as Error).message) }, { status });
    console.error("Creator manage error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
