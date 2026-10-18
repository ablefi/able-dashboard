import { NextRequest } from "next/server";
import { BACKEND_PRODUCTION_URL, BACKEND_STAGING_URL, PRODUCTION_DASHBOARD_HOSTS } from "@/lib/brand";

/**
 * Auth guard for the admin app's own API routes.
 *
 * These routes hold a Supabase service-role key and a Gmail send credential,
 * so they must NOT be publicly callable on the deployed dashboard. We don't
 * hold the backend's JWT secret here, so instead of verifying the token
 * ourselves we forward it to the NestJS backend and require a 200 from an
 * admin-guarded endpoint. Cheap (limit=1) and uses the same backend the
 * dashboard deployment targets (host-based, mirrors lib/apiBase.ts).
 */

const STAGING = BACKEND_STAGING_URL;
const PRODUCTION = BACKEND_PRODUCTION_URL;

export function backendFor(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (env && env !== "undefined" && env !== "null") return env;
  const host = req.headers.get("host") || "";
  if (PRODUCTION_DASHBOARD_HOSTS.includes(host)) return PRODUCTION;
  return STAGING;
}

export async function requireAdmin(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Missing bearer token" };
  try {
    const res = await fetch(`${backendFor(req)}/admin/users?page=1&limit=1`, {
      headers: { Authorization: auth },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { ok: false, status: 401, error: "Invalid admin token" };
    if (!res.ok) return { ok: false, status: 502, error: `Auth backend error (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: "Auth backend unreachable" };
  }
}
