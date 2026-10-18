/**
 * Shape of Able's `GET /marketing` report (computeMarketing in the API's
 * marketing.ts), plus the formatters the report pages share.
 *
 * Units: every amount is already a plain JS number in whole currency units.
 * The API converts USDT from micro units (fromMicro) and USD from integer
 * cents (/100) before sending, so nothing here needs rescaling. Deposits are
 * USDT on chain; card spend is USD from the card provider.
 *
 * Percentages are 0 to 100 with one decimal, and null when the base is zero
 * (an unknown rate, not 0%).
 */

export type KycState = "none" | "action_required" | "pending" | "approved" | "rejected" | "blocked";

export type FunnelStage = "signedUp" | "kycStarted" | "kycApproved" | "cardIssued" | "deposited" | "spender";

export interface MarketingUsers {
  total: number;
  newLast7d: number;
  newLast30d: number;
  referred: number;
  referredPct: number | null;
  activeLast7d: number;
  activeLast30d: number;
  avgAge: number | null;
}

export interface MarketingPlatform {
  label: string;
  users: number;
  activeLast30d: number;
}

export interface MarketingChainDeposits {
  chain: string;
  count: number;
  usdt: number;
}

export interface MarketingGiving {
  enrolled: number;
  roundup: number;
  enrolledCarded: number;
  pctOfCarded: number | null;
  pointsEarned: number;
  pointsRedeemed: number;
}

/** One Monday-start UTC week. The API always sends 12, oldest first, zero-filled;
 * the last one is the partial current week. */
export interface MarketingWeek {
  /** YYYY-MM-DD of the Monday. */
  weekStart: string;
  signups: number;
  referredSignups: number;
  depositUsdt: number;
  spendUsd: number;
  spenders: number;
}

/** Users grouped by signup month, with lifetime flags. */
export interface MarketingCohort {
  /** YYYY-MM (UTC). */
  month: string;
  signups: number;
  deposited: number;
  spenders: number;
}

/** Activity within a calendar month, zero-filled, at most 36 months. */
export interface MarketingMonth {
  /** YYYY-MM (UTC). */
  month: string;
  signups: number;
  depositUsdt: number;
  spendUsd: number;
  spenders: number;
}

export interface MarketingDeposits {
  count: number;
  totalUsdt: number;
  avgUsdt: number;
  perSignupUsdt: number;
}

export interface MarketingActivation {
  medianDaysToDeposit: number | null;
  medianDaysToSpend: number | null;
}

/** Masked roster row: phone is last 4 digits, date of birth reduced to a band. */
export interface MarketingRosterRow {
  userId: string;
  name: string;
  username: string | null;
  phoneMasked: string;
  /** ISO alpha-2 country of residence at signup. */
  country: string;
  ageBand: string | null;
  createdAt: string;
  referredBy: string | null;
  kyc: KycState | "card_issued";
  balanceUsdt: number;
  depositUsdt: number;
  spendUsd: number;
  txns: number;
  lastActiveAt: string;
}

export interface MarketingFunnelStage {
  stage: FunnelStage;
  count: number;
  /** Null for the first stage and when the previous stage is zero. */
  pctOfPrevious: number | null;
  pctOfAll: number | null;
}

export interface MarketingReferralCode {
  code: string;
  signups: number;
  kycApproved: number;
  carded: number;
  deposited: number;
  spenders: number;
  depositUsdt: number;
  spendUsd: number;
}

export interface MarketingAgeConversion {
  band: string;
  users: number;
  deposited: number;
  pct: number | null;
}

export interface MarketingCountryConversion {
  /** ISO alpha-2. Top 12 by users. */
  code: string;
  users: number;
  deposited: number;
  pct: number | null;
}

export interface MarketingCategorySpend {
  key: string;
  label: string;
  usd: number;
  count: number;
}

export interface MarketingMerchantSpend {
  merchant: string;
  usd: number;
  count: number;
}

export interface MarketingSpendBracket {
  bracket: string;
  users: number;
}

export interface MarketingSpend {
  netUsd: number;
  count: number;
  avgUsd: number;
  perSignupUsd: number;
  spenders: number;
  repeatSpenders: number;
  repeatPct: number | null;
  refunds: { count: number; usd: number };
  byCategory: MarketingCategorySpend[];
  /** Top 10 by net USD. */
  topMerchants: MarketingMerchantSpend[];
  brackets: MarketingSpendBracket[];
}

/**
 * Fields marked optional arrived in later API deploys. The Ops page hid the
 * matching sections until the running API served them, and these pages keep
 * that guard so an older deploy renders without them instead of crashing.
 */
export interface MarketingReport {
  generatedAt: string;
  users: MarketingUsers;
  platforms?: MarketingPlatform[];
  depositsByChain?: MarketingChainDeposits[];
  giving?: MarketingGiving;
  weekly: MarketingWeek[];
  monthlyCohorts: MarketingCohort[];
  monthly?: MarketingMonth[];
  deposits: MarketingDeposits;
  activation: MarketingActivation;
  roster?: MarketingRosterRow[];
  funnel: MarketingFunnelStage[];
  /** Sorted by signups, most first. */
  referralCodes: MarketingReferralCode[];
  conversionByAge: MarketingAgeConversion[];
  conversionByCountry: MarketingCountryConversion[];
  spend: MarketingSpend;
}

export const MARKETING_PATH = "/marketing";
export const MARKETING_REFRESH_MS = 5 * 60_000;

/** Amount with up to two decimals ("1,234.5"), as the Ops page showed money. */
export function fmtAmount(n: number | null | undefined): string {
  return n == null ? "-" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** "2026-09-07" to "Sep 7". Twelve weeks never span the same date twice. */
export function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "2026-09" to "Sep 26". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}
