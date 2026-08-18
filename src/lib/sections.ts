/**
 * Section catalog for role-based access. The single source of truth for
 * "what areas exist" — the sidebar, route guards, and Admin Panel all read
 * from here. Safe to import on client or server (no secrets).
 *
 * `backend: true` = the section's data comes from the NestJS backend (direct
 * browser→backend calls). Only roles that include a backend section get a
 * backend token in the browser; roles without any (e.g. Marketing) never
 * receive one, so they can't reach backend data even by hand.
 */

export type SectionKey =
  | "dashboard"
  | "users"
  | "financials"
  | "referral"
  | "content"
  | "ai"
  | "social"
  | "research"
  | "creators"
  | "messaging";

export const SECTIONS: { key: SectionKey; label: string; backend: boolean }[] = [
  { key: "dashboard", label: "Dashboard", backend: false }, // everyone; home overview
  { key: "users", label: "Users", backend: true },
  { key: "financials", label: "Financials", backend: false },
  { key: "referral", label: "Referral Codes", backend: true },
  { key: "content", label: "Content", backend: true },
  { key: "ai", label: "AI", backend: true },
  { key: "social", label: "Social", backend: true },
  { key: "research", label: "Research", backend: false },
  { key: "creators", label: "Creators", backend: false },
  // User Messaging — campaigns/journeys, broadcasts and in-app banners, all
  // served by the NestJS backend (/admin/workflows + /admin/in-app-messages).
  { key: "messaging", label: "User Messaging", backend: true },
];

export const ALL_SECTION_KEYS: SectionKey[] = SECTIONS.map((s) => s.key);

/** Does this set of allowed sections include any backend-backed section? */
export function roleNeedsBackendToken(sections: string[]): boolean {
  return SECTIONS.some((s) => s.backend && sections.includes(s.key));
}

/** Map a pathname to its section key (longest-prefix wins). "dashboard" = "/". */
const PATH_SECTION: { prefix: string; section: SectionKey }[] = [
  { prefix: "/users", section: "users" },
  { prefix: "/cancel-reasons", section: "users" },
  { prefix: "/user-analysis", section: "users" },
  { prefix: "/free-codes", section: "users" },
  { prefix: "/testimonials", section: "users" },
  { prefix: "/fc-analysis", section: "users" },
  { prefix: "/prayers", section: "users" },
  { prefix: "/financials", section: "financials" },
  { prefix: "/revenue", section: "financials" },
  { prefix: "/expenses", section: "financials" },
  { prefix: "/referral-codes", section: "referral" },
  { prefix: "/inspirational-messages", section: "content" },
  { prefix: "/supplications", section: "content" },
  { prefix: "/quotes", section: "content" },
  { prefix: "/ai", section: "ai" },
  { prefix: "/circle", section: "social" },
  { prefix: "/avatars", section: "social" },
  { prefix: "/links", section: "social" },
  { prefix: "/website", section: "social" },
  { prefix: "/competitors", section: "research" },
  { prefix: "/prospects", section: "research" },
  { prefix: "/creators", section: "creators" },
  { prefix: "/messaging", section: "messaging" },
];

export function sectionForPath(pathname: string): SectionKey {
  if (pathname === "/" ) return "dashboard";
  let best: { prefix: string; section: SectionKey } | null = null;
  for (const m of PATH_SECTION) {
    if ((pathname === m.prefix || pathname.startsWith(m.prefix + "/")) && (!best || m.prefix.length > best.prefix.length)) best = m;
  }
  return best?.section ?? "dashboard";
}
