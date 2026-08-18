import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/auth";
import { ALL_SECTION_KEYS } from "@/lib/sections";

/**
 * Hands the browser a backend token for the pages that call Able's backend
 * directly. There is no login on this dashboard, so this route is open; it
 * mints the token server-side from the service credential so those credentials
 * never reach the client. Returns backendToken: null until BACKEND_BASE_URL and
 * the admin credentials are configured.
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const backendToken = await getBackendToken(host);
  return NextResponse.json({
    authenticated: true,
    username: "able",
    role: "owner",
    isOwner: true,
    sections: ALL_SECTION_KEYS,
    backendToken,
  });
}
