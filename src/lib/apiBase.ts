import { BACKEND_PRODUCTION_URL, BACKEND_STAGING_URL, PRODUCTION_DASHBOARD_HOSTS } from "@/lib/brand";

/**
 * Resolve the backend API base URL.
 *
 * Why this isn't just `process.env.NEXT_PUBLIC_API_BASE_URL`:
 * Vercel has not been injecting that variable into this project's builds —
 * it's configured correctly (preview → staging, production → prod) but never
 * reaches `next build`, so it compiles to `undefined` and the app posted to
 * `/undefined/admin/login`. That single bug caused every symptom we chased
 * (poisoned localStorage → JSON.parse crash, and the login loop).
 *
 * These backend URLs are PUBLIC — the browser calls them directly, so they're
 * already visible in the network tab. Resolving them client-side is not a
 * secret-exposure concern. Priority:
 *   1. the inlined env var, if it's actually present (local dev via
 *      .env.local, or if Vercel ever starts injecting it) — env always wins.
 *   2. otherwise, pick the backend by the dashboard's hostname.
 */
const PROD_HOSTS = new Set(PRODUCTION_DASHBOARD_HOSTS);
const STAGING = BACKEND_STAGING_URL;
const PRODUCTION = BACKEND_PRODUCTION_URL;

export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv && fromEnv !== "undefined" && fromEnv !== "null") return fromEnv;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Production faces → prod backend (real data). The staging alias, per-commit
    // preview hashes, and localhost all → STAGING (test data). Unknown hosts
    // default to staging so a preview can never accidentally hit production.
    if (PROD_HOSTS.has(host)) return PRODUCTION;
    return STAGING;
  }

  // SSR / build: no window. Default to staging (the env var NEXT_PUBLIC_API_BASE_URL
  // overrides this on production builds, where it's set to the prod backend).
  return STAGING;
}

/**
 * Is this dashboard the production one?
 *
 * Used to hide staging-only controls (campaign promotion) rather than to make
 * any security decision — the promote route re-checks the host server-side.
 * Returns false during SSR so a control never flashes in before hydration.
 */
export function isProductionDashboard(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return PROD_HOSTS.has(host);
}
