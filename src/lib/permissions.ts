/**
 * Admin permissions — the backend is the source of truth.
 *
 * Every operator now signs in as their own backend admin and carries a
 * `permissions[]` list. The backend enforces it (403 on a missing key), so
 * everything here is UI gating only: its job is to make the interface match
 * what the API will actually allow, not to be the security boundary. Never
 * treat a check here as protection — the backend check is the real one.
 *
 * `isSuperAdmin` is deliberately NOT a bypass. The backend does not skip
 * permission checks for a super admin (the seeded one simply holds every
 * key), so neither do we. It only unlocks "set another admin's password".
 */

export interface AdminSession {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

/** Does this admin hold a given permission key? */
export function hasPermission(admin: AdminSession | null | undefined, key: string): boolean {
  if (!admin) return false;
  return admin.permissions.includes(key);
}

/** Every key, or nothing. */
export function hasAll(admin: AdminSession | null | undefined, keys: string[]): boolean {
  if (!admin) return false;
  return keys.every((k) => admin.permissions.includes(k));
}

/** Any one of the keys. Handy for a section fed by several resources. */
export function hasAny(admin: AdminSession | null | undefined, keys: string[]): boolean {
  if (!admin) return false;
  return keys.some((k) => admin.permissions.includes(k));
}

/**
 * The dashboard's sections mapped onto permission keys.
 *
 * Two kinds of section live here, and the difference matters:
 *
 * - Sections backed by the NestJS API (users, content, messaging…) map to
 *   **system** keys the backend already seeds and enforces.
 * - Sections backed by OUR Supabase data (creators, financials, research,
 *   social) have no backend resource at all, so they map to **custom** keys.
 *   The brief covers this case in §7: create the key in the catalog, assign
 *   it, and gate the page on it. The backend never sees these routes, so the
 *   enforcement for them is our own `requireSession` — which makes them the
 *   one place our check IS the boundary.
 *
 * A section listing several keys is readable with any one of them.
 */
export const SECTION_PERMISSIONS: Record<string, string[]> = {
  dashboard: ["dashboard:read"],
  users: ["users:read"],
  referral: ["referral-codes:read"],
  // Growth is a nav group, not a single body of work, so this covers only the
  // pages that have no key of their own: reviews, website, prospects. The
  // group's visibility comes from whether any of its items are visible (see
  // visibleNav), not from this list.
  growth: ["research:read", "reviews:read", "social:read"],
  // Custom keys: ours, not the backend's. requireSession() resolves its
  // `need` argument through this table, so API routes pass these names.
  social: ["social:read"],
  research: ["research:read"],
  creators: ["creators:read"],
  // Able API reports (see lib/ableApi.ts).
  compliance: ["compliance:read"],
  marketing: ["marketing:read"],
  giving: ["giving:read"],
  admins: ["admins:read"],
};

/** The custom keys we own, which must exist in the backend catalog for the
 * admin checklist to be able to grant them. Created via POST /admin/permissions. */
export const CUSTOM_PERMISSIONS: { key: string; description: string }[] = [
  { key: "creators:read", description: "Creator roster, attribution, posts, calendar, performance and outliers" },
  { key: "creators:write", description: "Edit creators, deals and post tracking" },
  { key: "social:read", description: "View website analytics" },
  { key: "research:read", description: "Prospects and Competitors" },
  { key: "reviews:read", description: "App Store review approval queue" },
  { key: "reviews:write", description: "Approve, edit and post review replies" },
  { key: "compliance:read", description: "Compliance: masked user, device and sign-in history" },
  { key: "marketing:read", description: "User roster, growth, activation, referrals and card spend reports" },
  { key: "giving:read", description: "Giving points report and monthly statement" },
];

/** Can this admin open this section at all? */
export function canSeeSection(admin: AdminSession | null | undefined, section: string): boolean {
  const keys = SECTION_PERMISSIONS[section];
  if (!keys) return section.includes(":") && hasPermission(admin, section);
  return hasAny(admin, keys);
}

/** Dashboard names for the backend resources; keys stay unchanged. */
export const PERMISSION_GROUPS: Record<string, { label: string; pages: string }> = {
  admins: { label: "Admin Settings", pages: "Admin accounts and permissions" },
  dashboard: { label: "Home", pages: "Dashboard overview" },
  users: { label: "Users", pages: "Users and User Analysis" },
  creators: { label: "Creators", pages: "Creators, Attribution, Posts (incl. Outliers), Calendar and Performance" },
  social: { label: "Website Analytics", pages: "Growth → Website Analytics" },
  research: { label: "Prospects and Competitors", pages: "Creators → Prospects, Growth → Competitors" },
  reviews: { label: "App Store Reviews", pages: "Growth → App Store Reviews" },
  "referral-codes": { label: "Referral Codes", pages: "Referral Codes and Code Analytics" },
  compliance: { label: "Compliance", pages: "Users → Compliance" },
  marketing: { label: "Marketing reports", pages: "Users → Users, Growth → Growth and Money" },
  giving: { label: "Giving", pages: "Giving" },
};

/** Include new backend resources in the catalog setup, as well as our own keys. */
export const REQUIRED_DASHBOARD_PERMISSIONS = [
  ...CUSTOM_PERMISSIONS,
];
