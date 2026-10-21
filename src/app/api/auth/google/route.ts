import { NextResponse } from "next/server";
import { authSettings, beginGoogleLogin, FLOW_TTL } from "@/lib/google-auth";
import { cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET() {
  try {
    const flow = await beginGoogleLogin();
    const res = NextResponse.redirect(flow.url, 302);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.cookies.set(authSettings().flowCookie, flow.cookie, { ...cookieOptions(), maxAge: FLOW_TTL });
    return res;
  } catch {
    return NextResponse.json({ error: "Google sign-in is not configured. Contact your dashboard administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
