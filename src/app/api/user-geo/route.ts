import { NextRequest, NextResponse } from "next/server";
import { requireSession, backendBaseFor, BACKEND_BASES } from "@/lib/auth";
import { appState, appStateSet } from "@/lib/supabaseRest";
import { GRID_DEG } from "@/lib/geoPlace";

/**
 * Where our users are: a country tally, plus counts per map grid cell.
 *
 * The User Analysis crawl already works this out, but it runs in the browser
 * and caches to localStorage — so the globe would be empty on any other
 * machine, or in a fresh browser. This stores the result centrally the moment
 * a crawl finishes, so the globe is populated for everyone.
 *
 * Counts only, never user records. The cells deserve the specific claim: each
 * one is a half-degree square, 30-55km across, holding a headcount. Users'
 * stored coordinates are precise to about a millimetre, and lib/geoPlace snaps
 * them to that grid as each record is read, so a real position never reaches
 * this route, this table, or a browser. POST re-snaps anyway rather than trust
 * its caller.
 */

/**
 * Namespaced per environment, because staging and production share ONE
 * Supabase.
 *
 * They didn't used to be. The result: opening User Analysis on staging
 * crawled staging's 12 users, published the tally to the single shared key,
 * and production's globe then rendered "4 paying users · 3 countries" — the
 * daily background refresh meant simply being logged into staging was enough
 * to do it, with nothing on either side to show what had happened.
 *
 * Keyed off the request host, the same rule the backend base URL uses, so it
 * follows whichever backend's users the tally actually describes.
 */
const PROD_KEY = "user_geo_countries";
const STAGING_KEY = "user_geo_countries_staging";

function geoKeyFor(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  // Compare against the production base URL itself, NOT
  // backendBaseFor("<production host>"). backendBaseFor now resolves from
  // NEXT_PUBLIC_API_BASE_URL and ignores the host it is given, so calling it
  // with a production hostname returns whatever THIS environment points at —
  // making the two sides always equal, and every environment write PROD_KEY.
  // That is exactly the shared-key bug described above, reintroduced.
  return backendBaseFor(host) === BACKEND_BASES.production ? PROD_KEY : STAGING_KEY;
}

type Tally = { name: string; code?: string; count: number };

/** A grid cell of users. Coordinates are already snapped by lib/geoPlace. */
type Cell = { lon: number; lat: number; count: number; paying: number; gps: number; cc: string | null };

export interface UserGeo {
  /** Every user we could resolve a country for. */
  countries: Tally[];
  /** Only those who have actually paid — the globe's default view. */
  paying: Tally[];
  total: number;
  coverage: number;
  computedAt: string;
  /**
   * Where users actually are, as grid cells. Optional because a payload
   * written before the globe plotted real positions will not have them, and
   * the globe falls back to the country tallies in that case.
   */
  cells?: Cell[];
  /** How many users are on the map, and how many of those by real coordinates. */
  placed?: number;
  placedPaying?: number;
  gps?: number;
  gpsPaying?: number;
  /** Users whose cell was too small to publish. */
  droppedUsers?: number;
  /** Everyone who has ever paid — the denominator the header quotes against. */
  payingTotal?: number;
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "users");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const v = (await appState(geoKeyFor(req))) as UserGeo | null;
    return NextResponse.json({ geo: v ?? null });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "users");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const body = await req.json();
    const clean = (v: unknown): Tally[] =>
      Array.isArray(v)
        ? v
            .filter((c: unknown): c is Tally => {
              const r = c as { name?: unknown; count?: unknown };
              return typeof r?.name === "string" && typeof r?.count === "number";
            })
            .map((c) => ({ name: c.name, ...(typeof c.code === "string" ? { code: c.code } : {}), count: c.count }))
        : [];

    /**
     * Cells are re-validated rather than trusted, and re-snapped to the grid.
     * This is the one place a coordinate could be written back at full
     * precision by a caller that skipped lib/geoPlace, and the whole point of
     * the grid is that a user's real position never lands in storage.
     */
    const snap = (v: number) => +((Math.floor(v / GRID_DEG) + 0.5) * GRID_DEG).toFixed(4);
    const cleanCells = (v: unknown): Cell[] =>
      Array.isArray(v)
        ? v
            .filter((c: unknown): c is Cell => {
              const r = c as Record<string, unknown>;
              return (
                typeof r?.lon === "number" && typeof r?.lat === "number" &&
                Number.isFinite(r.lon) && Number.isFinite(r.lat) &&
                (r.lon as number) >= -180 && (r.lon as number) <= 180 &&
                (r.lat as number) >= -90 && (r.lat as number) <= 90 &&
                typeof r?.count === "number" && r.count > 0
              );
            })
            .slice(0, 8000)
            .map((c) => ({
              lon: snap(c.lon),
              lat: snap(c.lat),
              count: Math.round(c.count),
              paying: Math.round(Number(c.paying) || 0),
              gps: Math.round(Number(c.gps) || 0),
              cc: typeof c.cc === "string" && /^[A-Z]{2}$/.test(c.cc) ? c.cc : null,
            }))
        : [];

    const countries = clean(body.countries);
    if (!countries.length) return NextResponse.json({ error: "No country data" }, { status: 400 });

    const cells = cleanCells(body.cells);
    const payload: UserGeo = {
      countries,
      paying: clean(body.paying),
      total: Number(body.total) || 0,
      coverage: Number(body.coverage) || 0,
      computedAt: new Date().toISOString(),
      ...(cells.length
        ? {
            cells,
            placed: Number(body.placed) || 0,
            placedPaying: Number(body.placedPaying) || 0,
            gps: Number(body.gps) || 0,
            // Kept absent rather than coerced to 0 when the caller does not
            // send it: the globe reads a missing value as "no figure to quote"
            // and a 0 as "none of them had a fix", which are different claims.
            ...(body.gpsPaying != null ? { gpsPaying: Number(body.gpsPaying) || 0 } : {}),
            droppedUsers: Number(body.droppedUsers) || 0,
            payingTotal: Number(body.payingTotal) || 0,
          }
        : {}),
    };
    await appStateSet(geoKeyFor(req), payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save", details: String(err) }, { status: 500 });
  }
}
