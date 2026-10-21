import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  const headers = { "Cache-Control": "no-store" };
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401, headers });
  // Fixed expiry: a heartbeat never prolongs Workspace access indefinitely.
  return NextResponse.json({ authenticated: true, admin: {
    id: session.adminId, email: session.email, isSuperAdmin: false, permissions: session.permissions,
  }, backendToken: null }, { headers });
}
