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
  | "referral"
  | "social"
  | "research"
  | "creators"
  | "growth"
  | "admins";

export const SECTIONS: { key: SectionKey; label: string; backend: boolean }[] = [
  { key: "dashboard", label: "Dashboard", backend: false }, // everyone; home overview
  { key: "users", label: "Users", backend: true },
  { key: "referral", label: "Referral Codes", backend: true },
  { key: "social", label: "Social", backend: true },
  { key: "research", label: "Research", backend: false },
  { key: "creators", label: "Creators", backend: false },
  // User Messaging — campaigns/journeys, broadcasts and in-app banners, all
  // served by the NestJS backend (/admin/workflows + /admin/in-app-messages).
  // App-wide mobile config served by the backend's app-settings map
  // (force-update minimums today, more later).
  // Outward-facing measurement: store reviews and site traffic.
  { key: "growth", label: "Growth", backend: true },
  // Managing admin accounts and the permission catalog.
  { key: "admins", label: "Admins", backend: true },
];

export const ALL_SECTION_KEYS: SectionKey[] = SECTIONS.map((s) => s.key);

/** Does this set of allowed sections include any backend-backed section? */
export function roleNeedsBackendToken(sections: string[]): boolean {
  return SECTIONS.some((s) => s.backend && sections.includes(s.key));
}

/** Map a pathname to its section key (longest-prefix wins). "dashboard" = "/". */
const PATH_SECTION: { prefix: string; section: string }[] = [
  { prefix: "/users", section: "users" },
  { prefix: "/user-analysis", section: "users" },
  { prefix: "/creators", section: "creators" },
  { prefix: "/referral-codes", section: "referral" },
  // App: everything that configures what ships inside the app.
  // Growth: how we look to the outside world.
  { prefix: "/reviews", section: "reviews:read" },
  { prefix: "/website", section: "social:read" },
  { prefix: "/prospects", section: "research:read" },
  { prefix: "/competitors", section: "research:read" },
  { prefix: "/admins", section: "admins" },
];

export function sectionForPath(pathname: string): string {
  if (pathname === "/" ) return "dashboard";
  let best: { prefix: string; section: string } | null = null;
  for (const m of PATH_SECTION) {
    if ((pathname === m.prefix || pathname.startsWith(m.prefix + "/")) && (!best || m.prefix.length > best.prefix.length)) best = m;
  }
  return best?.section ?? "dashboard";
}
