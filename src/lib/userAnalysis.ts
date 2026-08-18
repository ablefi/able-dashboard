import { User } from "@/api/usersApi";
import { normalizeRegion, regionFlag, regionName } from "@/lib/countries";

/**
 * Client-side user analysis. This is the TEMPORARY stopgap: we page through
 * the Users API, map each user to a slim row, and compute every breakdown in
 * the browser — exactly the aggregation the old CSV-upload tool did, just fed
 * from live data instead of an exported file. At ~200k it's a slow-but-cached
 * "Refresh", and it won't scale to 1M — the durable version is a backend
 * aggregation endpoint (logged as a task for the backend dev).
 */

const genderMap: Record<string, string> = { male: "Male", female: "Female" };
const personalJourneyMap: Record<string, string> = {
  born_muslim: "Born Muslim",
  reverted_in_my_youth: "Reverted in My Youth",
  recently_embraced_islam: "Recently Embraced Islam",
  revert: "Revert",
};
const heardMap: Record<string, string> = {
  app_store: "App Store",
  word_of_mouth: "Word of Mouth",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};
const donationCountryMap: Record<string, string> = {
  SUDAN: "🇸🇩 SUDAN",
  PALASTINE: "🇵🇸 PALASTINE",
  YEMEN: "🇾🇪 YEMEN",
};

export type AnalysisRow = {
  gender: string;
  age: number | null;
  personal_journey: string;
  heard_about: string;
  current_daily_prayer: string;
  target_daily_prayer: string;
  donation_country: string;
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
};

/** Map a live API user to the slim analysis row (applies the same label maps the CSV export used). */
export function mapUserToRow(u: User): AnalysisRow {
  const up: any = u.userProfile || {};
  return {
    gender: genderMap[up.gender] || "N/A",
    age: up.age && Number(up.age) > 0 ? Number(up.age) : null,
    personal_journey: personalJourneyMap[up.personalJourney] || "-",
    heard_about: heardMap[up.heard] || "-",
    current_daily_prayer: up.currentDailyPrayer != null && up.currentDailyPrayer !== "" ? String(up.currentDailyPrayer) : "-",
    target_daily_prayer: up.targetDailyPrayers != null ? String(up.targetDailyPrayers) : "-",
    donation_country: up.donationCountry ? donationCountryMap[up.donationCountry] || up.donationCountry : "-",
    total_spent: u.totalSpent || 0,
    auth_type: u.googleId ? "Google" : u.appleId ? "Apple" : "Email",
    active: u.isActive ? "Active" : "Inactive",
    created_at: u.createdAt,
    app_store_region: normalizeRegion(u.appStoreRegion),
    platforms: (u.platforms ?? []).filter(Boolean),
    country: (u.country ?? "").trim() || null,
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
  journeyData: { name: string; count: number }[];
  heardData: { name: string; count: number }[];
  convByGender: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; payingCount: number; totalCount: number }[];
  convByAge: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  convByExactAge: { age: number; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  spendByGender: { name: string; avgSpend: number; totalSpend: number }[];
  countryData: { name: string; users: number; totalSpend: number }[];
  signupTrend: { name: string; users: number; paying: number }[];
  /** Average age AT SIGNUP per signup month — `count` is how many of that
   * cohort gave an age, `cohortSize` the whole cohort. Read the tail with the
   * counts in view: a thin month swings on very few people. */
  ageByCohort: { name: string; avgAge: number; count: number; cohortSize: number }[];
  convByJourney: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  convByChannel: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
  prayerAnalysis: { avgCurrent: number; count: number };
  prayerDistribution: { name: string; count: number }[];
  convByPrayer: { name: string; rate: number; avgSpend: number; totalSpend: number; revenuePerDownload: number; totalCount: number; payingCount: number }[];
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
  /** User-reported countries (full names from the app), sorted by count desc. */
  userCountryData: { name: string; count: number }[];
  /** Same shape, but only users who have actually paid (total_spent > 0). */
  payingCountryData: { name: string; count: number }[];
  countryCoverage: number;
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

  const REVERT_LABELS = ["Revert", "Recently Embraced Islam", "Reverted in My Youth"];
  const journeyGroups: Record<string, AnalysisRow[]> = {};
  for (const u of allUsers) {
    let key = u.personal_journey || "-";
    if (REVERT_LABELS.includes(key)) key = "Revert";
    (journeyGroups[key] ||= []).push(u);
  }
  const journeyData = Object.entries(journeyGroups)
    .map(([name, arr]) => ({ name: name === "-" ? "Not Set" : name, count: arr.length }))
    .sort((a, b) => b.count - a.count);

  const heardGroups: Record<string, AnalysisRow[]> = {};
  for (const u of allUsers) {
    const key = u.heard_about || "-";
    (heardGroups[key] ||= []).push(u);
  }
  const heardData = Object.entries(heardGroups)
    .map(([name, arr]) => ({ name: name === "-" ? "Not Set" : name, count: arr.length }))
    .sort((a, b) => b.count - a.count);

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

  const payingWithCountry = payingUsers.filter((u) => u.donation_country && u.donation_country !== "-");
  const countryGroups: Record<string, AnalysisRow[]> = {};
  for (const u of payingWithCountry) {
    (countryGroups[u.donation_country] ||= []).push(u);
  }
  const countryData = Object.entries(countryGroups)
    .map(([name, arr]) => ({ name, users: arr.length, totalSpend: arr.reduce((s, u) => s + u.total_spent, 0) }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

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

  const convByJourney = Object.entries(journeyGroups)
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

  const withPrayer = allUsers.filter((u) => u.current_daily_prayer && u.current_daily_prayer !== "-");
  const withoutPrayer = allUsers.filter((u) => !u.current_daily_prayer || u.current_daily_prayer === "-");
  const avgCurrent = withPrayer.length ? withPrayer.reduce((s, u) => s + (parseInt(u.current_daily_prayer) || 0), 0) / withPrayer.length : 0;

  const prayerGroups: Record<string, AnalysisRow[]> = {};
  for (const u of withPrayer) {
    const key = String(parseInt(u.current_daily_prayer) || 0);
    (prayerGroups[key] ||= []).push(u);
  }
  prayerGroups["not_set"] = withoutPrayer;

  const prayerDistribution = ["not_set", "1", "2", "3", "4", "5"]
    .filter((k) => prayerGroups[k]?.length)
    .map((k) => ({ name: k === "not_set" ? "0 prayers" : `${k} prayers`, count: prayerGroups[k].length }));

  const convByPrayer = ["not_set", "1", "2", "3", "4", "5"]
    .filter((k) => prayerGroups[k]?.length)
    .map((k) => {
      const group = prayerGroups[k];
      const paying = group.filter((u) => u.total_spent > 0);
      const totalSpend = paying.reduce((s, u) => s + u.total_spent, 0);
      return {
        name: k === "not_set" ? "0 prayers" : `${k} prayers`,
        rate: group.length ? (paying.length / group.length) * 100 : 0,
        avgSpend: paying.length ? totalSpend / paying.length : 0,
        totalSpend,
        revenuePerDownload: group.length ? totalSpend / group.length : 0,
        totalCount: group.length,
        payingCount: paying.length,
      };
    });

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
  for (const u of allUsers) {
    if (u.app_store_region) (regionGroups[u.app_store_region] ||= []).push(u);
    if (u.country) {
      countryCounts[u.country] = (countryCounts[u.country] || 0) + 1;
      if (u.total_spent > 0) payingCountryCounts[u.country] = (payingCountryCounts[u.country] || 0) + 1;
    }
  }
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

  // Conversion by region — same shape/min-sample rule as convByJourney and
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
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const payingCountryData = Object.entries(payingCountryCounts)
    .map(([name, count]) => ({ name, count }))
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
      journeyData,
      heardData,
      convByGender,
      convByAge,
      convByExactAge,
      spendByGender,
      countryData,
      signupTrend,
      ageByCohort,
      convByJourney,
      convByChannel,
      prayerAnalysis: { avgCurrent, count: withPrayer.length },
      prayerDistribution,
      convByPrayer,
      spendDist,
      storeRegionData,
      convByRegion,
      platformData,
      platformCoverage,
      regionCoverage,
      userCountryData,
    payingCountryData,
      countryCoverage,
    },
  };
}
