"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ThumbsUp, MessageCircle } from "lucide-react";
import { postCounts, type CreatorType } from "@/lib/creators";
import { PlatformBadge } from "./PlatformBadge";
import { PostActions, OutlierToggle } from "./PostActions";
import { ExpandableCaption, Sparkline, thumbUrl, fmtCompact, fmtRelative } from "./PostBits";

export interface CardPost {
  id: string;
  creator_id: string;
  platform: "instagram" | "tiktok" | "youtube";
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  posted_at: string;
  approved: boolean;
  excluded: boolean;
  is_outlier: boolean;
  series?: { view_count: number }[];
}

/**
 * Post card — ported from jp-creators' creator-detail PostCard. Thumbnail
 * with PlatformBadge overlay (top-left) + OutlierToggle (top-right),
 * "Excluded / Not counted" veil, expandable caption, views/likes/comments,
 * cyan view-history sparkline, and the teal/rose PostActions row.
 *
 * Variants: vertical (9:13 Reels/Shorts/TT) | landscape (16:9 long-form YT)
 * | square (YT community posts).
 */
export function PostCard({
  post,
  creatorType,
  attribution,
  variant = "vertical",
  onChanged,
}: {
  post: CardPost;
  creatorType: CreatorType;
  /** Persona view: which child account this post belongs to. */
  attribution?: { name: string; slug: string };
  variant?: "vertical" | "landscape" | "square";
  /** Bubbles up after approve/exclude/outlier so the page recomputes totals. */
  onChanged?: () => void;
}) {
  const [thumbErr, setThumbErr] = useState(false);
  const counted = postCounts(creatorType, post);
  const series = (post.series ?? []).map((s) => s.view_count);
  const isInfluencer = creatorType === "influencer" || creatorType === "youtuber";
  const tUrl = thumbUrl(post);
  const mediaAspect = variant === "landscape" ? "aspect-video" : variant === "square" ? "aspect-square" : "aspect-[9/13]";

  return (
    <div
      className={
        "overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40 transition-all hover:-translate-y-0.5 hover:border-jp-blue/25 hover:shadow-[0_8px_24px_-12px_rgba(59,130,246,0.35)] " +
        (post.is_outlier ? "ring-1 ring-jp-gold/30" : "")
      }
    >
      <div className={"relative bg-jp-navy-light/40 " + mediaAspect}>
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full" aria-label="Open post on its platform">
          {tUrl && !thumbErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setThumbErr(true)} />
          ) : null}
          {!counted && (
            <div className="absolute inset-0 flex items-center justify-center bg-jp-navy/80 text-[10px] uppercase tracking-wider text-ink-muted">
              {post.excluded ? "Excluded" : "Not counted"}
            </div>
          )}
        </a>
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10">
          <PlatformBadge platform={post.platform} size="sm" url={post.url} creatorType={creatorType} />
        </div>
        <OutlierToggle postId={post.id} initialOutlier={post.is_outlier} onChanged={onChanged} />
      </div>

      <div className="p-2.5">
        {attribution && (
          <Link href={`/creators/${attribution.slug}`} className="mb-1 inline-block truncate text-[10px] text-ink-muted hover:text-ink">
            {attribution.name} →
          </Link>
        )}
        <ExpandableCaption text={post.caption} className="text-[11px] leading-snug text-ink" />

        <div className="mt-2 flex items-center justify-between gap-1.5 text-[10px] text-ink-muted">
          <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /><span className="num">{fmtCompact(post.view_count)}</span></span>
          <span className="flex items-center gap-0.5"><ThumbsUp className="h-2.5 w-2.5" /><span className="num">{fmtCompact(post.like_count)}</span></span>
          <span className="flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" /><span className="num">{fmtCompact(post.comment_count)}</span></span>
        </div>

        {series.length > 1 && (
          <div className="mt-2 text-jp-cyan">
            <Sparkline values={series} className="text-jp-cyan" height={18} />
          </div>
        )}

        <div className="mt-2 text-[10px] text-ink-faint">{fmtRelative(post.posted_at)}</div>

        <div className="mt-2 border-t border-jp-blue/10 pt-2">
          <PostActions
            postId={post.id}
            initialApproved={post.approved}
            initialExcluded={post.excluded}
            initialOutlier={post.is_outlier}
            isInfluencer={isInfluencer}
            layout="row"
            showOutlierToggle={false}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}
