/**
 * Turning a typed answer into a creator, a channel, or nothing.
 *
 * One resolver for the onboarding "how did you hear about us" answer (and any
 * other place a person types a creator's name), so every screen agrees about
 * who a creator is.
 *
 * It exists because people do not type names the way a database wants them.
 * In one day of live `heard` answers the same creator arrives as "JaneDoeVlogs",
 * "Jane doe vlogs", "janedoe" and "YouTube Jane Doe", and the same platform as
 * "Tiktok", "TikTok", "Tictok" and "On TikTok".
 * Without the generic buckets in particular, the top of any creator leaderboard
 * is the word "Tiktok".
 *
 * PLACES vs PEOPLE, the split the dashboard reports on:
 *   people  — a named individual: a roster creator, a name we do not recognise,
 *             or an unnamed "some influencer".
 *   places  — a channel or platform, including word of mouth. Friend-and-family
 *             is a person in the everyday sense, but it is an acquisition
 *             CHANNEL here, and it is already one of the six original enum
 *             values, so it stays on the places side.
 *   unknown — "idk", "can't remember", blank.
 */

export type SourceType =
  | "creator"
  | "tiktok"
  | "youtube"
  | "instagram"
  | "app_store"
  | "word_of_mouth"
  | "chatgpt"
  | "unknown"
  | "other";

export interface CreatorRow {
  id: string;
  name: string;
  type: string;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  youtube_handle: string | null;
  /** Curated spellings that belong to this creator. Agent-maintained, kept out
   * of the dashboard UI by the owner's explicit decision. Optional so callers that
   * never selected the column still type-check. */
  attribution_names?: string[] | null;
  parent_id?: string | null;
}

/**
 * Squash a string for matching: lowercase, strip @s/diacritics, drop every
 * non-alphanumeric. "Abdul Qahar", "@abdul.qahar", "AbdulQahar!" → "abdulqahar".
 */
export function squash(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9؀-ۿ]/g, "");
}

/** Edit distance with early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

export type IndexEntry = { c: CreatorRow; exactOnly: boolean };

/** Referrals that mean "the app itself" — never attribute these to a
 * creator (some UGC creators run handles containing the brand name). */
/** The pre-15-Sep-2026 enum values, matched exactly. */
const LEGACY_ENUM: Record<string, { type: SourceType; id: string; display: string }> = {
  app_store: { type: "app_store", id: "_app_store", display: "App Store / Play Store" },
  word_of_mouth: { type: "word_of_mouth", id: "_word_of_mouth", display: "Word of mouth (friend / family)" },
  tiktok: { type: "tiktok", id: "_tiktok", display: "TikTok (generic)" },
  instagram: { type: "instagram", id: "_instagram", display: "Instagram (generic)" },
  facebook: { type: "other", id: "_facebook", display: "Facebook" },
  youtube: { type: "youtube", id: "_youtube", display: "YouTube (generic)" },
};

/**
 * The same six values as a list, for callers that need to ASK about them
 * rather than recognise them.
 *
 * The attribution job discovers spellings by reading recent signups, which
 * works for free text but not for these: they were written by a version of the
 * app that no longer asks the question that way, so whether one shows up in a
 * rolling window of recent users is luck. It is the difference between
 * counting 48,187 Instagram users and counting none of them, so the job seeds
 * these unconditionally instead of hoping to rediscover them.
 */
export const LEGACY_ENUM_VALUES = Object.keys(LEGACY_ENUM);

/** Answers that name the app itself, squashed (lowercase letters and digits
 * only). Add your own spellings in BRAND_SELF_NAMES, comma separated. */
const SELF_KEYS = new Set([
  "theapp", "thisapp", "theappitself",
  ...(process.env.BRAND_SELF_NAMES || "").split(",").map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean),
]);

export function buildCreatorIndex(creators: CreatorRow[]): Map<string, IndexEntry> {
  const idx = new Map<string, IndexEntry>();
  const put = (key: string | null | undefined, c: CreatorRow, exactOnly = false) => {
    if (!key) return;
    const k = squash(key);
    if (k.length >= 3 && !SELF_KEYS.has(k) && !idx.has(k)) idx.set(k, { c, exactOnly });
  };
  for (const c of creators) {
    put(c.name, c);
    put(c.instagram_handle, c);
    put(c.tiktok_handle, c);
    put(c.youtube_handle, c);
    // First name alone is allowed only as an EXACT match ("Maryam" → Maryam
    // Kamal) — never as a substring, so "Ibrahim Abdulai" can't hit "Abdul".
    const first = c.name.split(/\s+/)[0];
    if (first && first.length >= 5) put(first, c, true);
    // Curated spellings last: they are deliberate, so they may be short and
    // are matched exactly rather than as substrings.
    for (const alias of c.attribution_names ?? []) put(alias, c, true);
  }
  return idx;
}

/** Misspellings and translations the owner confirmed as AI assistants in the review
 * queue (Oct 2026). Exact answers only, compared squashed: too loose to be terms. */
const REVIEWED_AI_ALIASES = new Set([
  "Chat got", "Chat g p t", "Chatcp", "Chatgp", "Cha GPT", "ChaGPT", "Cgpt", "Gbt", "Ghat gbt", "Ghat GPT",
  "Gemenai", "Gemnini", "من Gamini", "Hey Siri", "IA", "Vom KI",
  "I aska chatgbt , I say give the best app to pary",
  "شات", "شات جيبيتي", "شات جبيتي", "شاتجيبتي", "شات جب تي", "تشات جي بي تي", "جات جبتي",
  "من شات جي بي تي", "من شات جيبتي", "من شات ي بي تي",
  "ذكاء الاصطناعي", "من الذكاء الاصطناعي", "اقتراحات الذكاء الاصطناعي", "تطبيق ذكاء صناعي نصحتي بك",
].map(squash));

/** Whole terms only: never match AI inside a name such as Faisal or Claudette.
 * Keep the historical bucket id so existing analytics can merge without duplication. */
export function aiAssistantSource(raw: string | null | undefined) {
  const text = raw?.normalize("NFKC").toLowerCase().trim() ?? "";
  const term = /(?:^|[^\p{L}\p{N}])(?<!['’])(?:a\.?i\.?|artificial\s+intelligence|chat[\s-]*gpt|gpt|claude|gemini|copilot|perplexity|grok|deepseek|yapay\s+zeka|جات جي بي تي|شات جي بي تي|جارج جيبتي|الذكاء الاصطناعي)(?=$|[^\p{L}\p{N}])/u;
  return (term.test(text) || REVIEWED_AI_ALIASES.has(squash(text)))
    ? { type: "chatgpt" as const, id: "_chatgpt", display: "AI assistants" } : null;
}

function matchGenericSource(raw: string): { type: SourceType; id: string; display: string } | null {
  const ai = aiAssistantSource(raw);
  if (ai) return ai;
  // Normalize curly apostrophes → straight so "don't remember" matches.
  const s = raw.toLowerCase().replace(/[’‘]/g, "'").trim();
  // `keywords` match anywhere in the string; `whole` must match a complete
  // word. Short terms belong in `whole` — plain substring matching on a
  // three-letter word silently swallows names that happen to contain it.
  // Diacritics stripped before splitting: the token pattern treats "é" as a
  // separator, so "Un créateur" split into "cr" and "ateur" and the whole-word
  // "createur" could never match.
  const tokens = new Set(
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9\u0600-\u06ff]+/).filter(Boolean)
  );
  const generics: { keywords: string[]; type: SourceType; id: string; display: string; whole?: string[] }[] = [
    { keywords: ["app store", "appstore", "apple store", "play store", "google play", "app search", "app store search", "apple"], type: "app_store", id: "_app_store", display: "App Store / Play Store" },
    { keywords: ["tiktok", "tik tok", "ticktock", "tick tock", "tic tok", "ticktok", "tictok", "تيك توك", " tt ", "on tt", "from tt"], type: "tiktok", id: "_tiktok", display: "TikTok (generic)" },
    { keywords: ["youtube", "you tube", "yt ", " yt", "on yt", "from yt"], type: "youtube", id: "_youtube", display: "YouTube (generic)" },
    { keywords: ["instagram", "insta", " ig", "insta gram", "instgram", "instagran", "instergram", "instragram", "انستغرام", "انستقرام"], type: "instagram", id: "_instagram", display: "Instagram (generic)" },
    { keywords: ["facebook", "face book"], type: "other", id: "_facebook", display: "Facebook" },
    { keywords: ["snapchat", "snap chat"], type: "other", id: "_snapchat", display: "Snapchat" },
    { keywords: ["reddit"], type: "other", id: "_reddit", display: "Reddit" },
    { keywords: ["pinterest"], type: "other", id: "_pinterest", display: "Pinterest" },
    { keywords: ["twitter", " x app", "on x", "on twitter"], type: "other", id: "_twitter", display: "X (Twitter)" },
    { keywords: ["google", "search", "searched", "search engine", "safari", "browser", "on google", "بحثت"], type: "other", id: "_google", display: "Google / Search" },
    { keywords: ["advertisement", "advert", "an ad", "a ad", "sponsored", "paid ad", "saw an ad"], type: "other", id: "_ad", display: "Advertisement / ad" },
    { keywords: ["social media", "socialmedia", "social meadia"], type: "other", id: "_social", display: "Social media (unspecified)" },
    { keywords: ["online", "the internet", "internet"], type: "other", id: "_online", display: "Online (unspecified)" },
    { keywords: ["myself", "my self", "on my own", "by myself", "my own", "found it"], type: "other", id: "_self_found", display: "Found it myself" },
    // Bare "creator" is safe here despite running before the looser creator
    // steps, because exact and name-in-sentence matching already ran: a real
    // roster creator has been claimed by now. The non-English forms are here
    // because the answers arrive in the user's own language, and "Ein creator"
    // was landing in the unmatched review queue as if it named somebody.
    { keywords: ["influencer", "an influencer", "some influencer", "a creator"], type: "other", id: "_influencer", display: "Influencer (unnamed)",
      whole: ["creator", "createur", "créateur", "creador", "ersteller"] },
    { keywords: ["friend", "freind", "frend", "family", "word of mouth", "mum", "my mum", "mom", "sister", "brother", "cousin", "grandma", "grandmother", "grandpa", "grandad", "my dad", "my father", "my son", "my daughter", "my wife", "my husband", "uncle", "auntie", "aunty", "صديق", "family member",
      ], type: "word_of_mouth", id: "_word_of_mouth", display: "Word of mouth (friend / family)",
      // Whole words only. These are short and would otherwise match inside a
      // name: "ami" sits in "Rami AlKaleel", which this very list sent to word
      // of mouth instead of the creator Rami Al Khalil.
      whole: ["ami", "amis", "amie", "amigo", "amiga", "freund", "freunde", "arkadas", "arkadaş",
              "teman", "kawan", "sahabat", "przyjaciel", "vriend", "van", "ven", "vanner"] },
    {
      keywords: [
        "forgot", "forget", "don't know", "dont know", "idk", "no one", "nobody", "nothing", "none",
        "don't remember", "dont remember", "can't remember", "cant remember", "remember not", "remember",
        "not sure", "idr", "random", "a video", "لا اعرف", "لا أعرف",
      ],
      type: "unknown",
      id: "_unknown",
      display: "Unknown / not specified",
    },
  ];
  for (const g of generics) {
    for (const kw of g.keywords) {
      if (s.includes(kw)) return { type: g.type, id: g.id, display: g.display };
    }
    if (g.whole?.some((w) => tokens.has(w))) return { type: g.type, id: g.id, display: g.display };
  }
  return null;
}

/**
 * Normalize a raw referral string to a creator or generic-source bucket.
 *
 * Matching ladder (each step only runs if the previous found nothing):
 *  1. exact squashed match ("@Abdul.Qahar " → "abdulqahar")
 *  2. creator key contained in the referral ("via abdul qahar on insta")
 *  3. generic buckets (tiktok / instagram / friend / idk …) — BEFORE the
 *     looser steps so "tiktok" can never fuzzy-hit a creator handle
 *  4. referral contained in a creator key ("maryam" → maryamkamall)
 *  5. fuzzy: edit distance ≤1 (≤2 for long keys) on the whole referral and
 *     on its word tokens/adjacent pairs — catches misspellings like
 *     "abdul kahar" or "razkiya"
 */
export function resolveSource(
  raw: string | null,
  idx: Map<string, IndexEntry>
): { type: SourceType; id: string; display: string; creator?: CreatorRow } {
  if (!raw || !raw.trim()) {
    return { type: "unknown", id: "_unknown", display: "Unknown / not specified" };
  }
  const lower = raw.toLowerCase().replace(/^@+/, "").trim();
  const sq = squash(raw);
  const hit = (c: CreatorRow) => ({ type: "creator" as const, id: c.id, display: c.name, creator: c });

  // 0a. The six original enum values, stored verbatim before `heard` went
  //     free text on 15 Sep 2026. They are exact tokens, not prose, and they
  //     must be caught before anything else: "app_store" carries an underscore
  //     so it never matched the "app store" keyword, and 5,050 users were being
  //     filed as if they had named an unrecognised person.
  const legacy = LEGACY_ENUM[lower];
  if (legacy) return legacy;

  // 0b. self-references (the app's own name or handle) are never creators
  if (SELF_KEYS.has(sq)) return { type: "other", id: "_self", display: "The app (self-reference)" };

  // 1. exact squashed (all keys, incl. first names)
  if (sq.length >= 3 && idx.has(sq)) return hit(idx.get(sq)!.c);

  // 2. key inside referral (full names/handles only).
  //    A key under 6 characters must start the answer. Plain "contains" put
  //    "My dad sent me a TikTok from Brooke Alizabeth" on a creator called
  //    Liza, because "liza" sits inside "alizabeth", and handed her the
  //    user's $39.99. Anchoring keeps "MominTheBeliever" → Momin, which
  //    starts at index 0, while rejecting a name buried mid-word.
  for (const [key, e] of idx.entries()) {
    if (e.exactOnly || key.length < 4) continue;
    const at = sq.indexOf(key);
    if (at === 0 || (at > 0 && key.length >= 6)) return hit(e.c);
  }

  // 3. generic buckets
  const generic = matchGenericSource(lower);
  if (generic) return generic;

  // 4. referral inside a key — partial name ("razki" → "razkia"), guarded so
  //    a stray common word can't claim a long key.
  if (sq.length >= 6) {
    for (const [key, e] of idx.entries()) {
      if (!e.exactOnly && key.includes(sq) && sq.length >= key.length * 0.5) return hit(e.c);
    }
  }

  // 5. fuzzy (misspellings). Whole-string candidates may also fuzz against
  //    first-name keys; in-sentence tokens only against full keys.
  const tokens = lower.split(/[^a-z0-9؀-ۿ]+/).filter((t) => t.length >= 5);
  const candidates = new Set<string>([sq]);
  for (let i = 0; i < tokens.length && candidates.size < 12; i++) {
    candidates.add(tokens[i]);
    if (i + 1 < tokens.length) candidates.add(tokens[i] + tokens[i + 1]);
  }
  for (const cand of candidates) {
    if (cand.length < 5) continue;
    const max = cand.length >= 9 ? 2 : 1;
    for (const [key, e] of idx.entries()) {
      if (e.exactOnly && cand !== sq) continue;
      if (Math.abs(key.length - cand.length) > max) continue;
      if (editDistance(cand, key, max) <= max) return hit(e.c);
    }
  }

  return { type: "other", id: "_other", display: "Other (named but unmatched)" };
}


/**
 * True when the bucket is a named individual rather than a channel.
 *
 * "Influencer (unnamed)" is deliberately NOT a person here. "A creator" tells
 * you the channel was a creator, but it names nobody, so it can never be
 * credited to anyone and it does not belong in a queue of names to map. It
 * sits with the other unspecific sources instead.
 */
export function isPerson(r: { type: SourceType; id: string }): boolean {
  return r.type === "creator" || r.id === "_other";
}

/** True when we could not tell what the answer meant. */
export function isUnknownSource(r: { type: SourceType }): boolean {
  return r.type === "unknown";
}

/** places | people | unknown — the three columns the dashboard reports on. */
export function sourceSide(r: { type: SourceType; id: string }): "people" | "places" | "unknown" {
  if (isUnknownSource(r)) return "unknown";
  return isPerson(r) ? "people" : "places";
}

/** Classify established channels without a roster. Used to clean old review
 * snapshots where a pending decision had hidden a known platform. */
export function knownPlaceSource(raw: string) {
  const source = resolveSource(raw, new Map());
  return sourceSide(source) === "places" ? source : null;
}
