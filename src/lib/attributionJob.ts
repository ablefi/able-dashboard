import { buildCreatorIndex, resolveSource, sourceSide, squash, LEGACY_ENUM_VALUES, type CreatorRow } from "@/lib/attribution";

/**
 * Who each creator actually brought in, from the onboarding "how did you hear
 * about us" answer.
 *
 * `heard` stopped being an enum on 15 Sep 2026 and is now free text, so the
 * answers are creator names typed by users. This turns those answers into
 * per-creator totals: attributed downloads, payers, revenue, and the
 * demographics of the people who named them.
 *
 * WHY THIS DOES NOT USE THE USER ANALYSIS CRAWL
 * That crawl pages all 247k users in the browser and takes minutes. It is not
 * needed here, because `/admin/users?heard=<value>` is a real filter: it
 * returns an accurate `meta.total` and full user records, in about half a
 * second. So the cost is one request per distinct spelling, not per user.
 *
 * THE TWO-PASS SHAPE, and why discovery comes first
 * The filter is EXACT match, so it can only be asked about spellings we
 * already know. We do not know them: "MominThebeliver" is not any creator's
 * name, handle or curated alias, and no amount of guessing would produce it.
 * So pass one pages recent signups to DISCOVER what people actually typed, and
 * pass two asks the filter about each discovered spelling to get totals across
 * all time, including users who answered long before this ran.
 *
 * Discovery only needs recent users because the question only started being
 * asked on 15 Sep. Totals are not limited that way: the per-spelling filter
 * counts everyone who ever gave that answer.
 */

export const ATTRIBUTION_KEY_PROD = "creator_attribution";
export const ATTRIBUTION_KEY_STAGING = "creator_attribution_staging";

/** When the free-text question went live. Nothing before this has an answer. */
export const ATTRIBUTION_SINCE = "2026-09-15";

type ApiUser = {
  totalSpent?: number;
  createdAt?: string;
  /** Active sessions ∪ devices. Usually exactly one entry. */
  platforms?: string[] | null;
  country?: string | null;
  appStoreRegion?: string | null;
  userProfile?: {
    age?: number | null;
    gender?: string | null;
    heard?: string | null;
  } | null;
};

export type Demographics = {
  /** How many of the attributed users gave an age. Read every average next to it. */
  ageCount: number;
  avgAge: number | null;
  ageBuckets: { name: string; count: number }[];
  gender: { name: string; count: number }[];
  countries: { code: string; count: number }[];
  /**
   * iOS vs Android. Counted per user, not per device: someone on both would
   * otherwise be counted twice and the split would not add up to the people
   * it describes. In practice that is 1 user in 4,000.
   */
  platforms: { name: string; count: number }[];
  /** How many of them report a platform at all, the honest denominator. */
  platformCount: number;
};

export type CreatorAttribution = {
  creatorId: string;
  name: string;
  downloads: number;
  payers: number;
  revenue: number;
  /** The exact strings users typed that resolved to this creator. */
  spellings: { raw: string; count: number }[];
  demographics: Demographics;
};

export type SourceTally = {
  id: string;
  display: string;
  type: string;
  downloads: number;
  payers: number;
  revenue: number;
};

export type UnmatchedAnswer = {
  demographics?: Demographics;
  raw: string;
  lastSeenAt?: string;
  downloads: number;
  payers: number;
  revenue: number;
};

export type AttributionPayload = {
  computedAt: string;
  since: string;
  /** Child account IDs share their persona’s attribution. */
  personaByAccount?: Record<string, string>;
  /** People: roster creators, biggest first. */
  creators: CreatorAttribution[];
  /** Places: channels and platforms. */
  places: SourceTally[];
  /** Named, but nobody we recognise. The review queue the owner maps by hand. */
  unmatched: UnmatchedAnswer[];
  totals: {
    answered: number;
    people: number;
    places: number;
    unknown: number;
    creatorRevenue: number;
    /** Distinct spellings discovered, a rough read on how messy input is. */
    distinctAnswers: number;
    /** Pages of recent signups read during discovery. */
    discoveryPages: number;
    /**
     * Platform mix across everyone who NAMED A CREATOR, not per creator and
     * not across all answers.
     *
     * Scoped that way deliberately. Counting every answer swept in Android
     * users whose stored value is a legacy enum from before the free-text
     * question existed, which made Android look represented when not one
     * Android user has answered the new question: 423 Android signups since
     * it went live, zero answers, against 37% of iOS signups answering.
     *
     * This is what tells you whether a creator's "100% iOS" is a fact about
     * their audience or about the build. The UI reads it rather than
     * hardcoding the caveat, so it stops warning by itself once Android ships.
     */
    platformMix: { name: string; count: number }[];
  };
};

/**
 * Three-year bands through the ages that matter, widening where the base thins.
 *
 * the owner's call, and the right one: the app skews young enough that "18-24"
 * swallowed most of a creator's audience and told you nothing. A creator whose
 * people are 14-16 is a different proposition from one whose people are 20-22,
 * and that difference was invisible at the old resolution.
 */
const AGE_BUCKETS = ["0-10", "11-13", "14-16", "17-19", "20-22", "23-25", "26-29", "30-34", "35-44", "45+"];
function ageBucket(age: number): string {
  if (age <= 10) return "0-10";
  if (age <= 13) return "11-13";
  if (age <= 16) return "14-16";
  if (age <= 19) return "17-19";
  if (age <= 22) return "20-22";
  if (age <= 25) return "23-25";
  if (age <= 29) return "26-29";
  if (age <= 34) return "30-34";
  if (age <= 44) return "35-44";
  return "45+";
}

function emptyDemographics(): Demographics {
  return { ageCount: 0, avgAge: null, ageBuckets: [], gender: [], countries: [], platforms: [], platformCount: 0 };
}

/** Accumulator that turns a pile of user records into one Demographics. */
class DemoBuilder {
  private ages: number[] = [];
  private gender = new Map<string, number>();
  private country = new Map<string, number>();
  private platform = new Map<string, number>();
  private platformUsers = 0;

  add(u: ApiUser) {
    const p = u.userProfile ?? {};
    const age = Number(p.age);
    if (Number.isFinite(age) && age > 0) this.ages.push(age);
    const bump = (m: Map<string, number>, k: string | null | undefined) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + 1);
    };
    bump(this.gender, p.gender);
    // appStoreRegion first: it is a clean storefront code, where `country`
    // holds whatever the device locale called the place.
    bump(this.country, (u.appStoreRegion ?? u.country ?? "").trim().toUpperCase() || null);

    // One vote per user. A user on both platforms is counted under the first
    // alphabetically rather than in both, so the slices sum to platformCount
    // and the pie is a share of people rather than of devices.
    const plats = (u.platforms ?? []).filter(Boolean).map((x) => String(x).toLowerCase()).sort();
    if (plats.length) {
      this.platformUsers++;
      bump(this.platform, plats[0]);
    }
  }

  build(): Demographics {
    const sorted = (m: Map<string, number>) =>
      [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const buckets = new Map<string, number>();
    for (const a of this.ages) buckets.set(ageBucket(a), (buckets.get(ageBucket(a)) ?? 0) + 1);
    return {
      ageCount: this.ages.length,
      avgAge: this.ages.length ? +(this.ages.reduce((a, b) => a + b, 0) / this.ages.length).toFixed(1) : null,
      ageBuckets: AGE_BUCKETS.filter((b) => buckets.has(b)).map((name) => ({ name, count: buckets.get(name)! })),
      gender: sorted(this.gender),
      countries: sorted(this.country).slice(0, 12).map((c) => ({ code: c.name, count: c.count })),
      platforms: sorted(this.platform),
      platformCount: this.platformUsers,
    };
  }
}

/**
 * One ceiling on backend requests in flight, shared by both levels of fanout.
 *
 * This job fans out twice: over answers, and over the pages of a single
 * answer. Those multiply, so raising either number alone quietly turns into a
 * burst against a backend that is not ours and never agreed to it. Everything
 * goes through here instead, and the two pool sizes become scheduling hints
 * rather than a concurrency figure.
 */
const MAX_IN_FLIGHT = 20;
let inFlight = 0;
const waiting: (() => void)[] = [];

async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

async function getJson(base: string, token: string, path: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await gate(() =>
        fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      );
      if (r.ok) return await r.json();
      if (r.status === 401 || r.status === 403) throw new Error("Attribution backend authorization failed");
    } catch {
      /* retry */
    }
    await new Promise((s) => setTimeout(s, 400 * 2 ** attempt));
  }
  throw new Error("Attribution backend request failed after retries");
}

/**
 * Pass one: what did people actually type?
 *
 * Users come back newest first, so this walks from page 1 and stops once it
 * reaches signups older than `since`. Nothing before that date was ever asked
 * the question, so reading further is wasted work.
 */
/** Discovery pages read at once. */
const DISCOVERY_BATCH = 8;

async function discoverAnswers(
  base: string,
  token: string,
  since: string,
  maxPages: number
): Promise<{ answers: Set<string>; pages: number }> {
  const answers = new Set<string>();
  const cutoff = new Date(since).getTime();
  let pages = 0;
  // Pages are read DISCOVERY_BATCH at a time rather than one after another
  // (35 sequential pages took ~60s of a 300s cron on 15 Oct 2026). A batch can
  // read a few pages past the cutoff. Those older users mostly gave legacy
  // enum answers, which are asked about anyway; the odd free-text answer from
  // an older account (one sent back through onboarding) is now found too.
  for (let first = 1; first <= maxPages; first += DISCOVERY_BATCH) {
    const batch = Array.from({ length: Math.min(DISCOVERY_BATCH, maxPages - first + 1) }, (_, i) => first + i);
    const results = await Promise.all(batch.map((page) => getJson(base, token, `/admin/users?page=${page}&limit=500`)));
    let done = false;
    for (const j of results) {
      const rows: ApiUser[] = j?.data ?? [];
      if (!rows.length) { done = true; continue; }
      pages++;
      for (const u of rows) {
        const h = (u.userProfile?.heard ?? "").trim();
        if (h) answers.add(h);
        if (u.createdAt && new Date(u.createdAt).getTime() < cutoff) done = true;
      }
    }
    if (done) break;
  }
  return { answers, pages };
}

/**
 * Every user who gave exactly this answer, across all time.
 *
 * The first page is read in full and its `meta.total` decides whether more
 * pages are needed; an answer nobody gave returns an empty page, which costs
 * no more than a count would.
 */
async function usersForAnswer(base: string, token: string, answer: string): Promise<ApiUser[]> {
  const q = encodeURIComponent(answer);
  // The first full page doubles as the count. Most answers are free text with
  // a handful of users, so a separate limit=1 probe used to double the
  // request count (6,855 requests, 209s on 15 Oct 2026, past the cron limit
  // from Vercel) for no saving: an empty page costs the same as a probe.
  const first = await getJson(base, token, `/admin/users?heard=${q}&page=1&limit=500`);
  const total = Number(first?.meta?.total ?? 0);
  if (!total) return [];
  const firstRows = ((first?.data ?? []) as Record<string, unknown>[]).map(slim);
  if (total <= 500) return firstRows;

  // Page to the total the probe just reported, rather than to a fixed ceiling.
  // The old limit of 40 pages stopped at 20,000 users and said nothing about
  // it, so "instagram" (48,187) would have been reported as 20,000 and looked
  // entirely plausible. The cap that remains is a runaway guard, not a limit
  // we expect to reach.
  //
  // The pages of one answer are fetched together, not one after another.
  // Three answers account for most of the users, and walking 97 pages of
  // Instagram in series was the single slowest thing this job did.
  const lastPage = Math.min(Math.ceil(total / 500), 600);
  const pages = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
  const chunks = await pooled(pages, 8, async (page) => {
    const j = await getJson(base, token, `/admin/users?heard=${q}&page=${page}&limit=500`);
    return ((j?.data ?? []) as Record<string, unknown>[]).map(slim);
  });
  return [...firstRows, ...chunks.flat()];
}

/**
 * Keep only the fields the aggregation reads.
 *
 * A user record is about 3KB, most of it settings and notification
 * preferences this job never looks at. Across every answer that is ~300MB of
 * JSON held at once, which is how a cron runs out of memory rather than time.
 * A projected row is a fraction of that.
 */
function slim(u: Record<string, unknown>): ApiUser {
  const p = (u.userProfile ?? null) as Record<string, unknown> | null;
  return {
    totalSpent: u.totalSpent as number | undefined,
    createdAt: u.createdAt as string | undefined,
    platforms: (u.platforms ?? null) as string[] | null,
    country: (u.country ?? null) as string | null,
    appStoreRegion: (u.appStoreRegion ?? null) as string | null,
    userProfile: p
      ? {
          age: (p.age ?? null) as number | null,
          gender: (p.gender ?? null) as string | null,
          heard: (p.heard ?? null) as string | null,
        }
      : null,
  };
}

/** Run `work` over `items` with a fixed number in flight. */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i]);
      }
    })
  );
  return out;
}

/**
 * Takes the backend base and token rather than resolving them itself, so this
 * stays a plain function with no Next.js or session dependency. The route
 * supplies them; a script can too.
 */
export async function computeAttribution(opts: {
  base: string;
  token: string;
  creators: CreatorRow[];
  decisions?: Record<string, { status: string; creatorId?: string; raw: string }>;
  since?: string;
  /** Discovery pages, a runaway guard only: discovery stops at the cutoff
   * date. 40 was reached on 15 Oct 2026 (~17,500 signups since 15 Sep), at
   * which point the oldest free-text answers would have gone uncounted. */
  maxDiscoveryPages?: number;
}): Promise<AttributionPayload | { error: string }> {
  const { base, token } = opts;
  if (!base || !token) return { error: "No backend base or token" };

  const since = opts.since ?? ATTRIBUTION_SINCE;
  const { answers, pages } = await discoverAnswers(base, token, since, opts.maxDiscoveryPages ?? 200);

  // Known spellings too, so a creator whose users all signed up before
  // discovery's window still gets counted.
  for (const c of opts.creators) {
    for (const k of [c.name, c.instagram_handle, c.tiktok_handle, c.youtube_handle, ...(c.attribution_names ?? [])]) {
      if (k && k.trim()) answers.add(k.trim());
    }
  }

  // The six pre-15-Sep enum values, always. Discovery only sees users who
  // signed up recently, so whether a bare enum value appears there depends on
  // which old app versions happen to still be in that window. On 21 Sep
  // "youtube" was in it and contributed 11,872 users; hours later it was not,
  // and contributed 66, which made the headline total halve on its own. These
  // six are known by name, so there is no reason to rediscover them.
  for (const v of LEGACY_ENUM_VALUES) answers.add(v);

  for (const decision of Object.values(opts.decisions ?? {})) answers.add(decision.raw);
  const idx = buildCreatorIndex(opts.creators);
  const unmatchedDemo = new Map<string, DemoBuilder>();
  const byCreator = new Map<string, { row: CreatorRow; downloads: number; payers: number; revenue: number; spellings: Map<string, number>; demo: DemoBuilder }>();
  const places = new Map<string, SourceTally>();
  const platformMix = new Map<string, number>();
  const unmatched = new Map<string, UnmatchedAnswer>();
  let answered = 0, peopleTotal = 0, placesTotal = 0, unknownTotal = 0;

  // Every distinct string is asked separately, and the answers are merged
  // afterwards by what they resolve to.
  //
  // Case matters here, which is easy to get backwards. `heard` is an EXACT,
  // case-sensitive filter: "instagram" matches 48,187 users and "Instagram"
  // matches 68, and those two sets are disjoint. Folding them together before
  // asking therefore does not save a duplicate request, it throws one of the
  // two sets away — whichever spelling happened to be seen second. That is how
  // Instagram, the single largest acquisition channel, reported 100 users, and
  // how YouTube's figure moved between 11,872 and 66 without anything
  // changing but the order discovery returned rows in.
  const toAsk: string[] = [...answers];

  // Fetched concurrently because this is hundreds of independent requests and
  // sequentially it took over two minutes, past what a cron should hold. The
  // aggregation below stays sequential so the result does not depend on the
  // order replies happen to arrive in.
  const fetched = await pooled(toAsk, 24, async (raw) => ({ raw, users: await usersForAnswer(base, token, raw) }));

  for (const { raw, users } of fetched) {
    if (!users.length) continue;

    const downloads = users.length;
    let payers = 0, revenue = 0;
    for (const u of users) {
      const spent = Number(u.totalSpent ?? 0);
      if (spent > 0) { payers++; revenue += spent; }
    }
    answered += downloads;

    const decision = opts.decisions?.[squash(raw) || raw.trim().toLowerCase()];
    const approved = decision?.status === "approved" ? opts.creators.find(c => c.id === decision.creatorId) : undefined;
    const resolved = resolveSource(raw, idx);
    const r = approved ? { type: "creator" as const, id: approved.id, display: approved.name, creator: approved }
      : sourceSide(resolved) === "places" ? resolved
      : (decision ? { type: "other" as const, id: "_other", display: "Named, awaiting attribution" } : resolved);
    const side = sourceSide(r);
    if (side === "unknown") { unknownTotal += downloads; continue; }

    if (r.type === "creator" && r.creator) {
      peopleTotal += downloads;
      const id = r.creator.id;
      let e = byCreator.get(id);
      if (!e) {
        e = { row: r.creator, downloads: 0, payers: 0, revenue: 0, spellings: new Map(), demo: new DemoBuilder() };
        byCreator.set(id, e);
      }
      e.downloads += downloads;
      e.payers += payers;
      e.revenue += revenue;
      e.spellings.set(raw, (e.spellings.get(raw) ?? 0) + downloads);
      for (const u of users) {
        e.demo.add(u);
        const plats = (u.platforms ?? []).filter(Boolean).map((x) => String(x).toLowerCase()).sort();
        if (plats.length) platformMix.set(plats[0], (platformMix.get(plats[0]) ?? 0) + 1);
      }
      continue;
    }

    if (side === "people") {
      // Named, but not anybody on the roster. This is the review queue.
      peopleTotal += downloads;
      const k = squash(raw) || raw.toLowerCase();
      const u0: UnmatchedAnswer = unmatched.get(k) ?? { raw, downloads: 0, payers: 0, revenue: 0 };
      u0.downloads += downloads; u0.payers += payers; u0.revenue += revenue;
      for (const u of users) {
        if (u.createdAt && Number.isFinite(Date.parse(u.createdAt)) && (!u0.lastSeenAt || Date.parse(u.createdAt) > Date.parse(u0.lastSeenAt))) u0.lastSeenAt = u.createdAt;
      }
      unmatched.set(k, u0);
      const demo = unmatchedDemo.get(k) ?? new DemoBuilder();
      users.forEach(u => demo.add(u));
      unmatchedDemo.set(k, demo);
      continue;
    }

    placesTotal += downloads;
    const p = places.get(r.id) ?? { id: r.id, display: r.display, type: r.type, downloads: 0, payers: 0, revenue: 0 };
    p.downloads += downloads; p.payers += payers; p.revenue += revenue;
    places.set(r.id, p);
  }

  const creators: CreatorAttribution[] = [...byCreator.values()]
    .map((e) => ({
      creatorId: e.row.id,
      name: e.row.name,
      downloads: e.downloads,
      payers: e.payers,
      revenue: +e.revenue.toFixed(2),
      spellings: [...e.spellings.entries()].map(([raw, count]) => ({ raw, count })).sort((a, b) => b.count - a.count),
      demographics: e.downloads ? e.demo.build() : emptyDemographics(),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.downloads - a.downloads);

  return {
    computedAt: new Date().toISOString(),
    since,
    creators,
    places: [...places.values()].sort((a, b) => b.downloads - a.downloads),
    unmatched: [...unmatched.entries()].map(([key,row]) => ({ ...row, demographics: unmatchedDemo.get(key)!.build() })).sort((a, b) => b.downloads - a.downloads),
    totals: {
      answered,
      people: peopleTotal,
      places: placesTotal,
      unknown: unknownTotal,
      creatorRevenue: +creators.reduce((s, c) => s + c.revenue, 0).toFixed(2),
      distinctAnswers: toAsk.length,
      discoveryPages: pages,
      platformMix: [...platformMix.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    },
  };
}
