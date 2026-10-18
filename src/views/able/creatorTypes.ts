/**
 * Response shape of Able's GET /creators (creatorReport in apps/api/src/creators.ts).
 *
 * Units: feeCents is integer USD cents; every *Usd field is a USD number already
 * rounded to cents by the API (null when there is nothing to divide by);
 * depositUsdt is USDT rounded to micro units. Views, likes and comments are counts.
 * Signups, cards and spend are attributed by invite code; views come only from
 * counted posts. The two are never mixed.
 */

export type CreatorKind = "influencer" | "youtuber" | "ugc" | "brand";
export type CreatorStatus = "active" | "paused" | "ended";
export type PostPlatform = "instagram" | "tiktok" | "youtube";

export interface CreatorCodeStats {
  code: string;
  signups: number;
  carded: number;
}

export interface CreatorRow {
  id: string;
  name: string;
  /** Handles without the leading @. */
  instagramHandle: string | null;
  tiktokHandle: string | null;
  youtubeHandle: string | null;
  kind: CreatorKind;
  /** Upper-case invite codes attributed to this creator. */
  codes: string[];
  /** Agreed fee, integer USD cents. 0 for gifted or affiliate-only deals. */
  feeCents: number;
  dealNotes?: string;
  /** YYYY-MM-DD the deal started. */
  startedAt: string;
  status: CreatorStatus;
  lastScrapedAt: string | null;
  scrapeError: string | null;
  createdAt: string;
  updatedAt: string;

  feeUsd: number;
  daysLive: number;
  signups: number;
  kycApproved: number;
  carded: number;
  deposited: number;
  spenders: number;
  depositUsdt: number;
  spendUsd: number;
  perCode: CreatorCodeStats[];
  costPerSignupUsd: number | null;
  costPerCardUsd: number | null;
  costPerSpenderUsd: number | null;
  countedPosts: number;
  countedViews: number;
  countedLikes: number;
  countedComments: number;
  avgViewsPerPost: number;
  /** Scraped posts still waiting for an approve or exclude decision. */
  pendingPosts: number;
  lastPostedAt: string | null;
  cpmUsd: number | null;
}

export interface CreatorReportPost {
  id: string;
  creatorId: string;
  platform: PostPlatform;
  externalId: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string;
  /** Latest scrape. */
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: string;
  discoveredAt: string;
  approved: boolean;
  excluded: boolean;
  /** Feeds the creator's views and post totals under the counting rules. */
  counts: boolean;
  /** YouTube community post: no view count, never counts. */
  community: boolean;
}

export interface CreatorTotals {
  creators: number;
  active: number;
  feeUsd: number;
  signups: number;
  carded: number;
  spenders: number;
  spendUsd: number;
  costPerSignupUsd: number | null;
  costPerCardUsd: number | null;
  countedPosts: number;
  countedViews: number;
  pendingPosts: number;
  cpmUsd: number | null;
}

export interface CreatorsReport {
  generatedAt: string;
  scraping: { enabled: boolean; credits: { remaining: number; at: string } | null };
  totals: CreatorTotals;
  creators: CreatorRow[];
  unclaimedCodes: CreatorCodeStats[];
  /** Monday-start UTC weeks, counted posts by the week they were posted. */
  weeklyViews: Array<{ weekStart: string; views: number; posts: number }>;
  /** 30 UTC days, each counted post's latest snapshot carried forward. */
  viewSeries: Array<{ date: string; views: number }>;
  platforms: Array<{ platform: PostPlatform; views: number; posts: number }>;
  /** Last 90 days, newest first, capped by the API. */
  posts: CreatorReportPost[];
  kinds: CreatorKind[];
  statuses: CreatorStatus[];
}

export const CREATORS_PATH = "/creators";
export const CREATORS_REFRESH_MS = 5 * 60_000;

export const PLATFORM_LABEL: Record<PostPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function platformLabel(p: string): string {
  return PLATFORM_LABEL[p as PostPlatform] ?? p;
}

export function handleUrl(platform: PostPlatform, handle: string): string {
  const h = encodeURIComponent(handle);
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  return `https://www.youtube.com/@${h}`;
}

export function creatorHandles(c: Pick<CreatorRow, "instagramHandle" | "tiktokHandle" | "youtubeHandle">) {
  const out: Array<{ platform: PostPlatform; handle: string }> = [];
  if (c.instagramHandle) out.push({ platform: "instagram", handle: c.instagramHandle });
  if (c.tiktokHandle) out.push({ platform: "tiktok", handle: c.tiktokHandle });
  if (c.youtubeHandle) out.push({ platform: "youtube", handle: c.youtubeHandle });
  return out;
}

/** UTC calendar day of an ISO timestamp or YYYY-MM-DD, e.g. "Oct 3, 2026". The API
 * buckets by UTC day, so the label must not shift with the viewer's time zone. */
export function fmtDayUtc(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "-";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function updatedLabel(at: number | null): string | undefined {
  if (!at) return undefined;
  return `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/** What feeds a creator's counted posts and views (postCounts in apps/api/src/creators.ts). */
export const KIND_RULE: Record<CreatorKind, string> = {
  influencer: "Counts approved posts only: an @mention of our account or approved by hand.",
  youtuber: "Counts approved videos only: an @mention of our account or approved by hand.",
  ugc: "Counts every post that is not excluded.",
  brand: "Our own account. Counts every post that is not excluded.",
};

export const CREATOR_KINDS: CreatorKind[] = ["influencer", "youtuber", "ugc", "brand"];
export const CREATOR_STATUSES: CreatorStatus[] = ["active", "paused", "ended"];

export const STATUS_BADGE: Record<CreatorStatus, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  ended: "default",
};

/** Today as a UTC calendar day, YYYY-MM-DD. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Monday-start UTC week of an ISO timestamp, as YYYY-MM-DD (weekUtc in the API). */
export function weekStartUtc(iso: string): string {
  const d = new Date(iso);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/** Scraped, not approved, not excluded, and approval decides whether it counts. */
export const isPendingPost = (p: CreatorReportPost) => !p.approved && !p.excluded && !p.counts && !p.community;

/** One word for how a post stands under the counting rules. */
export function postState(p: CreatorReportPost): "Excluded" | "Counted" | "Community" | "Pending" | "Not counted" {
  if (p.excluded) return "Excluded";
  if (p.counts) return "Counted";
  if (p.community) return "Community";
  return isPendingPost(p) ? "Pending" : "Not counted";
}

/** A post is an outlier when its views are at least this multiple of its creator's median. */
export const OUTLIER_MULTIPLE = 3;
export const OUTLIER_RULE =
  "Views at least 3 times the creator's median views across their scraped posts in the last 90 days. YouTube community posts have no views and are left out.";

/** Median views per creator over their scraped posts that carry a view count. */
export function medianViewsByCreator(posts: CreatorReportPost[]): Map<string, number> {
  const views = new Map<string, number[]>();
  for (const p of posts) {
    if (p.community) continue;
    (views.get(p.creatorId) ?? views.set(p.creatorId, []).get(p.creatorId)!).push(p.viewCount);
  }
  const out = new Map<string, number>();
  for (const [id, list] of views) {
    const s = [...list].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    out.set(id, s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
  }
  return out;
}

/** Views as a multiple of the creator's median, when the post is an outlier. */
export function outlierMultiple(p: CreatorReportPost, medians: Map<string, number>): number | null {
  if (p.community) return null;
  const median = medians.get(p.creatorId);
  if (!median || median <= 0) return null;
  const x = p.viewCount / median;
  return x >= OUTLIER_MULTIPLE ? x : null;
}

/** Body of POST /creators. feeCents is integer USD cents. */
export interface CreatorWriteBody {
  id?: string;
  name: string;
  kind: CreatorKind;
  status: CreatorStatus;
  instagramHandle: string;
  tiktokHandle: string;
  youtubeHandle: string;
  codes: string[];
  feeCents: number;
  dealNotes: string;
  startedAt: string;
}

/** POST /creators/<id>/refresh returns errors; POST /creators/refresh returns creators and failed. */
export interface FeedRefreshResult {
  creators?: number;
  inserted: number;
  updated: number;
  failed?: number;
  errors?: string[];
}

export type PostFlagAction = "approve" | "unapprove" | "exclude" | "restore";

/** Same bodies the old Ops page sent: excluding also clears approval. */
export function postFlagBody(action: PostFlagAction): { approved?: boolean; excluded?: boolean } {
  if (action === "approve") return { approved: true };
  if (action === "unapprove") return { approved: false };
  if (action === "exclude") return { excluded: true, approved: false };
  return { excluded: false };
}
