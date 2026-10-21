import { NextRequest, NextResponse } from "next/server";
import { authSettings, exchangeGoogleCode, readLoginFlow, verifyGoogleIdentity } from "@/lib/google-auth";
import { applySessionCookie, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  let cfg: ReturnType<typeof authSettings>;
  try { cfg = authSettings(); }
  catch { return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  let res: NextResponse;
  try {
    const params = req.nextUrl.searchParams;
    const flow = await readLoginFlow(req.cookies.get(cfg.flowCookie)?.value, params.get("state"));
    const code = params.get("code");
    if (params.has("error") || !code) throw new Error("Google sign-in cancelled");
    const token = await exchangeGoogleCode(code, flow.verifier);
    const identity = await verifyGoogleIdentity(token, flow.nonce);
    res = NextResponse.redirect(new URL("/", cfg.origin), 303);
    await applySessionCookie(res, identity);
  } catch {
    // Never reflect provider errors, codes, tokens or caller-supplied return URLs.
    res = NextResponse.redirect(new URL("/login?error=google", cfg.origin), 303);
  }
  res.cookies.set(cfg.flowCookie, "", { ...cookieOptions(), maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
