/**
 * Everything app-specific in one place. Set these in `.env.local` (and in your
 * host's environment settings); see `.env.example` for the full list.
 *
 * The backend URLs are public: the browser calls them directly, so they are
 * NEXT_PUBLIC_ and inlined at build time. Nothing secret belongs in here.
 */
const list = (value: string | undefined, fallback: string[]) =>
  value ? value.split(",").map((v) => v.trim()).filter(Boolean) : fallback;

export const BRAND = {
  /** Shown in the sidebar, the login screen and the browser tab. */
  name: process.env.NEXT_PUBLIC_APP_NAME || "Able",
};

/** Your backend (the API that owns users, referral codes and admin logins). */
export const BACKEND_STAGING_URL = process.env.NEXT_PUBLIC_BACKEND_STAGING_URL || "https://api-staging.example.com";
export const BACKEND_PRODUCTION_URL = process.env.NEXT_PUBLIC_BACKEND_PRODUCTION_URL || "https://api.example.com";

/** Hostnames that serve the PRODUCTION dashboard. Any other host (previews,
 * localhost) talks to the staging backend, so a preview can never touch real data. */
export const PRODUCTION_DASHBOARD_HOSTS = list(process.env.NEXT_PUBLIC_PRODUCTION_DASHBOARD_HOSTS, ["admin.example.com"]);
