/**
 * Filtering users by SEVERAL App Store regions at once.
 *
 * `/admin/users` only accepts one `appStoreRegion`. Every way of passing more
 * than one fails, and one of them fails dangerously (verified against
 * production, 228,632 users):
 *
 *   appStoreRegion=USA            -> 2,405
 *   appStoreRegion=USA&...=GBR    -> 400
 *   appStoreRegion=USA,GBR        -> 0
 *   appStoreRegion[]=USA&[]=GBR   -> 228,634   (silently ignored: everyone)
 *
 * So we fan out — one query per region — and stitch the results back into a
 * single paginated list. That works because **a user has exactly one App Store
 * region**, so the per-region result sets are disjoint: no dedupe needed, and
 * the combined total is simply the sum.
 *
 * It does NOT fetch everything and paginate in memory. It asks each region for
 * its total (one tiny request each, memoized per filter set), works out which
 * regions a given page actually straddles, and fetches only those. Page 1 of
 * USA+GBR costs two count requests and one page of data.
 */

export type UsersMeta = { total: number; page?: number; totalPages?: number };

export type FetchUsers = (
  params: Record<string, unknown>,
  options?: { silent?: boolean }
) => Promise<{ data: any[]; meta: UsersMeta } | null>;

/** Per-region totals are stable for a given filter set, and the CSV export
 * walks many pages — so cache them rather than re-counting every page. */
const totalsCache = new Map<string, number[]>();

function signature(base: Record<string, unknown>, regions: string[]): string {
  return JSON.stringify([base, regions]);
}

export function clearRegionTotalsCache(): void {
  totalsCache.clear();
}

async function regionTotals(
  fetchUsers: FetchUsers,
  base: Record<string, unknown>,
  regions: string[],
  silent: boolean
): Promise<number[]> {
  const key = signature(base, regions);
  const hit = totalsCache.get(key);
  if (hit) return hit;

  const totals = await Promise.all(
    regions.map(async (r) => {
      const res = await fetchUsers({ ...base, appStoreRegion: r, page: 1, limit: 1 }, { silent });
      return res?.meta?.total ?? 0;
    })
  );
  totalsCache.set(key, totals);
  return totals;
}

/**
 * One page of users, across any number of regions.
 *
 * `base` must NOT contain appStoreRegion, page or limit — those are supplied
 * per call. Pass `regions: []` for "any region".
 */
export async function fetchUsersAcrossRegions(
  fetchUsers: FetchUsers,
  base: Record<string, unknown>,
  regions: string[],
  page: number,
  limit: number,
  options: { silent?: boolean } = {}
): Promise<{ data: any[]; meta: UsersMeta } | null> {
  const silent = !!options.silent;

  // Nothing to stitch — let the backend do its normal job.
  if (regions.length === 0) return fetchUsers({ ...base, page, limit }, options);
  if (regions.length === 1) return fetchUsers({ ...base, appStoreRegion: regions[0], page, limit }, options);

  const totals = await regionTotals(fetchUsers, base, regions, silent);
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  const wantFrom = (page - 1) * limit;
  const wantTo = wantFrom + limit;
  const out: any[] = [];

  // Walk the regions as one continuous list and take only the overlap.
  let cursor = 0;
  for (let i = 0; i < regions.length && out.length < limit; i++) {
    const size = totals[i];
    const start = cursor;
    const end = cursor + size;
    cursor = end;
    if (size === 0 || end <= wantFrom) continue; // entirely before the slice
    if (start >= wantTo) break; // entirely after it

    // Local range within this region.
    const from = Math.max(0, wantFrom - start);
    const to = Math.min(size, wantTo - start);

    // Fetch only the backend pages covering [from, to).
    const first = Math.floor(from / limit) + 1;
    const last = Math.ceil(to / limit);
    for (let p = first; p <= last; p++) {
      const res = await fetchUsers({ ...base, appStoreRegion: regions[i], page: p, limit }, { silent });
      if (!res) return null;
      const pageStart = (p - 1) * limit;
      res.data.forEach((row, j) => {
        const idx = pageStart + j;
        if (idx >= from && idx < to) out.push(row);
      });
    }
  }

  // page/totalPages mirror the single-region shape so callers that show
  // progress (the CSV export) keep working across a stitched result.
  return {
    data: out,
    meta: { total: grandTotal, page, totalPages: Math.max(1, Math.ceil(grandTotal / limit)) },
  };
}
