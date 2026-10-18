/**
 * Country-code helpers for App Store / Play Store storefront regions.
 *
 * Values arrive in THREE shapes and all must render as flag + full English
 * name so nobody has to decode raw codes:
 *   • alpha-3 ("USA", "GBR", "DEU") — what Apple's storefront API actually
 *     returns, and what the iOS app sends. Intl can't read these, hence the
 *     alpha-3 → alpha-2 table below.
 *   • alpha-2 ("US", "GB") — the ISO short form.
 *   • full English names ("United Kingdom") — e.g. website page_views.
 * Names come from the runtime's Intl region database (no hand-kept name
 * list). Client + server safe.
 */

const ALPHA2 = /^[A-Z]{2}$/;
const ALPHA3 = /^[A-Z]{3}$/;

/** ISO 3166-1 alpha-3 → alpha-2. Needed because Intl.DisplayNames only
 * accepts alpha-2 (or numeric), while Apple storefronts report alpha-3. */
const ALPHA3_TO_ALPHA2: Record<string, string> = Object.fromEntries(
  (
    "AFG:AF ALA:AX ALB:AL DZA:DZ ASM:AS AND:AD AGO:AO AIA:AI ATA:AQ ATG:AG ARG:AR ARM:AM ABW:AW AUS:AU AUT:AT AZE:AZ " +
    "BHS:BS BHR:BH BGD:BD BRB:BB BLR:BY BEL:BE BLZ:BZ BEN:BJ BMU:BM BTN:BT BOL:BO BES:BQ BIH:BA BWA:BW BVT:BV BRA:BR " +
    "IOT:IO BRN:BN BGR:BG BFA:BF BDI:BI CPV:CV KHM:KH CMR:CM CAN:CA CYM:KY CAF:CF TCD:TD CHL:CL CHN:CN CXR:CX CCK:CC " +
    "COL:CO COM:KM COG:CG COD:CD COK:CK CRI:CR CIV:CI HRV:HR CUB:CU CUW:CW CYP:CY CZE:CZ DNK:DK DJI:DJ DMA:DM DOM:DO " +
    "ECU:EC EGY:EG SLV:SV GNQ:GQ ERI:ER EST:EE SWZ:SZ ETH:ET FLK:FK FRO:FO FJI:FJ FIN:FI FRA:FR GUF:GF PYF:PF ATF:TF " +
    "GAB:GA GMB:GM GEO:GE DEU:DE GHA:GH GIB:GI GRC:GR GRL:GL GRD:GD GLP:GP GUM:GU GTM:GT GGY:GG GIN:GN GNB:GW GUY:GY " +
    "HTI:HT HMD:HM VAT:VA HND:HN HKG:HK HUN:HU ISL:IS IND:IN IDN:ID IRN:IR IRQ:IQ IRL:IE IMN:IM ISR:IL ITA:IT JAM:JM " +
    "JPN:JP JEY:JE JOR:JO KAZ:KZ KEN:KE KIR:KI PRK:KP KOR:KR KWT:KW KGZ:KG LAO:LA LVA:LV LBN:LB LSO:LS LBR:LR LBY:LY " +
    "LIE:LI LTU:LT LUX:LU MAC:MO MDG:MG MWI:MW MYS:MY MDV:MV MLI:ML MLT:MT MHL:MH MTQ:MQ MRT:MR MUS:MU MYT:YT MEX:MX " +
    "FSM:FM MDA:MD MCO:MC MNG:MN MNE:ME MSR:MS MAR:MA MOZ:MZ MMR:MM NAM:NA NRU:NR NPL:NP NLD:NL NCL:NC NZL:NZ NIC:NI " +
    "NER:NE NGA:NG NIU:NU NFK:NF MKD:MK MNP:MP NOR:NO OMN:OM PAK:PK PLW:PW PSE:PS PAN:PA PNG:PG PRY:PY PER:PE PHL:PH " +
    "PCN:PN POL:PL PRT:PT PRI:PR QAT:QA REU:RE ROU:RO RUS:RU RWA:RW BLM:BL SHN:SH KNA:KN LCA:LC MAF:MF SPM:PM VCT:VC " +
    "WSM:WS SMR:SM STP:ST SAU:SA SEN:SN SRB:RS SYC:SC SLE:SL SGP:SG SXM:SX SVK:SK SVN:SI SLB:SB SOM:SO ZAF:ZA SGS:GS " +
    "SSD:SS ESP:ES LKA:LK SDN:SD SUR:SR SJM:SJ SWE:SE CHE:CH SYR:SY TWN:TW TJK:TJ TZA:TZ THA:TH TLS:TL TGO:TG TKL:TK " +
    "TON:TO TTO:TT TUN:TN TUR:TR TKM:TM TCA:TC TUV:TV UGA:UG UKR:UA ARE:AE GBR:GB USA:US UMI:UM URY:UY UZB:UZ VUT:VU " +
    "VEN:VE VNM:VN VGB:VG VIR:VI WLF:WF ESH:EH YEM:YE ZMB:ZM ZWE:ZW"
  )
    .split(/\s+/)
    .map((pair) => pair.split(":") as [string, string])
);

let display: Intl.DisplayNames | null | undefined;
function displayNames(): Intl.DisplayNames | null {
  if (display !== undefined) return display;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    display = null; // ancient runtime, fall back to raw codes
  }
  return display;
}

/** Normalize a stored region value to a trimmed uppercase code (or null). */
export function normalizeRegion(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v || null;
}

/** Any accepted code → alpha-2 (the only form Intl understands). null if
 * it's neither a known alpha-3 nor a 2-letter code. */
export function toAlpha2(code: string | null | undefined): string | null {
  const c = normalizeRegion(code);
  if (!c) return null;
  if (ALPHA2.test(c)) return c;
  if (ALPHA3.test(c)) return ALPHA3_TO_ALPHA2[c] ?? null;
  return null;
}

/** Emoji flag for an alpha-2 OR alpha-3 code ("USA"/"US" → 🇺🇸); "" if unknown. */
export function regionFlag(code: string | null | undefined): string {
  const c = toAlpha2(code);
  if (!c) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Full English name ("USA"/"US" → "United States"); falls back to the raw value. */
export function regionName(code: string | null | undefined): string {
  const raw = normalizeRegion(code);
  if (!raw) return "";
  const c = toAlpha2(raw);
  if (c) {
    try {
      const n = displayNames()?.of(c);
      if (n && n !== c) return n;
    } catch {
      /* invalid code — fall through to raw */
    }
  }
  return raw;
}

// ---- name → code (for values stored as English names, e.g. "United States") ----

/** Common variants that differ from the CLDR name in every locale we index. */
const NAME_ALIASES: Record<string, string> = {
  usa: "US", "united states of america": "US", america: "US",
  "соединённые штаты америки": "US", "соединенные штаты америки": "US",
  uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  uae: "AE",
  turkey: "TR", turkiye: "TR",
  palestine: "PS", "palestinian territories": "PS", palestina: "PS", filistin: "PS",
  "czech republic": "CZ", "republique tcheque": "CZ", "république tchèque": "CZ",
  burma: "MM", myanmar: "MM",
  "ivory coast": "CI",
  swaziland: "SZ",
  macedonia: "MK",
  "cape verde": "CV",
  "south korea": "KR", "north korea": "KP",
  "republic of the congo": "CG", "democratic republic of the congo": "CD",
  "hong kong ras chinoise": "HK",
};

/**
 * Locales whose country names we index alongside English.
 *
 * The app stores whatever the DEVICE called the country, so `country` arrives
 * as "Deutschland", "Türkiye", "Бельгия" or "Almanya" rather than an English
 * name or a code. Indexing English only left Germany split across three rows
 * (Deutschland 441, Germany 193, Almanya 1) and Switzerland across four, each
 * drawn as its own dot at its own size. Reading every locale's names collapses
 * them back onto one code.
 *
 * Ordered deliberately: English is first so it wins any collision, and later
 * locales only fill gaps.
 */
const NAME_LOCALES = [
  "en", "de", "fr", "es", "it", "nl", "sv", "nb", "da", "fi", "pl", "pt", "tr",
  "ar", "ru", "id", "ms", "ur", "fa", "bn", "hi", "cs", "hr", "ro", "el", "he",
  "ja", "ko", "zh", "zh-Hant", "th", "vi", "uk", "sr", "bg", "sk", "sl", "lt",
  "lv", "et", "hu", "az", "kk", "uz", "sq", "bs", "mk", "ka", "hy", "sw", "ha",
  "so", "ps", "sd", "ta", "te", "ml", "gu", "pa", "mr", "ne", "si", "km", "my",
  "mn", "af", "is", "ga", "cy", "eu", "gl", "ca", "be",
];

/**
 * Fold a country name to a comparison key.
 *
 * Handles the spelling drift that kept real countries out of the index: CLDR
 * writes "Bosnia & Herzegovina" where people type "Bosnia and Herzegovina",
 * uses a curly apostrophe in "Côte d’Ivoire", and drops the article that
 * "The Gambia" carries (128 users, the largest single miss). Applied to both
 * sides of the lookup, so the two always meet in the middle.
 */
function foldName(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u02bb`\u00b4]/g, "'")
    .replace(/\band\b/g, "&")
    .replace(/[,.]/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deprecated ISO alpha-2 codes the Intl database still resolves to a
 * CURRENT country name (e.g. UK→"United Kingdom", FX→"France"). Without this
 * skip they'd hijack the name index and produce broken flag glyphs (🇺🇰/🇫🇽
 * aren't real flags — GB/FR are). Closed historical list; doesn't grow. */
const DEPRECATED_CODES = new Set(["AN", "BU", "CS", "DD", "DY", "FX", "HV", "JT", "MI", "NH", "NQ", "PC", "PU", "PZ", "RH", "SU", "TP", "UK", "VD", "WK", "YD", "YU", "ZR"]);

let nameToCode: Map<string, string> | null = null;
/**
 * Lazily build country-name → alpha-2 across every locale in NAME_LOCALES,
 * plus the alias table. Memoized after first use.
 *
 * First writer wins, so English claims a name before any other locale can, and
 * the explicit aliases are applied last and override everything.
 *
 * The DEPRECATED_CODES skip is load-bearing, not tidiness: several dead codes
 * still resolve to a live country's name, and because the scan runs A→Z they
 * would win the race. "DD" (East Germany) returns "Germany", so without the
 * skip every German in the database lands on a country that stopped existing
 * in 1990 and renders as a broken flag glyph.
 */
function nameIndex(): Map<string, string> {
  if (nameToCode) return nameToCode;
  nameToCode = new Map();
  for (const locale of NAME_LOCALES) {
    let dn: Intl.DisplayNames;
    try {
      dn = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      continue; // locale unavailable in this runtime
    }
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a) + String.fromCharCode(b);
        if (DEPRECATED_CODES.has(code)) continue;
        try {
          const n = dn.of(code);
          if (!n || n === code) continue;
          const key = foldName(n);
          if (!nameToCode.has(key)) nameToCode.set(key, code);
        } catch {
          /* structurally valid but unassigned — skip */
        }
      }
    }
  }
  for (const [k, v] of Object.entries(NAME_ALIASES)) nameToCode.set(foldName(k), v);
  return nameToCode;
}

export function regionCodeFromName(name: string | null | undefined): string | null {
  const v = foldName(name ?? "");
  if (!v) return null;
  return nameIndex().get(v) ?? null;
}

/**
 * Flag + display label for ANY stored place value — an alpha-3 code ("USA"),
 * an alpha-2 code ("US"), or an English country name ("United States").
 * Codes expand to the full name; names keep their stored casing and gain a
 * flag when recognized; anything else comes back flagless with the raw
 * label. The one-stop helper for rendering geography.
 */
export function prettyPlace(value: string | null | undefined): { flag: string; label: string } {
  const v = (value ?? "").trim();
  if (!v) return { flag: "", label: "" };
  // alpha-3 first (Apple storefronts), then alpha-2 — both via toAlpha2.
  if (/^[A-Za-z]{2,3}$/.test(v) && toAlpha2(v)) return { flag: regionFlag(v), label: regionName(v) };
  const code = regionCodeFromName(v);
  return { flag: code ? regionFlag(code) : "", label: v };
}

// ---- full catalog (for pickers) ----

export type RegionOption = { alpha2: string; alpha3: string; name: string; flag: string };

let allRegions: RegionOption[] | null = null;
/**
 * Every country as {alpha2, alpha3, name, flag}, sorted by name — for
 * audience pickers where the admin chooses countries rather than reading
 * one back. Built off the same alpha-3 table so a picked value can be sent
 * in whichever form the field expects (`country` = alpha-2,
 * `appStoreRegion` = alpha-3, matching what the app sends).
 */
export function regionOptions(): RegionOption[] {
  if (allRegions) return allRegions;
  const seen = new Set<string>();
  const out: RegionOption[] = [];
  for (const [alpha3, alpha2] of Object.entries(ALPHA3_TO_ALPHA2)) {
    if (seen.has(alpha2)) continue;
    seen.add(alpha2);
    const name = regionName(alpha2);
    if (!name || name === alpha2) continue; // unassigned in this runtime
    out.push({ alpha2, alpha3, name, flag: regionFlag(alpha2) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  allRegions = out;
  return out;
}

/**
 * The code to SEND as an `appStoreRegion` filter: alpha-3 ("USA").
 *
 * Production's backend (until the backend team's region release) matches the stored
 * value exactly, and production users are stored as alpha-3, so "US" found
 * nobody (15 Oct: US 0 vs USA 8,026). The newer backend expands either form
 * to both, so alpha-3 is correct on both. Options and saved selections stay
 * alpha-2; only the query uses this.
 */
export function toRegionQueryCode(code: string): string {
  const alpha2 = toAlpha2(code);
  if (!alpha2) return code;
  return regionOptions().find((r) => r.alpha2 === alpha2)?.alpha3 ?? code;
}
