import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { appState, appStateSet } from "@/lib/supabaseRest";

/**
 * Where our users are, by country.
 *
 * The User Analysis crawl already works this out, but it runs in the browser
 * and caches to localStorage — so the globe would be empty on any other
 * machine, or in a fresh browser. This stores the country tally centrally the
 * moment a crawl finishes, so the globe is populated for everyone.
 *
 * It's a tally of ~200 rows, not user records — nothing identifying.
 */

const KEY = "user_geo_countries";

type Tally = { name: string; count: number };

export interface UserGeo {
  /** Every user with a country on record. */
  countries: Tally[];
  /** Only those who have actually paid — the globe's default view. */
  paying: Tally[];
  total: number;
  coverage: number;
  computedAt: string;
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "users");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const v = (await appState(KEY)) as UserGeo | null;
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
            .map((c) => ({ name: c.name, count: c.count }))
        : [];

    const countries = clean(body.countries);
    if (!countries.length) return NextResponse.json({ error: "No country data" }, { status: 400 });

    const payload: UserGeo = {
      countries,
      paying: clean(body.paying),
      total: Number(body.total) || 0,
      coverage: Number(body.coverage) || 0,
      computedAt: new Date().toISOString(),
    };
    await appStateSet(KEY, payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save", details: String(err) }, { status: 500 });
  }
}
