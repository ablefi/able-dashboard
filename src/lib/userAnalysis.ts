import { aiAssistantSource, squash } from "./attribution";
import { User } from "@/api/usersApi";
import { normalizeRegion, regionFlag, regionName } from "@/lib/countries";
import { buildCells, countryCodeFor, placeUser, type GeoCell } from "@/lib/geoPlace";

/**
 * Client-side user analysis. This is the TEMPORARY stopgap: we page through
 * the Users API, map each user to a slim row, and compute every breakdown in
 * the browser — exactly the aggregation the old CSV-upload tool did, just fed
 * from live data instead of an exported file. At ~200k it's a slow-but-cached
 * "Refresh", and it won't scale to 1M — the durable version is a backend
 * aggregation endpoint (logged as a task for the backend dev).
 */

const genderMap: Record<string, string> = { male: "Male", female: "Female" };
const heardMap: Record<string, string> = {
  app_store: "App Store",
  word_of_mouth: "Word of Mouth",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};
/** The six old enum codes still get a label. Anything else is what the user
 *  typed when asked who they heard about us from, and is shown as typed — the
 *  old lookup collapsed all of it to "-", i.e. straight into "Not Set". */
function heardLabel(v: string | null | undefined): string {
  if (!v || !String(v).trim()) return "-";
  return heardMap[v] ?? String(v);
}

/** Is this one of the six channels, as opposed to a person's name? */
export function isKnownChannel(label: string): boolean {
  return Object.values(heardMap).includes(label);
}


export type AnalysisRow = {
  gender: string;
  age: number | null;
  heard_about: string;
  total_spent: number;
  auth_type: string;
  active: string;
  created_at: string;
  /** App Store / Play Store storefront code, normalized uppercase ("US"), or null. */
  app_store_region: string | null;
  /** Device platforms (active sessions ∪ devices); [] when none on record. */
  platforms: string[];
  /** User-reported country (full English name from the app), or null. */
  country: string | null;
  /**
   * Where the globe draws this user, ALREADY snapped to a coarse grid, or null
   * when we cannot place them.
   *
   * Snapped here, at the point the API record is read, so the true coordinates
   * never reach this row, the IndexedDB cache it is persisted to, or app_state.
   * They are accurate to about a millimetre — a home address — and nothing
   * downstream has any use for that.
   */
  geo: [number, number] | null;
  /** Whether `geo` came from real coordinates or was inferred from a timezone. */
  geo_source: "gps" | "tz" | null;
  /** Best available ISO alpha-2, from timezone → storefront → country name. */
  country_code: string | null;
};

/** Map a live API user to the slim analysis row (applies the same label maps the CSV export used). */
export function mapUserToRow(u: User): AnalysisRow {
  const up: any = u.userProfile || {};
  const place = placeUser(u);
  return {
    gender: genderMap[up.gender] || "N/A",
    age: up.age && Number(up.age) > 0 ? Number(up.age) : null,
    heard_about: heardLabel(up.heard),
    total_spent: u.totalSpent || 0,
    auth_type: u.googleId ? "Google" : u.appleId ? "Apple" : "Email",
    active: u.isActive ? "Active" : "Inactive",
    created_at: u.createdAt,
    app_store_region: normalizeRegion(u.appStoreRegion),
    platforms: (u.platforms ?? []).filter(Boolean),
    country: (u.country ?? "").trim() || null,
    geo: place ? [place.lon, place.lat] : null,
    geo_source: place?.source ?? null,
    country_code: countryCodeFor(u),
  };
}

export interface AnalysisStats {
  maleCount: number;
  femaleCount: number;
  naGenderCount: number;
  avgAge: number;
  conversionRate: number;
  totalRevenue: number;
  avgSpend: number;
  revenuePerDownload: number;
  payingCount: number;
  genderData: { name: string; value: number }[];
  ageData: { name: string; count: number }[];
  heardData: { name: string; count: number }[];
  /** Free-text answers that are not one of the six channels: creator names,
   *  mostly. Carries spend so attributed revenue is readable straight off it. */
  heardPeople: { name: string; count: number; spend: number; paying: number }[];
  convByGender: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; payingCount: number; totalCount: number }[];
  convByAge: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  convByExactAge: { age: number; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  spendByGender: { name: string; avgSpend: number; totalSpend: number }[];
  signupTrend: { name: string; users: number; paying: number }[];
  /** Average age AT SIGNUP per signup month — `count` is how many of that
   * cohort gave an age, `cohortSize` the whole cohort. Read the tail with the
   * counts in view: a thin month swings on very few people. */
  ageByCohort: { name: string; avgAge: number; count: number; cohortSize: number }[];
  convByChannel: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  spendDist: { name: string; count: number }[];
  /** All storefront regions seen, sorted by count desc. `name`/`flag` are
   * legacy precomputed fields — RENDER FROM `code` instead (a cached result
   * can hold strings from an older countries.ts). */
  storeRegionData: { code: string; name: string; flag: string; count: number; payingCount: number; totalSpend: number; rate: number }[];
  /** Conversion by storefront region (min sample applied), best rate first. */
  convByRegion: { name: string; code: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  /** Device platform split. A user on two platforms counts in BOTH, so these
   * can sum above platformCoverage — it's per-platform reach, not a partition. */
  platformData: { platform: string; count: number; payingCount: number; totalSpend: number; rate: number }[];
  /** How many users report ANY platform (the honest denominator). */
  platformCoverage: number;
  /** How many users have a storefront region at all (the coverage base for %). */
  regionCoverage: number;
  /**
   * Countries, sorted by count desc. `code` is the alpha-2 and the field to
   * render from; `name` is its canonical English name, kept so an older cached
   * payload without `code` still reads.
   *
   * Keyed on the resolved code rather than the raw `country` string, which the
   * app fills with whatever the DEVICE called the place. Tallying the strings
   * split Germany into three entries (Deutschland, Germany, Almanya) and
   * Switzerland into four, each drawn as its own dot at its own size.
   */
  userCountryData: { name: string; code: string; count: number }[];
  /** Same shape, but only users who have actually paid (total_spent > 0). */
  payingCountryData: { name: string; code: string; count: number }[];
  countryCoverage: number;
  /** Grid cells for the globe, biggest first. Coordinates already snapped. */
  geoCells: GeoCell[];
  /** How many users we could put on the map at all. */
  geoPlaced: number;
  /** ...of whom this many have paid. */
  geoPlacedPaying: number;
  /** ...of whom this many by real coordinates rather than by timezone. */
  geoGps: number;
  /** The same, counting only paying users, so the footer is right in both modes. */
  geoGpsPaying: number;
  /** Users in cells too small to publish; counted so the footer can say so. */
  geoDroppedUsers: number;
}

const AGE_ORDER = ["<13", "13-17", "18-24", "25-34", "35-44", "45-54", "55+", "Unknown"];
function getAgeGroup(age: number | null): string {
  if (!age || age <= 0) return "Unknown";
  if (age < 13) return "<13";
  if (age < 18) return "13-17";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

/** Aggregate the rows — a faithful port of the old server-side compute. */
export function computeUserAnalysis(allUsers: AnalysisRow[]): { total: number; stats: AnalysisStats | null } {
  const total = allUsers.length;
  if (total === 0) return { total: 0, stats: null };

  const maleCount = allUsers.filter((u) => u.gender === "Male").length;
  const femaleCount = allUsers.filter((u) => u.gender === "Female").length;
  const naGenderCount = total - maleCount - femaleCount;

  const withAge = allUsers.filter((u) => u.age && u.age > 0);
  const avgAge = withAge.length ? withAge.reduce((s, u) => s + (u.age || 0), 0) / withAge.length : 0;

  const payingUsers = allUsers.filter((u) => u.total_spent > 0);
  const conversionRate = total ? (payingUsers.length / total) * 100 : 0;
  const totalRevenue = allUsers.reduce((s, u) => s + (u.total_spent || 0), 0);
  const avgSpend = payingUsers.length ? totalRevenue / payingUsers.length : 0;

  const genderData = [
    { name: "Male", value: maleCount },
    { name: "Female", value: femaleCount },
    { name: "N/A", value: naGenderCount },
  ].filter((d) => d.value > 0);

  const ageGroups: Record<string, AnalysisRow[]> = {};
  for (const u of allUsers) {
    const g = getAgeGroup(u.age);
    (ageGroups[g] ||= []).push(u);
  }
  const ageData = AGE_ORDER.filter((g) => ageGroups[g]?.length).map((g) => ({ name: g, count: ageGroups[g].length }));

  const heardGroups: Record<string, AnalysisRow[]> = {};
  for (const u of allUsers) {
    const key = u.heard_about || "-";
    (heardGroups[key] ||= []).push(u);
  }
  // Split what is now one free-text column back into the two questions it
  // actually answers: which channel, and which person. Mixed on one chart,
  // "Instagram" and "Ali Dawah" look like the same kind of answer.
  const heardEntries = Object.entries(heardGroups)
    .map(([name, arr]) => ({ name: name === "-" ? "Not Set" : name, count: arr.length, spend: arr.reduce((t, u) => t + (u.total_spent || 0), 0), paying: arr.filter((u) => u.total_spent > 0).length }))
    .sort((a, b) => b.count - a.count);
  const heardData = heardEntries
    .filter((e) => e.name === "Not Set" || isKnownChannel(e.name))
    .map(({ name, count }) => ({ name, count }));
  const heardPeople = heardEntries.filter((e) => e.name !== "Not Set" && !isKnownChannel(e.name));

  const convByGender = ["Male", "Female", "N/A"].map((g) => {
    const group = g === "N/A" ? allUsers.filter((u) => u.gender !== "Male" && u.gender !== "Female") : allUsers.filter((u) => u.gender === g);
    const paying = group.filter((u) => u.total_spent > 0);
    const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
    return {
      name: g,
      rate: group.length ? (paying.length / group.length) * 100 : 0,
      avgSpend: paying.length ? totalSpend / paying.length : 0,
      totalSpend,
      revenuePerDownload: group.length ? totalSpend / group.length : 0,
      payingCount: paying.length,
      totalCount: group.length,
    };
  });

  const convByAge = AGE_ORDER.filter((g) => ageGroups[g]?.length).map((g) => {
    const group = ageGroups[g];
    const paying = group.filter((u) => u.total_spent > 0);
    const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
    return {
      name: g,
      rate: group.length ? (paying.length / group.length) * 100 : 0,
      avgSpend: paying.length ? totalSpend / paying.length : 0,
      totalSpend,
      revenuePerDownload: group.length ? totalSpend / group.length : 0,
      totalCount: group.length,
      payingCount: paying.length,
    };
  });

  const ageBuckets: Record<number, AnalysisRow[]> = {};
  for (const u of allUsers) {
    if (!u.age || u.age <= 0) continue;
    (ageBuckets[u.age] ||= []).push(u);
  }
  const convByExactAge = Object.entries(ageBuckets)
    .map(([ageStr, group]) => {
      const age = parseInt(ageStr);
      const paying = group.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        age,
        totalCount: group.length,
        payingCount: paying.length,
        rate: group.length ? (paying.length / group.length) * 100 : 0,
        totalSpend,
        avgSpend: paying.length ? totalSpend / paying.length : 0,
        revenuePerDownload: group.length ? totalSpend / group.length : 0,
      };
    })
    .sort((a, b) => a.age - b.age);

  const spendByGender = ["Male", "Female"].map((g) => {
    const paying = allUsers.filter((u) => u.gender === g && u.total_spent > 0);
    return {
      name: g,
      avgSpend: paying.length ? paying.reduce((s, u) => s + u.total_spent, 0) / paying.length : 0,
      totalSpend: paying.reduce((s, u) => s + u.total_spent, 0),
    };
  });

  const signupByMonth: Record<string, AnalysisRow[]> = {};
  for (const u of allUsers) {
    if (!u.created_at) continue;
    const d = new Date(u.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    (signupByMonth[key] ||= []).push(u);
  }
  const signupTrend = Object.entries(signupByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, arr]) => ({ name: month, users: arr.length, paying: arr.filter((u) => u.total_spent > 0).length }));

  // Average age of each signup cohort. Age is captured once at onboarding and
  // never updated, so this is age AT SIGNUP — which is what you want for "are
  // the people joining us getting older?". Comparing it across cohorts has no
  // ageing-in-place confound, and it can move independently of the headline
  // average, which is just every cohort blended by size.
  const ageByCohort = Object.entries(signupByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, arr]) => {
      const aged = arr.filter((u) => u.age && u.age > 0);
      return {
        name: month,
        avgAge: aged.length ? aged.reduce((s, u) => s + (u.age || 0), 0) / aged.length : 0,
        count: aged.length,
        cohortSize: arr.length,
      };
    })
    .filter((m) => m.count > 0);

  const convByChannel = Object.entries(heardGroups)
    .filter(([, arr]) => arr.length >= 10)
    .map(([name, arr]) => {
      const paying = arr.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        name: name === "-" ? "Not Set" : name,
        rate: arr.length ? (paying.length / arr.length) * 100 : 0,
        avgSpend: paying.length ? totalSpend / paying.length : 0,
        totalSpend,
        revenuePerDownload: arr.length ? totalSpend / arr.length : 0,
        totalCount: arr.length,
        payingCount: paying.length,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  const brackets = [
    { name: "$0-10", min: 0.01, max: 10 },
    { name: "$10-25", min: 10.01, max: 25 },
    { name: "$25-50", min: 25.01, max: 50 },
    { name: "$50-100", min: 50.01, max: 100 },
    { name: "$100+", min: 100.01, max: Infinity },
  ];
  const spendDist = brackets
    .map((b) => ({ name: b.name, count: payingUsers.filter((u) => u.total_spent >= b.min && u.total_spent <= b.max).length }))
    .filter((d) => d.count > 0);

  // App Store / Play Store region + user-reported country. Both fields ship
  // empty until the app update sends them, so coverage counts are surfaced
  // (the charts caption "N of M users") instead of pretending it's everyone.
  const regionGroups: Record<string, AnalysisRow[]> = {};
  const countryCounts: Record<string, number> = {};
  // Paying users per country, keyed off total_spent rather than the backend's
  // subscription status — that flag mislabels anyone who cancelled but still
  // has paid time left, so it under-reports by roughly 60%. Spend is banked.
  const payingCountryCounts: Record<string, number> = {};
  // Globe placement, gathered in the same pass.
  const placedUsers: {
    place: { lon: number; lat: number; source: "gps" | "tz" };
    paying: boolean;
    cc: string | null;
  }[] = [];
  let geoGps = 0;
  let geoGpsPaying = 0;
  for (const u of allUsers) {
    if (u.app_store_region) (regionGroups[u.app_store_region] ||= []).push(u);
    if (u.country_code) {
      countryCounts[u.country_code] = (countryCounts[u.country_code] || 0) + 1;
      if (u.total_spent > 0) payingCountryCounts[u.country_code] = (payingCountryCounts[u.country_code] || 0) + 1;
    }
    if (u.geo && u.geo_source) {
      placedUsers.push({
        place: { lon: u.geo[0], lat: u.geo[1], source: u.geo_source },
        paying: u.total_spent > 0,
        cc: u.country_code,
      });
      if (u.geo_source === "gps") {
        geoGps++;
        if (u.total_spent > 0) geoGpsPaying++;
      }
    }
  }
  const { cells: geoCells, droppedUsers: geoDroppedUsers } = buildCells(placedUsers);
  const geoPlaced = placedUsers.length;
  const geoPlacedPaying = placedUsers.reduce((n, p) => n + (p.paying ? 1 : 0), 0);
  const storeRegionData = Object.entries(regionGroups)
    .map(([code, arr]) => {
      const paying = arr.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        code,
        name: regionName(code),
        flag: regionFlag(code),
        count: arr.length,
        payingCount: paying.length,
        totalSpend,
        rate: arr.length ? (paying.length / arr.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
  const regionCoverage = storeRegionData.reduce((s, r) => s + r.count, 0);

  // Conversion by region — same shape/min-sample rule as
  // convByChannel, so a handful of users in one storefront can't top the chart.
  const convByRegion = Object.entries(regionGroups)
    .filter(([, arr]) => arr.length >= 10)
    .map(([code, arr]) => {
      const paying = arr.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        name: regionName(code),
        code,
        rate: arr.length ? (paying.length / arr.length) * 100 : 0,
        avgSpend: paying.length ? totalSpend / paying.length : 0,
        totalSpend,
        revenuePerDownload: arr.length ? totalSpend / arr.length : 0,
        totalCount: arr.length,
        payingCount: paying.length,
      };
    })
    .sort((a, b) => b.rate - a.rate);
  const userCountryData = Object.entries(countryCounts)
    .map(([code, count]) => ({ name: regionName(code), code, count }))
    .sort((a, b) => b.count - a.count);
  const payingCountryData = Object.entries(payingCountryCounts)
    .map(([code, count]) => ({ name: regionName(code), code, count }))
    .sort((a, b) => b.count - a.count);
  const countryCoverage = userCountryData.reduce((s, c) => s + c.count, 0);

  // Device platform. A user can be on several platforms, so they're counted
  // in each — these buckets overlap by design and won't sum to coverage.
  const platformGroups: Record<string, AnalysisRow[]> = {};
  let platformCoverage = 0;
  for (const u of allUsers) {
    if (!u.platforms?.length) continue;
    platformCoverage++;
    for (const p of new Set(u.platforms)) (platformGroups[p] ||= []).push(u);
  }
  const platformData = Object.entries(platformGroups)
    .map(([platform, arr]) => {
      const paying = arr.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        platform,
        count: arr.length,
        payingCount: paying.length,
        totalSpend,
        rate: arr.length ? (paying.length / arr.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    total,
    stats: {
      maleCount,
      femaleCount,
      naGenderCount,
      avgAge,
      conversionRate,
      totalRevenue,
      avgSpend,
      revenuePerDownload: total ? totalRevenue / total : 0,
      payingCount: payingUsers.length,
      genderData,
      ageData,
      heardData,
      heardPeople,
      convByGender,
      convByAge,
      convByExactAge,
      spendByGender,
      signupTrend,
      ageByCohort,
      convByChannel,
      spendDist,
      storeRegionData,
      convByRegion,
      platformData,
      platformCoverage,
      regionCoverage,
      userCountryData,
      payingCountryData,
      countryCoverage,
      geoCells,
      geoPlaced,
      geoPlacedPaying,
      geoGps,
      geoGpsPaying,
      geoDroppedUsers,
    },
  };
}

/** Reclassify cached raw acquisition groups without crawling users again.
 * Creator spellings remain people; raw answers in the cached rows stay untouched. */
export function withAiAcquisition(stats: AnalysisStats | null, creatorAnswers: Set<string>): AnalysisStats | null {
  if (!stats) return stats;
  const matches = (name: string) => !!aiAssistantSource(name) && !creatorAnswers.has(squash(name));
  const ai = (stats.heardPeople ?? []).filter(r => matches(r.name));
  if (!ai.length) return stats;
  const count = ai.reduce((n,r)=>n+r.count,0), spend = ai.reduce((n,r)=>n+r.spend,0), paying = ai.reduce((n,r)=>n+r.paying,0);
  return {...stats,
    heardData:[...stats.heardData,{name:"AI assistants",count}].sort((a,b)=>b.count-a.count),
    heardPeople:stats.heardPeople.filter(r=>!matches(r.name)),
    convByChannel:[...stats.convByChannel.filter(r=>!matches(r.name)),...(count>=10?[{name:"AI assistants",totalCount:count,payingCount:paying,totalSpend:spend,rate:paying/count*100,avgSpend:paying?spend/paying:0,revenuePerDownload:spend/count}]:[])].sort((a,b)=>b.rate-a.rate),
  };
}
