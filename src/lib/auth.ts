import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { authSettings, readSession, signSession, SESSION_TTL, type GoogleIdentity } from "@/lib/google-auth";
import { SECTION_PERMISSIONS } from "@/lib/permissions";
import { BACKEND_PRODUCTION_URL, BACKEND_STAGING_URL, PRODUCTION_DASHBOARD_HOSTS } from "@/lib/brand";

/** Same scoped access as the former local login. No backend admin or super-admin token. */
export const STAFF_PERMISSIONS = [
  "dashboard:read", "creators:read", "creators:write", "social:read", "research:read",
  "compliance:read", "marketing:read", "giving:read",
];
export interface Session { adminId: string; email: string; isSuperAdmin: false; permissions: string[] }

export function cookieOptions() {
  return { httpOnly: true, secure: authSettings().secure, sameSite: "lax" as const, path: "/" };
}
export async function applySessionCookie(res: NextResponse, identity: GoogleIdentity) {
  res.cookies.set(authSettings().sessionCookie, await signSession(identity), { ...cookieOptions(), maxAge: SESSION_TTL });
  res.cookies.set("app_session", "", { ...cookieOptions(), maxAge: 0 });
}
export function clearSessionCookie(res: NextResponse) {
  for (const name of ["__Host-able_session", "able_session", "app_session", "__Host-able_oauth", "able_oauth"]) {
    res.cookies.set(name, "", { httpOnly: true, secure: name.startsWith("__Host-") || process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  }
}
export async function sessionFromCookie(token?: string): Promise<Session | null> {
  const identity = await readSession(token);
  return identity ? { adminId: `google:${identity.sub}`, email: identity.email, isSuperAdmin: false, permissions: [...STAFF_PERMISSIONS] } : null;
}
export async function getSession(req: NextRequest): Promise<Session | null> {
  try { return await sessionFromCookie(req.cookies.get(authSettings().sessionCookie)?.value); }
  catch { return null; }
}
/** SameSite alone does not prevent writes from another able.finance subdomain. */
export function sameOrigin(req: NextRequest): boolean {
  try { return req.headers.get("origin") === authSettings().origin; }
  catch { return false; }
}
/** The boundary for all data routes, including Supabase and the Able API proxies. */
export async function requireSession(req: NextRequest, need?: string): Promise<
  { ok: true; session: Session } | { ok: false; status: number; error: string }
> {
  const session = await getSession(req);
  if (!session) return { ok: false, status: 401, error: "Not signed in" };
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) return { ok: false, status: 403, error: "Invalid request origin" };
  const keys = need ? SECTION_PERMISSIONS[need] ?? [need] : [];
  if (need && !keys.some((k) => session.permissions.includes(k))) return { ok: false, status: 403, error: "Permission denied" };
  return { ok: true, session };
}

// Environment selection for the legacy geo route; never used for authentication.
export const BACKEND_BASES = { staging: BACKEND_STAGING_URL, production: BACKEND_PRODUCTION_URL } as const;
export function backendBaseFor(host: string): string {
  const override = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (override && override !== "undefined" && override !== "null") return override.replace(/\/+$/, "");
  return PRODUCTION_DASHBOARD_HOSTS.includes(host) ? BACKEND_BASES.production : BACKEND_BASES.staging;
}
