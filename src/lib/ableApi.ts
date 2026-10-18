import "server-only";

/**
 * Server-side access to Able's API (the Railway backend).
 *
 * Mirrors the old Ops dashboard's viewer proxy: an exact allowlist of
 * read-only report routes plus one read-only phone lookup. The API marks each
 * of these 'dashboard-read', so the read-only DASHBOARD_API_TOKEN is enough
 * and the mutating admin surface (user deletes, resyncs, settlements, creator
 * edits) is unreachable from here even if a session is compromised. Every
 * report is masked server-side by the API (last-4 phones, no device tokens).
 *
 * Env:
 *   API_TOKEN  the API's DASHBOARD_API_TOKEN (server-side only, never sent
 *              to the browser)
 *   API_BASE   optional; defaults to the production API's custom domain
 */

export const ABLE_API_BASE = (process.env.API_BASE || "https://able-api.able.finance").replace(/\/+$/, "");

/** Allowed GET paths, each mapped to the dashboard section that may read it. */
export const ABLE_READS: Record<string, string> = {
  "/health": "dashboard",
  "/health/upstream": "dashboard",
  "/stats": "dashboard",
  "/compliance": "compliance",
  "/marketing": "marketing",
  "/creators": "creators",
  "/giving/report": "giving",
  "/giving/statement": "giving",
};

/** The one allowed POST: exact phone lookup, returns masked roster rows. */
export const ABLE_PHONE_SEARCH = "/marketing/users/search";

/**
 * Creator writes, the only mutations this dashboard makes. They use the API's
 * scoped CREATORS_API_TOKEN, which the API accepts on exactly these five routes
 * (access 'creators-write' in apps/api/src/admin.ts) and nowhere else. The
 * allowlist is repeated here so a bad path never leaves this server.
 */
const ID = "[A-Za-z0-9_-]{1,64}";
const CREATOR_WRITES: { method: "POST" | "DELETE"; re: RegExp }[] = [
  { method: "POST", re: /^\/creators$/ },
  { method: "POST", re: /^\/creators\/refresh$/ },
  { method: "POST", re: new RegExp(`^/creators/${ID}/refresh$`) },
  { method: "POST", re: new RegExp(`^/creators/posts/${ID}$`) },
  { method: "DELETE", re: new RegExp(`^/creators/${ID}$`) },
];

export function isCreatorWrite(method: string, path: string): boolean {
  return CREATOR_WRITES.some((w) => w.method === method && w.re.test(path));
}

export type AbleResult = { status: number; body: string };

export async function ableFetch(
  path: string,
  init?: { method: "GET" | "POST" | "DELETE"; body?: string; creatorsWrite?: boolean; timeoutMs?: number },
): Promise<AbleResult> {
  const envName = init?.creatorsWrite ? "CREATORS_API_TOKEN" : "API_TOKEN";
  const token = (process.env[envName] || "").trim();
  if (!token) {
    return { status: 503, body: JSON.stringify({ error: `${envName} is not set on this deployment.` }) };
  }
  try {
    const res = await fetch(ABLE_API_BASE + path, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body,
      cache: "no-store",
      // Under the route's maxDuration; /health/upstream waits on providers and the chain RPC.
      signal: AbortSignal.timeout(init?.timeoutMs ?? 50_000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        status: 502,
        body: JSON.stringify({
          error: init?.creatorsWrite
            ? "Able's API rejected the creators token. Set CREATORS_API_TOKEN to the API's CREATORS_API_TOKEN."
            : "Able's API rejected the dashboard token. Set API_TOKEN to the API's DASHBOARD_API_TOKEN.",
        }),
      };
    }
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return {
      status: 502,
      body: JSON.stringify({ error: `Able's API is unreachable: ${e instanceof Error ? e.message : String(e)}` }),
    };
  }
}
