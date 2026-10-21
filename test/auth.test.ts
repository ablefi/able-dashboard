import assert from "node:assert/strict";
import { before, beforeEach, afterEach, test, mock } from "node:test";
import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey, type JWTPayload } from "jose";
import { NextRequest } from "next/server";
import { authSettings, beginGoogleLogin, readLoginFlow, verifyGoogleIdentity, signSession, readSession, SESSION_TTL } from "../src/lib/google-auth";
import { applySessionCookie, requireSession } from "../src/lib/auth";
import { NextResponse } from "next/server";
import { GET as me } from "../src/app/api/auth/me/route";
import { POST as password } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { GET as start } from "../src/app/api/auth/google/route";
import { GET as callback } from "../src/app/api/auth/google/callback/route";

const origin = "https://dashboard.able.finance";
const identity = { sub: "google-user-123", email: "operator@able.finance", hd: "able.finance" };
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
let jwks: { keys: object[] };
const savedEnv = { ...process.env };
before(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] }); jwks = { keys: [jwk] };
});
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.DASHBOARD_SESSION_SECRET = "test-only-session-secret-at-least-32-characters";
  process.env.DASHBOARD_URL = origin;
  delete process.env.DASHBOARD_ALLOWED_EMAILS;
});
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});
const request = (path: string, token?: string, method = "GET", from?: string) => new NextRequest(origin + path, {
  method, headers: { ...(token ? { cookie: `${authSettings().sessionCookie}=${token}` } : {}), ...(from ? { origin: from } : {}) },
});
async function googleToken(over: JWTPayload = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...identity, email_verified: true, nonce: "browser-nonce", iss: "https://accounts.google.com",
    aud: authSettings().clientId, iat: now, exp: now + 3600, ...over,
  }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(privateKey);
}
async function localToken(over: JWTPayload = {}, typ = "able-session-v2") {
  const now = Math.floor(Date.now() / 1000), cfg = authSettings();
  return new SignJWT({ ...identity, iss: cfg.origin, aud: cfg.clientId, iat: now, exp: now + SESSION_TTL, ...over })
    .setProtectedHeader({ alg: "HS256", typ }).sign(cfg.key);
}

test("only a signed, verified Able Workspace identity is accepted", async () => {
  assert.deepEqual(await verifyGoogleIdentity(await googleToken(), "browser-nonce", keys), identity);
  assert.equal((await verifyGoogleIdentity(await googleToken({ email: "Operator@ABLE.FINANCE" }), "browser-nonce", keys)).email, identity.email);
});

test("reject external, lookalike, unverified and non-Workspace Google accounts", async () => {
  for (const claims of [
    { email: "operator@gmail.com", hd: "gmail.com" }, { email: "operator@able.finance.evil.com" },
    { email: "operator@sub.able.finance" }, { email: "operator@evil.com@able.finance" },
    { email: "operator@able.finance\n" }, { hd: "evil.com" }, { hd: undefined },
    { email_verified: false }, { email_verified: "true" }, { email: undefined }, { sub: "" },
  ]) {
    await assert.rejects(verifyGoogleIdentity(await googleToken(claims), "browser-nonce", keys), JSON.stringify(claims));
  }
});

test("reject wrong signatures, issuer, audience, nonce and missing/expired lifetimes", async () => {
  for (const claims of [
    { iss: "https://evil.com" }, { aud: "other-client" }, { azp: "other-client" },
    { aud: [authSettings().clientId, "other-client"] }, { nonce: "another-browser" },
    { nonce: undefined }, { exp: 1 }, { exp: undefined }, { iat: undefined },
    { iat: Math.floor(Date.now() / 1000) + 600 },
  ]) {
    await assert.rejects(verifyGoogleIdentity(await googleToken(claims), "browser-nonce", keys), JSON.stringify(claims));
  }
  const wrong = await generateKeyPair("RS256");
  const now = Math.floor(Date.now() / 1000);
  const forged = await new SignJWT({ ...identity, email_verified: true, nonce: "browser-nonce", iss: "https://accounts.google.com",
    aud: authSettings().clientId, iat: now, exp: now + 3600,
  }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(wrong.privateKey);
  await assert.rejects(verifyGoogleIdentity(forged, "browser-nonce", keys));
});

test("OAuth flow binds state and nonce to a signed browser cookie and uses PKCE", async () => {
  const flow = await beginGoogleLogin(), url = new URL(flow.url), params = url.searchParams;
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(params.get("redirect_uri"), `${origin}/api/auth/google/callback`);
  assert.equal(params.get("scope"), "openid email");
  assert.equal(params.get("hd"), "able.finance");
  const saved = await readLoginFlow(flow.cookie, params.get("state"));
  assert.equal(saved.nonce, params.get("nonce"));
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("code_challenge"), createHash("sha256").update(saved.verifier).digest("base64url"));
  await assert.rejects(readLoginFlow(undefined, params.get("state")));
  await assert.rejects(readLoginFlow(flow.cookie, "wrong-state"));
  await assert.rejects(readLoginFlow(flow.cookie + "tampered", params.get("state")));
  const expired = await localToken({ ...saved, state: params.get("state"), exp: 1 }, "able-oauth-v1");
  await assert.rejects(readLoginFlow(expired, params.get("state")));
  assert.equal(await readSession(flow.cookie), null, "OAuth cookies are not sessions");
});

test("sessions expire absolutely, reject legacy/tampered cookies and bind to this deployment", async () => {
  const token = await signSession(identity);
  assert.deepEqual(await readSession(token), identity);
  assert.equal(await readSession(token + "bad"), null);
  for (const claims of [{ exp: 1 }, { exp: undefined }, { iat: undefined }, { iss: "https://preview.example.com" },
    { aud: "other-client" }, { email: "outside@gmail.com" }, { hd: undefined },
    { iat: Math.floor(Date.now() / 1000) - SESSION_TTL - 1, exp: Math.floor(Date.now() / 1000) + 3600 },
  ]) assert.equal(await readSession(await localToken(claims)), null);
  const legacy = await localToken({ l: true, t: "", a: { id: "local:operator", email: identity.email } }, "JWT");
  assert.equal(await readSession(legacy), null);
  const r = await me(new NextRequest(origin + "/api/auth/me", { headers: { cookie: `app_session=${legacy}` } }));
  assert.equal(r.status, 401);
});

test("optional allowlist only narrows access and is reapplied to existing sessions", async () => {
  const token = await signSession(identity);
  process.env.DASHBOARD_ALLOWED_EMAILS = " OTHER@able.finance ";
  assert.equal(await readSession(token), null);
  await assert.rejects(verifyGoogleIdentity(await googleToken(), "browser-nonce", keys));
  process.env.DASHBOARD_ALLOWED_EMAILS = " OPERATOR@able.finance, other@able.finance ";
  assert.deepEqual(await readSession(token), identity);
  process.env.DASHBOARD_ALLOWED_EMAILS = "external@gmail.com";
  await assert.rejects(signSession({ ...identity, email: "external@gmail.com" }));
});

test("cookies are host-only, HttpOnly, Secure, SameSite=Lax with a fixed eight-hour lifetime", async () => {
  const response = NextResponse.json({ ok: true });
  await applySessionCookie(response, identity);
  const cookie = response.cookies.get("__Host-able_session");
  assert.ok(cookie?.httpOnly); assert.ok(cookie?.secure); assert.equal(cookie?.sameSite, "lax");
  assert.equal(cookie?.path, "/"); assert.equal(cookie?.domain, undefined); assert.equal(cookie?.maxAge, SESSION_TTL);
  const result = await me(request("/api/auth/me", cookie?.value));
  assert.equal(result.status, 200); assert.equal(result.headers.get("set-cookie"), null, "heartbeat cannot extend expiry");
  const data = await result.json();
  assert.equal(data.backendToken, null); assert.equal(data.admin.isSuperAdmin, false);
  assert.equal(data.admin.id, `google:${identity.sub}`);
});

test("guard enforces authentication, permission checks and exact Origin on writes", async () => {
  assert.equal((await requireSession(request("/api/able"), "dashboard")).ok, false);
  const token = await signSession(identity);
  assert.equal((await requireSession(request("/api/able", token), "dashboard")).ok, true);
  assert.deepEqual(await requireSession(request("/api/able", token), "admins:read"), { ok: false, status: 403, error: "Permission denied" });
  for (const from of [undefined, "https://evil.com", "https://other.able.finance", "null"]) {
    assert.equal((await requireSession(request("/api/able/write", token, "POST", from), "creators:write")).ok, false);
  }
  assert.equal((await requireSession(request("/api/able/write", token, "POST", origin), "creators:write")).ok, true);
});

test("all data routes reject unauthenticated requests without contacting an upstream", async () => {
  const upstream = mock.method(globalThis, "fetch", () => { throw new Error("Must not reach upstream"); });
  const paths = ["able", "able/write", "competitors", "rankings", "reviews", "reviews/sync", "user-geo", "website"];
  for (const path of paths) {
    const route = await import(`../src/app/api/${path}/route.ts`);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (!route[method]) continue;
      const query = path === "able" ? `?path=${method === "POST" ? "/marketing/users/search" : "/stats"}` : path === "able/write" ? `?path=${method === "POST" ? "/creators" : "/creators/example"}` : "";
      const response = await route[method](request(`/api/${path}${query}`, undefined, method));
      assert.equal(response.status, 401, `${method} /api/${path}`);
    }
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("password fallback stays disabled even if legacy credentials remain configured", async () => {
  process.env.DASHBOARD_PASSWORD = "legacy-password";
  process.env.ADMIN_BACKEND_USER = identity.email;
  process.env.ADMIN_BACKEND_PASSWORD = "legacy-password";
  const upstream = mock.method(globalThis, "fetch", () => { throw new Error("No backend login permitted"); });
  const result = await password(); assert.equal(result.status, 403); assert.equal(result.headers.get("set-cookie"), null);
  assert.equal(upstream.mock.callCount(), 0);
});

test("start route uses secure cookie; callback rejects state mismatch before exchanging", async () => {
  const response = await start();
  assert.equal(response.status, 302); assert.ok(response.cookies.get(authSettings().flowCookie)?.httpOnly);
  const upstream = mock.method(globalThis, "fetch", () => { throw new Error("Invalid state must not exchange"); });
  const result = await callback(request("/api/auth/google/callback?code=untrusted&state=wrong&next=https://evil.com"));
  assert.equal(result.headers.get("location"), `${origin}/login?error=google`);
  assert.equal(result.cookies.get(authSettings().sessionCookie), undefined);
  assert.equal(result.cookies.get(authSettings().flowCookie)?.maxAge, 0);
  assert.equal(upstream.mock.callCount(), 0);
});

test("callback exchanges code server-side, verifies Google and issues a usable session", async () => {
  const flow = await beginGoogleLogin(), params = new URL(flow.url).searchParams;
  const saved = await readLoginFlow(flow.cookie, params.get("state"));
  const idToken = await googleToken({ nonce: saved.nonce });
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "https://www.googleapis.com/oauth2/v3/certs") return Response.json(jwks);
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("code_verifier"), saved.verifier);
    assert.equal(body.get("redirect_uri"), `${origin}/api/auth/google/callback`);
    assert.equal(body.get("client_secret"), authSettings().clientSecret);
    return Response.json({ id_token: idToken, access_token: "must-never-reach-browser" });
  });
  const req = new NextRequest(`${origin}/api/auth/google/callback?code=one-use-code&state=${params.get("state")}`, {
    headers: { cookie: `${authSettings().flowCookie}=${flow.cookie}` },
  });
  const result = await callback(req);
  assert.equal(result.headers.get("location"), `${origin}/`);
  const session = result.cookies.get(authSettings().sessionCookie)?.value;
  assert.deepEqual(await readSession(session), identity);
  assert.equal(result.cookies.get(authSettings().flowCookie)?.maxAge, 0);
  assert.ok(!result.headers.get("set-cookie")?.includes("must-never-reach-browser"));
});

test("logout rejects cross-origin calls and clears both new and legacy cookies", async () => {
  assert.equal((await logout(request("/api/auth/logout", undefined, "POST", "https://other.able.finance"))).status, 403);
  const result = await logout(request("/api/auth/logout", undefined, "POST", origin));
  assert.equal(result.status, 200);
  for (const name of [authSettings().sessionCookie, authSettings().flowCookie, "app_session"]) assert.equal(result.cookies.get(name)?.maxAge, 0);
});

test("callback never issues a session for an outside account or a failed Google exchange", async () => {
  const flow = await beginGoogleLogin(), params = new URL(flow.url).searchParams;
  const idToken = await googleToken({ nonce: params.get("nonce"), email: "outsider@gmail.com", hd: "gmail.com" });
  const exchange = mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    String(url).endsWith("/certs") ? Response.json(jwks) : Response.json({ id_token: idToken }));
  const makeRequest = () => new NextRequest(`${origin}/api/auth/google/callback?code=test&state=${params.get("state")}`, {
    headers: { cookie: `${authSettings().flowCookie}=${flow.cookie}` },
  });
  for (let i = 0; i < 2; i++) {
    if (i) exchange.mock.mockImplementation(async () => new Response("invalid_grant", { status: 400 }));
    const result = await callback(makeRequest());
    assert.equal(result.headers.get("location"), `${origin}/login?error=google`);
    assert.equal(result.cookies.get(authSettings().sessionCookie), undefined);
    assert.equal(result.cookies.get(authSettings().flowCookie)?.maxAge, 0);
  }
});

test("production requires HTTPS and configuration cannot redirect to a path or embedded credentials", () => {
  for (const url of ["http://dashboard.able.finance", "https://staff:password@dashboard.able.finance", `${origin}/some-path`, `${origin}?redirect=evil`, `${origin}#fragment`]) {
    process.env.DASHBOARD_URL = url; assert.throws(authSettings, url);
  }
});

test("missing configuration fails closed instead of accepting passwords or old sessions", async () => {
  const token = await signSession(identity);
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DASHBOARD_SESSION_SECRET", "DASHBOARD_URL"]) {
    const value = process.env[key]; delete process.env[key];
    assert.throws(authSettings); assert.equal(await readSession(token), null); assert.equal((await start()).status, 503);
    process.env[key] = value;
  }
  process.env.DASHBOARD_SESSION_SECRET = "short"; assert.throws(authSettings);
});
