import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchCompetitorRows, appState, appStateSet } from "@/lib/supabaseRest";

/**
 * App Store category rankings for Just Pray + all competitors across ~50
 * storefronts (iTunes RSS top-free feeds).
 *
 * THE FIX vs localhost: results are now PERSISTED (app_state key
 * `competitor_rankings`), so the page always loads the last-known table
 * instantly — GET returns the cache; POST re-checks and replaces it. No
 * more "refresh after every refresh".
 */

export const maxDuration = 120;

const CACHE_KEY = "competitor_rankings";
const PRIMARY_COUNT = 15;
const COUNTRIES = [
  { code: "us", name: "United States", flag: "🇺🇸" },
  { code: "fr", name: "France", flag: "🇫🇷" },
  { code: "gb", name: "United Kingdom", flag: "🇬🇧" },
  { code: "de", name: "Germany", flag: "🇩🇪" },
  { code: "sa", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "ae", name: "UAE", flag: "🇦🇪" },
  { code: "eg", name: "Egypt", flag: "🇪🇬" },
  { code: "my", name: "Malaysia", flag: "🇲🇾" },
  { code: "tr", name: "Turkey", flag: "🇹🇷" },
  { code: "id", name: "Indonesia", flag: "🇮🇩" },
  { code: "pk", name: "Pakistan", flag: "🇵🇰" },
  { code: "ca", name: "Canada", flag: "🇨🇦" },
  { code: "au", name: "Australia", flag: "🇦🇺" },
  { code: "nl", name: "Netherlands", flag: "🇳🇱" },
  { code: "se", name: "Sweden", flag: "🇸🇪" },
  { code: "in", name: "India", flag: "🇮🇳" },
  { code: "ng", name: "Nigeria", flag: "🇳🇬" },
  { code: "za", name: "South Africa", flag: "🇿🇦" },
  { code: "bd", name: "Bangladesh", flag: "🇧🇩" },
  { code: "ma", name: "Morocco", flag: "🇲🇦" },
  { code: "dz", name: "Algeria", flag: "🇩🇿" },
  { code: "tn", name: "Tunisia", flag: "🇹🇳" },
  { code: "iq", name: "Iraq", flag: "🇮🇶" },
  { code: "jo", name: "Jordan", flag: "🇯🇴" },
  { code: "kw", name: "Kuwait", flag: "🇰🇼" },
  { code: "qa", name: "Qatar", flag: "🇶🇦" },
  { code: "bh", name: "Bahrain", flag: "🇧🇭" },
  { code: "om", name: "Oman", flag: "🇴🇲" },
  { code: "lb", name: "Lebanon", flag: "🇱🇧" },
  { code: "br", name: "Brazil", flag: "🇧🇷" },
  { code: "mx", name: "Mexico", flag: "🇲🇽" },
  { code: "it", name: "Italy", flag: "🇮🇹" },
  { code: "es", name: "Spain", flag: "🇪🇸" },
  { code: "be", name: "Belgium", flag: "🇧🇪" },
  { code: "at", name: "Austria", flag: "🇦🇹" },
  { code: "ch", name: "Switzerland", flag: "🇨🇭" },
  { code: "no", name: "Norway", flag: "🇳🇴" },
  { code: "dk", name: "Denmark", flag: "🇩🇰" },
  { code: "fi", name: "Finland", flag: "🇫🇮" },
  { code: "nz", name: "New Zealand", flag: "🇳🇿" },
  { code: "sg", name: "Singapore", flag: "🇸🇬" },
  { code: "ph", name: "Philippines", flag: "🇵🇭" },
  { code: "jp", name: "Japan", flag: "🇯🇵" },
  { code: "kr", name: "South Korea", flag: "🇰🇷" },
  { code: "ru", name: "Russia", flag: "🇷🇺" },
  { code: "ke", name: "Kenya", flag: "🇰🇪" },
  { code: "gh", name: "Ghana", flag: "🇬🇭" },
  { code: "tz", name: "Tanzania", flag: "🇹🇿" },
  { code: "uz", name: "Uzbekistan", flag: "🇺🇿" },
  { code: "kz", name: "Kazakhstan", flag: "🇰🇿" },
  { code: "az", name: "Azerbaijan", flag: "🇦🇿" },
];
const DEFAULT_GENRE_ID = 6006; // Reference
const LIMIT = 200;
const JUST_PRAY_ID = "6747154163";

async function fetchGenreFeed(countryCode: string, genreId: number): Promise<{ id: string; name: string; rank: number }[]> {
  try {
    const url = `https://itunes.apple.com/${countryCode}/rss/topfreeapplications/genre=${genreId}/limit=${LIMIT}/json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const data = await res.json();
    const entries = data?.feed?.entry;
    if (!Array.isArray(entries)) return [];
    return entries.map((entry: any, i: number) => ({
      id: entry?.id?.attributes?.["im:id"] || "",
      name: entry?.["im:name"]?.label || "Unknown",
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const cached = await appState(CACHE_KEY);
    return NextResponse.json(cached || null);
  } catch (err) {
    return NextResponse.json({ error: "Failed to load cached rankings", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "research");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const competitors = await fetchCompetitorRows();
    const appIds = competitors.filter((c) => c.app_store_id).map((c) => String(c.app_store_id));
    const appNames: Record<string, string> = { [JUST_PRAY_ID]: "Just Pray" };
    const genreOverrides: Record<string, number> = {};
    for (const c of competitors) {
      if (!c.app_store_id) continue;
      appNames[c.app_store_id] = c.name;
      if (c.genre_id && c.genre_id !== DEFAULT_GENRE_ID) genreOverrides[c.app_store_id] = c.genre_id;
    }
    const allIds = Array.from(new Set([JUST_PRAY_ID, ...appIds]));

    const rankingsMap: Record<string, any> = {};
    for (const id of allIds) {
      rankingsMap[id] = { appId: id, appName: appNames[id] || id, genreId: genreOverrides[id] || DEFAULT_GENRE_ID, rankings: [] };
    }

    const batchSize = 5;
    for (let i = 0; i < COUNTRIES.length; i += batchSize) {
      const batch = COUNTRIES.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (country) => {
          // group apps by genre, fetch each genre feed once
          const genreGroups = new Map<number, string[]>();
          for (const appId of allIds) {
            const genre = genreOverrides[appId] || DEFAULT_GENRE_ID;
            (genreGroups.get(genre) ?? genreGroups.set(genre, []).get(genre))!.push(appId);
          }
          const results = new Map<string, { rank: number; name: string }>();
          const entries = Array.from(genreGroups.entries());
          const feeds = await Promise.all(entries.map(([genreId]) => fetchGenreFeed(country.code, genreId)));
          for (let g = 0; g < entries.length; g++) {
            const [, idsInGenre] = entries[g];
            for (const entry of feeds[g]) {
              if (idsInGenre.includes(entry.id)) results.set(entry.id, { rank: entry.rank, name: entry.name });
            }
          }
          return results;
        })
      );
      for (let j = 0; j < batch.length; j++) {
        const country = batch[j];
        for (const id of allIds) {
          const result = batchResults[j].get(id);
          rankingsMap[id].rankings.push({ country, rank: result?.rank ?? null });
        }
      }
    }

    const payload = {
      rankings: Object.values(rankingsMap),
      countries: COUNTRIES,
      primaryCount: PRIMARY_COUNT,
      checkedAt: new Date().toISOString(),
    };
    await appStateSet(CACHE_KEY, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Rankings refresh error:", err);
    return NextResponse.json({ error: "Failed to refresh rankings", details: String(err) }, { status: 500 });
  }
}
