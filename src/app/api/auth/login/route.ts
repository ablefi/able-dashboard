import { NextRequest, NextResponse } from "next/server";
import { applySessionCookie, backendBaseFor, checkDashboardPassword, LOCAL_PERMISSIONS, passwordLoginEnabled } from "@/lib/auth";

/**
 * Dashboard login — email + password, checked by the BACKEND.
 *
 * This is the change that makes the dashboard's permissions mean anything.
 * Previously an operator authenticated against our own user store and the
 * server then handed them a token minted from one shared admin
 * credential, so the backend could not tell operators apart and every one of
 * them held full super-admin. Now the operator's own credentials go to
 * `POST /admin/login`, and the token they get back is scoped to their own
 * permissions, which the backend enforces.
 *
 * The credentials are forwarded, never stored. We keep the resulting token in
 * an httpOnly cookie for our own server routes, and also return it so the
 * browser can call the backend directly, as the brief specifies.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Shared-password mode (see LOCAL_PERMISSIONS): never forwards to the backend.
    if (passwordLoginEnabled()) {
      const who = String(email).trim().toLowerCase();
      if (!checkDashboardPassword(who, String(password))) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      const admin = { id: `local:${who}`, email: who, isSuperAdmin: false, permissions: LOCAL_PERMISSIONS };
      const out = NextResponse.json({ ok: true, admin, backendToken: null });
      applySessionCookie(out, { t: "", l: true, a: admin });
      return out;
    }

    const base = backendBaseFor(req.headers.get("host") || "");
    let res: Response;
    try {
      res = await fetch(`${base}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(email).trim(), password }),
        cache: "no-store",
      });
    } catch {
      return NextResponse.json({ error: "Couldn't reach the backend. Try again." }, { status: 502 });
    }

    if (!res.ok) {
      // 401 covers both wrong credentials and a deactivated admin; the backend
      // deliberately does not distinguish, and neither should we.
      const status = res.status === 401 ? 401 : res.status;
      return NextResponse.json({ error: "Invalid email or password" }, { status });
    }

    const data = (await res.json()) as {
      access_token?: string;
      admin?: { id: string; email: string; isSuperAdmin?: boolean; permissions?: string[] };
    };

    if (!data.access_token || !data.admin?.id) {
      return NextResponse.json({ error: "The backend returned an unexpected login response" }, { status: 502 });
    }

    /**
     * A backend without the permissions system returns an admin with no
     * `permissions` array. Signing in then would look successful and leave
     * every section hidden, which reads as the dashboard being broken. Say so
     * plainly instead — this is what production looks like until the admin
     * work is deployed there.
     */
    if (!Array.isArray(data.admin.permissions)) {
      return NextResponse.json(
        { error: "This backend doesn't have the admin permissions system yet, so there's nothing to sign in to." },
        { status: 503 }
      );
    }

    const admin = {
      id: data.admin.id,
      email: data.admin.email,
      isSuperAdmin: !!data.admin.isSuperAdmin,
      permissions: data.admin.permissions,
    };

    const out = NextResponse.json({ ok: true, admin, backendToken: data.access_token });
    applySessionCookie(out, { t: data.access_token, a: admin });
    return out;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
