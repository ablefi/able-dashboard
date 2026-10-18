import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchCreatorsUniverse } from "@/lib/supabaseRest";
import { sbGet } from "@/lib/scrape";

/**
 * Main roster vs an optional second market.
 *
 * Two creator sections can share the same `creators` table: Creators (the main
 * roster) and an optional second market, e.g. another language. A creator is in
 * the second market when its own tags contain `market:alt`, or its persona
 * parent's do, so a persona's child accounts follow the persona. Everyone else
 * is in the main roster. No schema change: tags already carry `roster`,
 * `prospect` and `resp:*`.
 *
 * Every creator API reads `?market=alt` (default: main), checks the matching
 * permission, and only returns or changes creators of that market. The template
 * ships only the main section; to use a second market, add pages under
 * /alt-creators that reuse the same views (lib/creatorMarketClient).
 */
export type Market = "en" | "alt";
export const ALT_MARKET_TAG = "market:alt";

type Tagged = { id: string; tags?: string[] | null; parent_id?: string | null };

export function marketOf(req: NextRequest): Market {
  return req.nextUrl.searchParams.get("market") === "alt" ? "alt" : "en";
}

/** The section (read) or key (write) a market's routes are gated by. */
export function marketPermission(market: Market, write = false): string {
  if (market === "alt") return write ? "alt-creators:write" : "alt-creators";
  return write ? "creators:write" : "creators";
}

/** requireSession for creator routes, using the request's market. */
export async function requireCreatorsSession(req: NextRequest, write = false) {
  const market = marketOf(req);
  const guard = await requireSession(req, marketPermission(market, write));
  return { ...guard, market };
}

function isAltMarket(c: Tagged, byId: Map<string, Tagged>): boolean {
  if ((c.tags ?? []).includes(ALT_MARKET_TAG)) return true;
  const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
  return !!parent && (parent.tags ?? []).includes(ALT_MARKET_TAG);
}

/** Ids of every creator (any type, children included) in this market. */
export async function marketCreatorIds(market: Market, universe?: Tagged[]): Promise<Set<string>> {
  const all = (universe ?? (await fetchCreatorsUniverse())) as Tagged[];
  const byId = new Map(all.map((c) => [c.id, c]));
  return new Set(all.filter((c) => isAltMarket(c, byId) === (market === "alt")).map((c) => c.id));
}

/** Keep only the rows whose id is in this market. Rows need only an `id`. */
export async function filterToMarket<T extends { id: string }>(rows: T[], market: Market, universe?: Tagged[]): Promise<T[]> {
  const ids = await marketCreatorIds(market, universe);
  return rows.filter((r) => ids.has(r.id));
}

export class MarketError extends Error {
  status = 404;
}

/** Throws (404) unless this creator id belongs to the market. 404, not 403,
 * so an id from the other section reads as "not here" rather than confirming
 * it exists. */
export async function assertCreatorInMarket(creatorId: string, market: Market): Promise<void> {
  const ids = await marketCreatorIds(market);
  if (!ids.has(creatorId)) throw new MarketError("Creator not found in this section");
}

/** Tags for a new creator created from a section: second-market gets the market tag. */
export function withMarketTag(tags: string[] | null | undefined, market: Market): string[] {
  const base = (tags ?? []).filter((t) => t !== ALT_MARKET_TAG);
  return market === "alt" ? [...base, ALT_MARKET_TAG] : base;
}

/** Throws (404) unless this post's creator belongs to the market. */
export async function assertPostInMarket(postId: string, market: Market): Promise<void> {
  const row = (await sbGet(`posts?select=creator_id&id=eq.${encodeURIComponent(postId)}&limit=1`))[0] as { creator_id?: string } | undefined;
  if (!row?.creator_id) throw new MarketError("Post not found");
  await assertCreatorInMarket(row.creator_id, market);
}

/** For routes either section may use without a market (post thumbnails). */
export async function requireAnyCreatorsSession(req: NextRequest) {
  const en = await requireSession(req, "creators");
  if (en.ok) return en;
  return requireSession(req, "alt-creators");
}

/** JSON error for a MarketError, or rethrow anything else. */
export function marketErrorStatus(err: unknown): number | null {
  return err instanceof MarketError ? err.status : null;
}
