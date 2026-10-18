/**
 * The navigation tree, extracted so every shell reads one source.
 *
 * This used to live inside `Sidebar.tsx`. Once there was more than one way to
 * navigate (rail, bottom bar, command palette) a tree defined inside one of
 * them would have been copied three times and drifted immediately — which is
 * exactly how the old duplicated production-hostname list went wrong.
 *
 * Section `id` matches a `SectionKey` in `lib/sections.ts`, which is what
 * `canSeeSection` gates on. Keep them in step.
 */

import { sectionForPath } from "@/lib/sections";

import {
  LayoutDashboard, Users, Gift, Users2, MessageSquare,
  Globe, Crosshair, BarChart3, FileText, ShieldCheck, Trophy,
  Fingerprint, TrendingUp, Wallet, CalendarDays, HeartHandshake, UserCog,
} from "lucide-react";

export type NavIcon = typeof Users;
/**
 * `section` overrides the parent group's id for permission purposes.
 *
 * A group is usually one body of work, so its id gates everything inside it.
 * When a group holds unrelated pages, give the sensitive item its own
 * `section`, so the key that shows one page does not show all of them.
 */
export type Item = { href: string; label: string; icon: NavIcon; section?: string };
export type TopItem = Item & { kind: "item"; exact?: boolean };
export type Section = { kind: "section"; id: string; label: string; icon: NavIcon; items: Item[] };
export type Node = TopItem | Section;

export const NAV: Node[] = [
  { kind: "item", href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    kind: "section", id: "users", label: "Users", icon: Users,
    items: [
      // Able API reports (lib/ableApi.ts).
      { href: "/roster", label: "Users", icon: Users },
      { href: "/compliance", label: "Compliance", icon: Fingerprint },
      // Template pages on the backend's /admin/users; hidden until it exists.
      { href: "/users", label: "Accounts", icon: UserCog },
      { href: "/user-analysis", label: "User Analysis", icon: BarChart3 },
    ],
  },
  {
    // Roster and posts come from Able's API, which scrapes every 8h on Railway.
    kind: "section", id: "creators", label: "Creators", icon: Users2,
    items: [
      { href: "/creators", label: "Creators", icon: Users2 },
      { href: "/creators/posts", label: "Posts", icon: FileText },
      { href: "/creators/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    kind: "section", id: "growth", label: "Growth", icon: Crosshair,
    items: [
      { href: "/growth", label: "Growth", icon: TrendingUp },
      { href: "/money", label: "Money", icon: Wallet },
      { href: "/website", label: "Website Analytics", icon: Globe },
      { href: "/competitors", label: "Competitors", icon: Trophy },
      { href: "/reviews", label: "App Store Reviews", icon: MessageSquare },
    ],
  },
  {
    kind: "section", id: "giving", label: "Giving", icon: HeartHandshake,
    items: [
      { href: "/giving", label: "Giving", icon: HeartHandshake },
    ],
  },
  {
    // Its own group: codes are handed out to partners and campaigns as well as
    // creators, and the people who manage them are not always the same.
    kind: "section", id: "referral", label: "Referral Codes", icon: Gift,
    items: [
      { href: "/referral-codes", label: "Referral Codes", icon: Gift },
      { href: "/referral-codes/analytics", label: "Code Analytics", icon: BarChart3 },
    ],
  },
];

/** Reachable but not part of the section tree — surfaced in the palette only. */
export const UTILITY: (Item & { section: string })[] = [
  { href: "/admins", label: "Admin Settings", icon: ShieldCheck, section: "admins" },
];

/**
 * The nav, with anything this admin cannot open removed.
 *
 * Items are filtered on their own section when they carry one, and a group
 * with nothing left in it disappears rather than opening onto a dead end.
 */
export function visibleNav(can: (section: string) => boolean): Node[] {
  const out: Node[] = [];
  for (const n of NAV) {
    if (n.kind === "item") { out.push(n); continue; }
    const items = n.items.filter((i) => can(i.section ?? sectionForPath(i.href)));
    if (items.length) out.push({ ...n, items });
  }
  return out;
}

export const SECTIONS_IN_NAV = NAV.filter((n): n is Section => n.kind === "section");
export const SECTION_IDS = SECTIONS_IN_NAV.map((s) => s.id);

const ALL_HREFS = [
  ...NAV.flatMap((n) => (n.kind === "item" ? [n.href] : n.items.map((i) => i.href))),
  ...UTILITY.map((u) => u.href),
];

/**
 * The single best match for a path: longest wins.
 *
 * So `/referral-codes/analytics` highlights Code Analytics rather than Codes,
 * while `/referral-codes/<id>` still highlights Codes.
 */
export function activeHrefFor(pathname: string | null): string {
  if (!pathname) return "";
  let best = "";
  for (const href of ALL_HREFS) {
    const hit = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    if (hit && href.length > best.length) best = href;
  }
  return best;
}

/** Which section a path belongs to, for highlighting a section-level control. */
export function sectionIdForPath(pathname: string | null): string | null {
  const active = activeHrefFor(pathname);
  if (!active) return null;
  for (const n of NAV) {
    if (n.kind === "section" && n.items.some((i) => i.href === active)) return n.id;
  }
  const util = UTILITY.find((u) => u.href === active);
  return util ? util.section : null;
}

export type Destination = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Section label, shown as the subtitle so duplicate leaf names stay distinct. */
  group: string;
  /** Section id for permission gating; null = always visible. */
  section: string | null;
};

/** Every destination as a flat list, for search. */
export function flatDestinations(): Destination[] {
  const out: Destination[] = [];
  for (const n of NAV) {
    if (n.kind === "item") {
      out.push({ href: n.href, label: n.label, icon: n.icon, group: "Overview", section: null });
    } else {
      for (const i of n.items) {
        out.push({ href: i.href, label: i.label, icon: i.icon, group: n.label, section: sectionForPath(i.href) });
      }
    }
  }
  for (const u of UTILITY) {
    out.push({ href: u.href, label: u.label, icon: u.icon, group: "Settings", section: u.section });
  }
  return out;
}

/**
 * Subsequence match, the way every command palette works: "reva" finds
 * "Revenue Analytics", "camp" finds "Campaigns". Scored so tighter and
 * earlier matches sort first, with a bonus for hitting a word boundary.
 */
export function scoreMatch(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 1000 - t.indexOf(q) * 2 - (t.length - q.length);

  let ti = 0;
  let score = 500;
  let lastHit = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (found === lastHit + 1) score += 6;                        // contiguous
    if (found === 0 || /[\s/-]/.test(t[found - 1] ?? "")) score += 10; // word start
    score -= (found - ti);
    lastHit = found;
    ti = found + 1;
  }
  return score;
}
