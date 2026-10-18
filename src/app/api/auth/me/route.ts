import { NextRequest, NextResponse } from "next/server";
import { getSession, applySessionCookie, clearSessionCookie, backendBaseFor, getBackendToken } from "@/lib/auth";

/**
 * Who am I — and what may I do *right now*.
 *
 * Permissions don't travel inside the backend JWT; they come back only in the
 * login response, so we cache them in our own cookie. That cache is the catch:
 * a permission granted after you signed in stays invisible until you sign in
 * again, which is exactly how a freshly created key leaves its section hidden
 * with no clue why.
 *
 * So this re-reads them from the backend. It reads with the SERVER's own
 * credential rather than the caller's token, because `/admin/admins/:id`
 * needs `admins:read` and almost nobody who needs this refresh has it: an
 * operator granted a new section holds keys for their own work and nothing
 * else, so their own token 403s and they keep the stale list. A newly granted
 * page would otherwise stay invisible with no clue why. The read is scoped to the caller's own
 * admin id, and their permissions are already theirs to know.
 *
 * It also means a deactivated or deleted account now ends on the next
 * heartbeat for everyone, not just for admins who could read themselves.
 *
 * A 404 means the admin was deleted — that ends the session on the next
 * heartbeat rather than letting a removed account linger for 24 hours.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  // Shared-password session: nothing to re-read from the backend.
  if (session.local) {
    const admin = { id: session.adminId, email: session.email, isSuperAdmin: false, permissions: session.permissions };
    const res = NextResponse.json({ authenticated: true, admin, backendToken: null });
    applySessionCookie(res, { t: "", l: true, a: admin });
    return res;
  }

  let permissions = session.permissions;
  let isSuperAdmin = session.isSuperAdmin;
  let email = session.email;

  try {
    const host = req.headers.get("host") || "";
    const base = backendBaseFor(host);
    // Falls back to the caller's own token if the master credential is not
    // configured, which is the old behaviour rather than no refresh at all.
    const master = await getBackendToken(host);
    const r = await fetch(`${base}/admin/admins/${session.adminId}`, {
      headers: { Authorization: `Bearer ${master ?? session.backendToken}` },
      cache: "no-store",
    });
    if (r.status === 404) {
      const gone = NextResponse.json({ authenticated: false }, { status: 401 });
      clearSessionCookie(gone);
      return gone;
    }
    if (r.ok) {
      const body = await r.json();
      const fresh = body?.data ?? body;
      // A deactivated admin can't sign in, so they shouldn't stay signed in.
      if (fresh && fresh.isActive === false) {
        const off = NextResponse.json({ authenticated: false }, { status: 401 });
        clearSessionCookie(off);
        return off;
      }
      if (Array.isArray(fresh?.permissions)) {
        permissions = fresh.permissions;
        isSuperAdmin = !!fresh.isSuperAdmin;
        email = fresh.email ?? email;
      }
    }
    // Still 403 (no master credential, own token lacks admins:read): keep the
    // cached list rather than logging someone out over it.
  } catch {
    // Backend unreachable — keep the cached list rather than logging them out.
  }

  const admin = { id: session.adminId, email, isSuperAdmin, permissions };
  const res = NextResponse.json({ authenticated: true, admin, backendToken: session.backendToken });
  applySessionCookie(res, { t: session.backendToken, a: admin });
  return res;
}
