import "server-only";
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { BACKEND_PRODUCTION_URL, BACKEND_STAGING_URL, PRODUCTION_DASHBOARD_HOSTS as PROD_HOST_LIST } from "@/lib/brand";
import { appState, appStateSet } from "@/lib/supabaseRest";
import { roleNeedsBackendToken } from "@/lib/sections";
import { SECTION_PERMISSIONS } from "@/lib/permissions";

/**
 * Dashboard auth — username/password login, roles, and signed sessions.
 *
 * Self-contained: users + roles live in Supabase `app_state` under
 * `dashboard_auth` (no new tables, no backend changes). Passwords are
 * scrypt-hashed. The session is an HS256 JWT in an httpOnly cookie, so it's
 * readable server-side for route guards and never exposed to page scripts.
 *
 * The single master backend credential (ADMIN_BACKEND_USER/PASSWORD) stays
 * server-side; we mint a backend token from it for data calls. The browser
 * only ever receives a backend token for roles that include a backend
 * section (see roleNeedsBackendToken) — Marketing etc. never get one.
 */

export const SESSION_COOKIE = "app_session";
// Sliding idle window: each authenticated request to /api/auth/me re-issues
// the cookie with a fresh 24h expiry (see applySessionCookie). So the session
// stays alive as long as the dashboard is used at least once every 24h; a full
// 24h of inactivity lets it lapse.
const SESSION_TTL_SEC = 60 * 60 * 24; // 24h

// Permissions are now per-user (no role bundles): each user carries their
// own allowed sections. The owner bypasses the list — full access.
export interface DashUser {
  id: string;
  username: string;
  /** The Google account allowed to sign in as this user. Sign-in matches on
   * this and nothing else — there is no domain rule and no self-registration,
   * so an account with no email set simply cannot use Google sign-in. */
  email?: string | null;
  passwordHash: string; // "salt:hash"
  isOwner: boolean;
  sections: string[];
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}
export interface AuthConfig {
  users: DashUser[];
}
/** Resolved live session — permissions are read from the DB per request, so
 * edits/disables take effect on the very next request (not next login). */
/**
 * A signed-in operator.
 *
 * Identity and permissions both come from the BACKEND now — the operator logs
 * in as their own admin account and the backend returns what they may do. The
 * dashboard's old per-user store in `app_state.dashboard_auth` is no longer
 * consulted for authentication.
 *
 * `backendToken` is that admin's own JWT, scoped to their permissions. It
 * replaces the single shared admin token every operator used
 * to be handed regardless of their role.
 */
export interface Session {
  adminId: string;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
  /** The admin's own backend JWT — used for server-side backend calls.
   * Empty for a shared-password session. */
  backendToken: string;
  /** Signed in with DASHBOARD_PASSWORD rather than a backend admin account. */
  local: boolean;
}

/** What we put inside our own signed cookie. */
interface TokenPayload {
  t: string; // backend access_token; empty for a shared-password session
  a: { id: string; email: string; isSuperAdmin: boolean; permissions: string[] };
  /** Shared-password session: no backend token, fixed LOCAL_PERMISSIONS. */
  l?: true;
  exp: number;
}

// ---- shared-password sign-in ----
/**
 * Interim sign-in while the backend has no `/admin/login`.
 *
 * When DASHBOARD_PASSWORD is set, the login form checks it here instead of
 * forwarding to the backend. The session holds no backend token, so it can
 * only reach sections served by our own Supabase routes. Backend sections
 * (users, referral codes, admins) and App Store reviews stay hidden until the
 * backend admin endpoints exist and this variable is removed.
 */
export const LOCAL_PERMISSIONS = [
  "dashboard:read",
  "creators:read",
  "creators:write",
  "social:read",
  "research:read",
];

export function passwordLoginEnabled(): boolean {
  return !!process.env.DASHBOARD_PASSWORD;
}

/** Constant-time check against DASHBOARD_PASSWORD, plus the optional
 * DASHBOARD_ALLOWED_EMAILS allowlist (comma separated). */
export function checkDashboardPassword(email: string, password: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const allowed = (process.env.DASHBOARD_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(email.trim().toLowerCase())) return false;
  // HMAC both sides so the comparison is constant-time and length-independent.
  const a = createHmac("sha256", "dashboard-password").update(password).digest();
  const b = createHmac("sha256", "dashboard-password").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---- password hashing (scrypt, no deps) ----
// Kept only because the legacy dashboard-user Admin Panel still writes a hash.
// Nothing authenticates with it — admin accounts live on the backend now.
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ---- session cookie (HS256 over our own payload) ----
function secret(): string {
  const s = process.env.DASHBOARD_SESSION_SECRET;
  if (!s) throw new Error("DASHBOARD_SESSION_SECRET not set");
  return s;
}

/**
 * Wrap the backend token and admin profile in a cookie we sign.
 *
 * The profile is carried rather than re-fetched because permissions do not
 * travel inside the backend JWT — they come back only in the login response
 * body. The backend re-checks on every call it serves, so a stale copy here
 * can only ever make the UI show too little, never grant too much.
 */
export function signSession(payload: Omit<TokenPayload, "exp">, ttlSec = SESSION_TTL_SEC): string {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function applySessionCookie(res: NextResponse, payload: Omit<TokenPayload, "exp">): void {
  res.cookies.set(SESSION_COOKIE, signSession(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = createHmac("sha256", secret()).update(`${h}.${b}`).digest("base64url");
  if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, "base64url").toString()) as TokenPayload;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    if ((!payload.t && !payload.l) || !payload.a?.id) return null;
    // A shared-password session ends once the password is removed.
    if (payload.l && !passwordLoginEnabled()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Seconds until the backend's own JWT expires, or 0 if it already has. */
export function backendTokenTtl(token: string): number {
  try {
    const b = token.split(".")[1];
    const claims = JSON.parse(Buffer.from(b, "base64url").toString()) as { exp?: number };
    if (!claims.exp) return 0;
    return Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

// ---- legacy dashboard-user store (no longer used for auth) ----
export async function getAuthConfig(): Promise<AuthConfig> {
  const cfg = (await appState("dashboard_auth")) as AuthConfig | null;
  return cfg && Array.isArray(cfg.users) ? cfg : { users: [] };
}
export async function saveAuthConfig(cfg: AuthConfig): Promise<void> {
  await appStateSet("dashboard_auth", cfg);
}
export { roleNeedsBackendToken };

// ---- request helpers ----
/**
 * The current operator, or null.
 *
 * Also rejects a session whose BACKEND token has expired — otherwise the
 * dashboard would look signed in while every backend call 401s.
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const payload = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  if (payload.l) {
    // Permissions come from the code, not the cookie, so narrowing
    // LOCAL_PERMISSIONS applies to sessions already issued.
    return {
      adminId: payload.a.id,
      email: payload.a.email,
      isSuperAdmin: false,
      permissions: LOCAL_PERMISSIONS,
      backendToken: "",
      local: true,
    };
  }
  if (backendTokenTtl(payload.t) <= 0) return null;
  return {
    adminId: payload.a.id,
    email: payload.a.email,
    isSuperAdmin: !!payload.a.isSuperAdmin,
    permissions: payload.a.permissions ?? [],
    backendToken: payload.t,
    local: false,
  };
}

/**
 * Guard for our own /api routes.
 *
 * Takes either a permission key ("users:read") or one of the dashboard's
 * section names, which is mapped to its keys. Section names are accepted so
 * the existing routes did not all have to change at once.
 *
 * For routes backed by OUR Supabase data the backend never sees the request,
 * so this check is the real boundary — not just UI gating.
 */
export async function requireSession(
  req: NextRequest,
  need?: string
): Promise<{ ok: true; session: Session } | { ok: false; status: number; error: string }> {
  const session = await getSession(req);
  if (!session) return { ok: false, status: 401, error: "Not signed in" };
  if (!need) return { ok: true, session };

  const keys = SECTION_PERMISSIONS[need] ?? [need];
  const allowed = keys.some((k) => session.permissions.includes(k));
  if (!allowed) {
    return { ok: false, status: 403, error: `Missing required permission(s): ${keys.join(" or ")}` };
  }
  return { ok: true, session };
}


// ---- backend token (server-side, minted from the master credential) ----
const BACKEND_STAGING = BACKEND_STAGING_URL;
const BACKEND_PRODUCTION = BACKEND_PRODUCTION_URL;

/** The two backends by name, for callers that must be explicit about which
 * one they mean rather than inferring it from the request host. */
export const BACKEND_BASES = { staging: BACKEND_STAGING, production: BACKEND_PRODUCTION } as const;

/** Hosts that serve the PRODUCTION dashboard (NEXT_PUBLIC_PRODUCTION_DASHBOARD_HOSTS). */
export const PRODUCTION_DASHBOARD_HOSTS = new Set(PROD_HOST_LIST);
export type BackendEnv = keyof typeof BACKEND_BASES;

/**
 * Which backend does this request belong to?
 *
 * The env var NEXT_PUBLIC_API_BASE_URL wins when set (one per deployment
 * environment). Otherwise the hostname decides: production hosts get the
 * production backend, everything else gets staging.
 */
export function backendBaseFor(host: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv && fromEnv !== "undefined" && fromEnv !== "null") return fromEnv.replace(/\/+$/, "");
  return PRODUCTION_DASHBOARD_HOSTS.has(host) ? BACKEND_PRODUCTION : BACKEND_STAGING;
}

/** Which environment is this dashboard itself running as? */
export function envForHost(host: string): BackendEnv {
  return backendBaseFor(host) === BACKEND_PRODUCTION ? "production" : "staging";
}

const tokenCache = new Map<string, { token: string; exp: number }>();

/**
 * The service credential for ONE backend.
 *
 * This used to be a single ADMIN_BACKEND_USER/PASSWORD pair used against both
 * backends, on the assumption — stated in a comment here until 1 Sep 2026 —
 * that "the same credential is valid on both". That is no longer true, and it
 * should not be: sharing one super-admin password across staging and
 * production meant the credentials printed in staging's PUBLIC Swagger docs
 * also opened production. Staging's password was changed, which silently broke
 * campaign promotion, because promotion is the one operation that must sign
 * into both in a single request.
 *
 * So: one credential per environment. The old single-pair variables are still
 * honoured as a fallback, so a deployment that only has those keeps working.
 */
function credentialsFor(base: string): { user?: string; pass?: string } {
  const isProduction = base === BACKEND_PRODUCTION;
  const user =
    (isProduction
      ? process.env.ADMIN_BACKEND_USER_PRODUCTION
      : process.env.ADMIN_BACKEND_USER_STAGING) ?? process.env.ADMIN_BACKEND_USER;
  const pass =
    (isProduction
      ? process.env.ADMIN_BACKEND_PASSWORD_PRODUCTION
      : process.env.ADMIN_BACKEND_PASSWORD_STAGING) ?? process.env.ADMIN_BACKEND_PASSWORD;
  return { user, pass };
}

/** Log into one NestJS backend with that backend's own service credential;
 * cached ~50min. */
async function tokenForBase(base: string): Promise<string | null> {
  const cached = tokenCache.get(base);
  if (cached && cached.exp > Date.now()) return cached.token;
  const { user, pass } = credentialsFor(base);
  if (!user || !pass) return null;
  try {
    const res = await fetch(`${base}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user, password: pass }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = await res.json();
    const token = d.access_token;
    if (!token) return null;
    tokenCache.set(base, { token, exp: Date.now() + 50 * 60 * 1000 });
    return token;
  } catch {
    return null;
  }
}

/** Token for the backend that matches the dashboard's own host. */
export async function getBackendToken(host: string): Promise<string | null> {
  return tokenForBase(backendBaseFor(host));
}

/** Token for a named backend, regardless of which host is being served. */
export async function getBackendTokenForEnv(env: BackendEnv): Promise<string | null> {
  return tokenForBase(BACKEND_BASES[env]);
}
