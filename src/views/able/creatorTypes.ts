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
