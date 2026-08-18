import { NextRequest } from "next/server";
import type { SectionKey } from "@/lib/sections";

/**
 * No-auth build.
 *
 * The Just Pray original gated every page and API route behind a session
 * cookie and per-user section permissions. This deployment intentionally has
 * no login, so `requireSession` always allows the request through and exists
 * only so the API routes keep their original shape. If access control is ever
 * wanted, the simplest option is Vercel password protection on the project,
 * or reinstating a session check here.
 */

export type Session = { uid: string; username: string; sections: SectionKey[]; isOwner: boolean };

const OPEN_SESSION: Session = { uid: "open", username: "able", sections: [], isOwner: true };

/** Always allows. Signature preserved so route handlers are unchanged. */
export async function requireSession(
  _req: NextRequest,
  _section?: SectionKey
): Promise<{ ok: true; session: Session } | { ok: false; status: number; error: string }> {
  return { ok: true, session: OPEN_SESSION };
}

export async function getSession(_req: NextRequest): Promise<Session | null> {
  return OPEN_SESSION;
}

// ---- backend token (server-side, minted from the master credential) ----
/**
 * Base URL of Able's own backend. Set BACKEND_BASE_URL in the environment.
 * The `host` argument is kept so callers do not change; it is unused now that
 * there is a single environment rather than staging/production pairs.
 */
export function backendBaseFor(_host: string): string {
  return process.env.BACKEND_BASE_URL || "";
}

const tokenCache = new Map<string, { token: string; exp: number }>();

/**
 * Logs into the backend with the service credential and caches the token for
 * ~50 minutes. Returns null when the backend is not configured yet, which is
 * the expected state until Able's backend endpoints are wired up.
 */
export async function getBackendToken(host: string): Promise<string | null> {
  const base = backendBaseFor(host);
  if (!base) return null;
  const cached = tokenCache.get(base);
  if (cached && cached.exp > Date.now()) return cached.token;
  const user = process.env.ADMIN_BACKEND_USER;
  const pass = process.env.ADMIN_BACKEND_PASSWORD;
  if (!user || !pass) return null;
  try {
    const res = await fetch(`${base}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user, password: pass }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data?.accessToken || data?.token || data?.access_token;
    if (!token) return null;
    tokenCache.set(base, { token, exp: Date.now() + 50 * 60 * 1000 });
    return token;
  } catch {
    return null;
  }
}
