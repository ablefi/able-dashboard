import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

export const WORKSPACE_DOMAIN = "able.finance";
export const SESSION_TTL = 8 * 60 * 60;
export const FLOW_TTL = 10 * 60;
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Required on every deployment. An unset value never enables a fallback login. */
export function authSettings() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const rawUrl = process.env.DASHBOARD_URL;
  if (!clientId || !clientSecret || !secret || Buffer.byteLength(secret) < 32 || !rawUrl) throw new Error("Google sign-in is not configured");
  const url = new URL(rawUrl);
  const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && url.hostname === "localhost";
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("DASHBOARD_URL must be an HTTPS origin (HTTP localhost is allowed in development)");
  }
  return {
    clientId, clientSecret, key: new TextEncoder().encode(secret), origin: url.origin,
    redirectUri: `${url.origin}/api/auth/google/callback`, secure: !local,
    sessionCookie: local ? "able_session" : "__Host-able_session",
    flowCookie: local ? "able_oauth" : "__Host-able_oauth",
  };
}

export interface GoogleIdentity { sub: string; email: string; hd: string }

/** The email suffix alone does not establish Google Workspace membership. */
export function allowedIdentity(identity: GoogleIdentity): boolean {
  if (!identity.sub || identity.hd !== WORKSPACE_DOMAIN || !/^[^@\s]+@able\.finance$/i.test(identity.email)) return false;
  const allowlist = (process.env.DASHBOARD_ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(identity.email.toLowerCase());
}

/** Verify signature, issuer, audience, lifetime, browser nonce and Workspace membership. */
export async function verifyGoogleIdentity(idToken: string, nonce: string, keys: JWTVerifyGetKey = GOOGLE_KEYS): Promise<GoogleIdentity> {
  const { clientId } = authSettings();
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId,
    requiredClaims: ["sub", "iat", "exp", "email", "email_verified", "hd", "nonce"], maxTokenAge: "2h",
  });
  if (payload.nonce !== nonce || payload.email_verified !== true ||
      (payload.azp !== undefined && payload.azp !== clientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) ||
      typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.hd !== "string") throw new Error("Invalid Google identity");
  const identity = { sub: payload.sub, email: payload.email.toLowerCase(), hd: payload.hd };
  if (!allowedIdentity(identity)) throw new Error("Account not allowed");
  return identity;
}

async function sign(payload: Record<string, unknown>, type: string, ttl: number) {
  const cfg = authSettings();
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: type })
    .setIssuer(cfg.origin).setAudience(cfg.clientId).setIssuedAt().setExpirationTime(`${ttl}s`).sign(cfg.key);
}

async function verify(token: string, type: string, ttl: number) {
  const cfg = authSettings();
  return (await jwtVerify(token, cfg.key, {
    algorithms: ["HS256"], typ: type, issuer: cfg.origin, audience: cfg.clientId,
    requiredClaims: ["iat", "exp"], maxTokenAge: ttl,
  })).payload;
}

/** Only called after a verified Google exchange. No Google/API credentials enter the cookie. */
export async function signSession(identity: GoogleIdentity): Promise<string> {
  if (!allowedIdentity(identity)) throw new Error("Account not allowed");
  return sign({ ...identity }, "able-session-v2", SESSION_TTL);
}

export async function readSession(token?: string): Promise<GoogleIdentity | null> {
  if (!token) return null;
  try {
    const p = await verify(token, "able-session-v2", SESSION_TTL);
    if (typeof p.sub !== "string" || typeof p.email !== "string" || typeof p.hd !== "string") return null;
    const identity = { sub: p.sub, email: p.email, hd: p.hd };
    return allowedIdentity(identity) ? identity : null;
  } catch { return null; }
}

export async function beginGoogleLogin() {
  const cfg = authSettings();
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const cookie = await sign({ state, nonce, verifier }, "able-oauth-v1", FLOW_TTL);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: "openid email",
    state, nonce, hd: WORKSPACE_DOMAIN, prompt: "select_account", access_type: "online",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie };
}

export async function readLoginFlow(cookie: string | undefined, state: string | null) {
  if (!cookie || !state) throw new Error("Missing login state");
  const p = await verify(cookie, "able-oauth-v1", FLOW_TTL);
  if (p.state !== state || typeof p.nonce !== "string" || typeof p.verifier !== "string") throw new Error("Invalid login state");
  return { nonce: p.nonce, verifier: p.verifier };
}

export async function exchangeGoogleCode(code: string, verifier: string): Promise<string> {
  const cfg = authSettings();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store",
    body: new URLSearchParams({
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code", code_verifier: verifier,
    }), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google exchange failed");
  const result = await response.json();
  if (typeof result.id_token !== "string") throw new Error("Missing Google identity token");
  return result.id_token;
}
