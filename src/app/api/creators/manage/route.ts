import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createCreator, updateCreator, setCreatorStatus, deleteCreator, detachChild } from "@/lib/creatorsAdmin";

/**
 * Creator CRUD — POST { action, ... }. action ∈
 * create | update | archive | unarchive | delete | detach.
 * Gated by `creators`. Auto-pull on create is triggered client-side.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "creators");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const body = await req.json();
    const { action, id } = body;
    switch (action) {
      case "create": return NextResponse.json(await createCreator(body));
      case "update": return NextResponse.json(await updateCreator(body));
      case "archive": return NextResponse.json(await setCreatorStatus(String(id), "archived"));
      case "unarchive": return NextResponse.json(await setCreatorStatus(String(id), "active"));
      case "delete": return NextResponse.json(await deleteCreator(String(id), !!body.force));
      case "detach": return NextResponse.json(await detachChild(String(id)));
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("Creator manage error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
