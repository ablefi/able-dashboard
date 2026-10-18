import { TZ_POINTS, TZ_COUNTRY } from "@/data/timezones";
import { normalizeRegion, regionCodeFromName } from "@/lib/countries";

/**
 * Turning a user record into a point on the globe.
 *
 * The globe used to plot the `country` STRING at a hardcoded country centroid,
 * which was the weakest signal we hold and put every UK user in a field in
 * Lancashire and every Indonesian in the middle of Borneo. It also covered only
 * 4% of the user base, because `country` is barely ever populated.
 *
 * What we actually have is coordinates: most users grant location, and in the
 * original app 92% of payers carried real lat/lon against 43% carrying a
 * country name. This module prefers that, and falls back
 * to the timezone (which names a real city) before giving up.
 *
 * Nothing here keeps a user's true coordinates. They are snapped to a grid the
 * moment they are read, so the precise values never reach React state, the
 * IndexedDB row cache, app_state, or the browser. See GRID_DEG.
 */

/**
 * Grid size in degrees, applied to every coordinate before it leaves this
 * module.
 *
 * Stored coordinates carry 8 decimal places, roughly a millimetre. In a sample
 * of 159 paying users, 158 landed in their own 0.01° cell, so plotting raw
 * would have been a map of individual homes shipped to a browser. Half a degree
 * is 30-55km, which is a metro area rather than an address.
 *
 * It costs nothing visually. The globe draws the whole earth across ~1280px of
 * circumference, so one degree of longitude is about 3.5px at the equator and
 * anything finer than this is already sub-pixel.
 */
export const GRID_DEG = 0.5;

/** How confident we are about where someone is. */
export type GeoSource = "gps" | "tz";

export type GeoCell = {
  /** Cell centre. */
  lon: number;
  lat: number;
  /** Everyone in the cell. */
  count: number;
  /** ...of whom these have paid. */
  paying: number;
  /** ...and these were placed by real coordinates rather than their timezone. */
  gps: number;
  /**
   * Most common country in the cell, so a dot can name itself on hover and the
   * country list can highlight its own dots. A cell is 30-55km across, so this
   * is only ambiguous for the handful that straddle a border.
   */
  cc: string | null;
};

/** A user's position, already snapped. Null when we cannot place them at all. */
export type Placed = { lon: number; lat: number; source: GeoSource };

/** Snap a coordinate to the centre of its grid cell. */
export function snapToGrid(lon: number, lat: number): [number, number] {
  const f = (v: number) => +((Math.floor(v / GRID_DEG) + 0.5) * GRID_DEG).toFixed(4);
  return [f(lon), f(lat)];
}

/** Coordinates the backend will accept but that mean "unset" or "broken". */
function usableCoord(lat: unknown, lon: unknown): [number, number] | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  // Null Island: the default when a device reports no fix, not a real place.
  if (Math.abs(la) < 0.0001 && Math.abs(lo) < 0.0001) return null;
  return [la, lo];
}

/**
 * Place a raw API user, preferring their real position.
 *
 * Takes the untouched API shape rather than an AnalysisRow so this can run at
 * the point the record is read and hand back only the snapped cell.
 */
export function placeUser(u: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string | null;
}): Placed | null {
  const c = usableCoord(u.latitude, u.longitude);
  if (c) {
    const [lon, lat] = snapToGrid(c[1], c[0]);
    return { lon, lat, source: "gps" };
  }
  const tz = (u.timezone ?? "").trim();
  // "UTC" is the column default, so it means "never told us", not Greenwich.
  if (tz && tz !== "UTC") {
    const p = TZ_POINTS[tz];
    if (p) {
      const [lon, lat] = snapToGrid(p[0], p[1]);
      return { lon, lat, source: "tz" };
    }
  }
  return null;
}

/**
 * Best country code for a user, most reliable signal first.
 *
 * The timezone leads because it is a clean IANA name that maps to one ISO code,
 * where the `country` column holds whatever the device locale called the place
 * ("Deutschland", "Almanya", "Бельгия"). That column is still worth reading
 * last, since regionCodeFromName now understands those spellings.
 */
export function countryCodeFor(u: {
  timezone?: string | null;
  appStoreRegion?: string | null;
  country?: string | null;
}): string | null {
  const tz = (u.timezone ?? "").trim();
  if (tz && tz !== "UTC" && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  const region = normalizeRegion(u.appStoreRegion);
  if (region && region.length === 2) return region;
  if (region && region.length === 3) {
    const two = regionCodeFromName(region);
    if (two) return two;
  }
  return regionCodeFromName(u.country) ?? null;
}

/**
 * Roll placed users up into grid cells, largest first.
 *
 * `cap` bounds what gets published: cells are sorted by headcount and the tail
 * is dropped, so the payload stays a sane size on a 250k-user crawl. The tail
 * is single-user cells that would each draw as one 1px dot, so losing it costs
 * nothing visible — but the caller is told how many users were dropped so the
 * footer can stay honest. At roughly 64 bytes a cell, 5000 is about 320KB
 * before gzip, which is the most worth putting behind a dashboard card.
 */
export function buildCells(
  placed: Iterable<{ place: Placed; paying: boolean; cc: string | null }>,
  cap = 5000
): { cells: GeoCell[]; droppedUsers: number; droppedCells: number } {
  const byKey = new Map<string, GeoCell & { ccTally: Record<string, number> }>();
  for (const { place, paying, cc } of placed) {
    const key = `${place.lon},${place.lat}`;
    let cell = byKey.get(key);
    if (!cell) {
      cell = { lon: place.lon, lat: place.lat, count: 0, paying: 0, gps: 0, cc: null, ccTally: {} };
      byKey.set(key, cell);
    }
    cell.count++;
    if (paying) cell.paying++;
    if (place.source === "gps") cell.gps++;
    if (cc) cell.ccTally[cc] = (cell.ccTally[cc] || 0) + 1;
  }
  const all = [...byKey.values()]
    .map(({ ccTally, ...cell }) => {
      const top = Object.entries(ccTally).sort((a, b) => b[1] - a[1])[0];
      return { ...cell, cc: top ? top[0] : null };
    })
    .sort((a, b) => b.count - a.count);
  const cells = all.slice(0, cap);
  const tail = all.slice(cap);
  return {
    cells,
    droppedUsers: tail.reduce((n, c) => n + c.count, 0),
    droppedCells: tail.length,
  };
}
