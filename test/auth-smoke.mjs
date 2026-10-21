// Exercise the production build over HTTP with disposable signing keys and no vendor credentials.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { SignJWT } from "jose";

const port = process.env.SMOKE_PORT || "3311";
const base = `http://127.0.0.1:${port}`;
const origin = `https://dashboard.example.test`;
const secret = randomBytes(48).toString("base64url");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
  env: {
    PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    DASHBOARD_URL: origin, DASHBOARD_SESSION_SECRET: secret,
    GOOGLE_CLIENT_ID: "smoke-client", GOOGLE_CLIENT_SECRET: "smoke-secret",
    DASHBOARD_PASSWORD: "old-password-must-not-work",
  }, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (b) => { log += b; }); child.stderr.on("data", (b) => { log += b; });
child.on("error", (e) => { log += e.message; });
const request = (path, init = {}) => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { if ((await request("/login")).status === 200) { ready = true; break; } } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, `server did not start: ${log}`);
  const login = await request("/login");
  const html = await login.text();
  assert.ok(html.includes("Sign in with Google")); assert.ok(!html.includes('type="password"'));
  for (const path of ["/", "/roster", "/creators", "/money"]) {
    const response = await request(path);
    assert.equal(response.status, 307, path); assert.equal(response.headers.get("location"), "/login", path);
  }
  for (const path of ["/api/able?path=/stats", "/api/auth/me", "/api/competitors", "/api/website", "/api/reviews", "/api/rankings", "/api/user-geo"]) {
    const response = await request(path); assert.equal(response.status, 401, path);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"), path);
  }
  assert.equal((await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "staff@able.finance", password: "old-password-must-not-work" }) })).status, 403);
  const start = await request("/api/auth/google", { headers: { "X-Forwarded-Host": "evil.com" } });
  assert.equal(start.status, 302);
  assert.equal(new URL(start.headers.get("location")).searchParams.get("redirect_uri"), `${origin}/api/auth/google/callback`);
  assert.ok(start.headers.get("set-cookie")?.includes("__Host-able_oauth="));
  const badCallback = await request("/api/auth/google/callback?state=bad&code=bad");
  assert.equal(badCallback.headers.get("location"), `${origin}/login?error=google`);
  // The signer here represents a completed Google exchange; cryptographic Google
  // validation and the callback's successful exchange are covered in auth.test.ts.
  const token = await new SignJWT({ sub: "smoke-staff", email: "staff@able.finance", hd: "able.finance" })
    .setProtectedHeader({ alg: "HS256", typ: "able-session-v2" }).setIssuer(origin).setAudience("smoke-client")
    .setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(secret));
  const headers = { cookie: `__Host-able_session=${token}` };
  const me = await request("/api/auth/me", { headers });
  assert.equal(me.status, 200); assert.equal(me.headers.get("set-cookie"), null);
  assert.equal((await me.json()).backendToken, null);
  assert.equal((await request("/roster", { headers })).status, 200);
  assert.equal((await request("/api/able?path=/stats", { headers })).status, 503, "authorized request reaches missing API-token configuration");
  assert.equal((await request("/api/user-geo", { headers })).status, 403, "backend-admin permission is not granted");
  assert.equal((await request("/api/able/write?path=/creators", { method: "POST", headers })).status, 403, "writes require Origin");
  const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { ...headers, origin } });
  assert.equal(loggedOut.status, 200); assert.ok(loggedOut.headers.get("set-cookie")?.includes("Max-Age=0"));
  console.log("Production HTTP authentication smoke checks passed.");
} finally {
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
}
