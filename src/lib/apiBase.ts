/**
 * Resolve the backend API base URL.
 *
 * Set NEXT_PUBLIC_API_BASE_URL to Able's backend. It is inlined at build time
 * and read by the browser, which calls the backend directly, so this value is
 * public by design and is not a secret.
 *
 * Until it is set, this returns an empty string and every backend-dependent
 * page (Users, User Analysis, Referral Codes, Content) will render empty
 * rather than crash.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv && fromEnv !== "undefined" && fromEnv !== "null") return fromEnv;
  return "";
}
