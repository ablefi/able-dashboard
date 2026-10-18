"use client";

import { usePathname } from "next/navigation";

/**
 * Client side of Main roster vs an optional second market (server side: lib/creatorMarket).
 *
 * The same creator screens serve both sections; the URL decides which. Under
 * /alt-creators every creator API call carries `market=alt`, and links stay in
 * /alt-creators. The server re-checks the permission and the creator's market
 * on every call, so this is navigation, not the security boundary.
 */
export function isAltCreatorsPath(pathname?: string | null): boolean {
  return !!pathname && (pathname === "/alt-creators" || pathname.startsWith("/alt-creators/"));
}

/** Add `market=alt` to a creator/prospect API path when on an AR page. Runs in
 * event handlers and effects, so `window` is always there. */
export function creatorApi(path: string): string {
  if (typeof window === "undefined" || !isAltCreatorsPath(window.location.pathname)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}market=alt`;
}

/** Where this section's pages live, for links. */
export function useCreatorSection() {
  const ar = isAltCreatorsPath(usePathname());
  return {
    ar,
    /** Roster root; append `/${slug}`, `/attribution`, … */
    base: ar ? "/alt-creators" : "/creators",
    prospects: ar ? "/alt-creators/prospects" : "/prospects",
  };
}
