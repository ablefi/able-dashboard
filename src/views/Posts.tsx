"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Eye, Star, Trophy, Layers } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Empty from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { slugForCreator, type CreatorType } from "@/lib/creators";
import { resolveTimeframe } from "@/lib/timeframe";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { useCreatorTimeframe } from "@/components/creators/useCreatorTimeframe";
import { PlatformBadge } from "@/components/creators/PlatformBadge";
import { PostActions } from "@/components/creators/PostActions";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { ExpandableCaption, thumbUrl, fmtCompact, fmtRelative } from "@/components/creators/PostBits";

interface FeedPost {
  id: string; platform: "instagram" | "tiktok" | "youtube"; url: string; thumbnail_url: string | null;
  caption: string | null; view_count: number; posted_at: string;
  approved: boolean; excluded: boolean; is_outlier: boolean;
  creator: { id: string; name: string; type: CreatorType; profile_image_url: string | null; instagram_handle: string | null; tiktok_handle: string | null; youtube_handle: string | null };
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const inputCls = "rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

export default function Posts() {
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [topTen, setTopTen] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all");
  const [state, setState] = useState("counted");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tf, setTf] = useCreatorTimeframe();

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fromISO, toISO } = resolveTimeframe(tf);
      const p = new URLSearchParams({ platform, state, sort, from: fromISO, to: toISO });
      if (debounced) p.set("search", debounced);
      const res = await fetch(`/api/creators/posts?${p}`, { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      const d = await res.json();
      setFeed(d.feed);
      setTopTen(d.topTen);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [platform, state, sort, debounced, tf]);

  useEffect(() => { load(); }, [load]);

  const tfLabel = resolveTimeframe(tf).label;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Posts"
        subtitle={`${feed.length} post${feed.length === 1 ? "" : "s"} matching · ${tfLabel.toLowerCase()} · ${topTen.length} in top 10`}
        actions={<TimeframeFilter value={tf} onChange={setTf} />}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={inputCls + " w-52 pl-8"} placeholder="Search caption text…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="yt_short">YouTube Shorts</option>
          <option value="yt_community">YouTube Community</option>
          <option value="yt_video">YouTube Videos</option>
        </select>
        <select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}>
          <option value="counted">Counted (approved + UGC)</option>
          <option value="needs_review">Needs influencer review</option>
          <option value="excluded">Excluded</option>
          <option value="all">All posts</option>
        </select>
        <select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="views">Most views</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* MAIN FEED */}
        <main>
          {loading && feed.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading…</div>
          ) : feed.length === 0 ? (
            <Empty title="No posts to show" description="Try a different search, filter, or timeframe." icon={<Layers className="h-5 w-5" />} />
          ) : (
            <div className={cn("overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40", loading && "opacity-60")}>
              <ul className="divide-y divide-white/[0.06]">
                {feed.map((p) => <FeedRow key={p.id} p={p} />)}
              </ul>
            </div>
          )}
        </main>

        {/* TOP 10 SIDEBAR */}
        <aside>
          <div className="rounded-xl border border-white/[0.06] bg-jp-navy-card/40 p-4">
            <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
              <Trophy className="h-4 w-4 text-jp-gold" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-jp-gold">Top 10 by views</h2>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-faint">Counted · all time</span>
            </div>
            {topTen.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">No counted posts yet — approve some influencer/YouTuber posts to populate this.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {topTen.map((p, i) => <li key={p.id}><TopTenRow rank={i + 1} p={p} /></li>)}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Wide feed row — thumb, platform badge, creator chip, caption, actions. */
function FeedRow({ p }: { p: FeedPost }) {
  const isInfluencer = p.creator.type === "influencer" || p.creator.type === "youtuber";
  const counted = isInfluencer ? p.approved && !p.excluded : !p.excluded;
  const t = thumbUrl(p);

  return (
    <li className="group relative flex items-start gap-4 p-4 transition-colors hover:bg-white/[0.02]">
      <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Open post" className="absolute inset-0 z-0">
        <span className="sr-only">Open post on {p.platform}</span>
      </a>

      <div className="pointer-events-none relative z-[1] h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-jp-navy-light/40 ring-1 ring-white/[0.06]">
        {t ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
        ) : null}
        {p.is_outlier && (
          <div className="absolute left-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-jp-gold/90 text-jp-navy">
            <Star className="h-2.5 w-2.5 fill-current" />
          </div>
        )}
        {!counted && (
          <div className="absolute inset-0 flex items-center justify-center bg-jp-navy/80 text-[9px] uppercase tracking-wider text-ink-faint">
            {p.excluded ? "Excl" : ""}
          </div>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <PlatformBadge platform={p.platform} size="sm" url={p.url} creatorType={p.creator.type} />
          <Link href={`/creators/${slugForCreator(p.creator)}`} className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink">
            <CreatorAvatar name={p.creator.name} src={p.creator.profile_image_url} size="xs" />
            {p.creator.name}
          </Link>
          <span className="text-ink-faint/40">·</span>
          <span className="text-xs text-ink-faint">{fmtRelative(p.posted_at)}</span>
        </div>

        <div className="pointer-events-auto">
          <ExpandableCaption text={p.caption} className="mt-2 text-sm text-ink" />
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-ink-muted">
          <span className="num flex items-center gap-1"><Eye className="h-3 w-3" />{fmtCompact(p.view_count)} views</span>
        </div>
      </div>

      <div className="relative z-[1] flex w-40 flex-shrink-0">
        <PostActions
          postId={p.id}
          initialApproved={p.approved}
          initialExcluded={p.excluded}
          initialOutlier={p.is_outlier}
          isInfluencer={isInfluencer}
          layout="stack"
        />
      </div>
    </li>
  );
}

/** Compact rank-numbered row in the Top 10 rail. */
function TopTenRow({ rank, p }: { rank: number; p: FeedPost }) {
  const t = thumbUrl(p);
  const rankColor =
    rank === 1 ? "bg-jp-gold/90 text-jp-navy"
    : rank === 2 ? "bg-zinc-300/80 text-jp-navy"
    : rank === 3 ? "bg-amber-700/80 text-white"
    : "bg-white/[0.05] text-ink-muted";
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-white/[0.04]">
      <div className={cn("num flex h-5 w-5 flex-shrink-0 items-center justify-center self-start rounded-full text-[10px] font-bold", rankColor)}>{rank}</div>
      <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-md bg-jp-navy-light/40 ring-1 ring-white/[0.08]">
        {t ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
        ) : null}
        {p.is_outlier && (
          <div className="absolute right-0.5 top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-jp-gold/90 text-jp-navy">
            <Star className="h-2 w-2 fill-current" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] text-ink-faint">
          <PlatformBadge platform={p.platform} size="sm" url={p.url} creatorType={p.creator.type} />
          <span className="truncate">{p.creator.name}</span>
        </div>
        <div className="num mt-0.5 text-sm font-semibold text-jp-blue-light">{fmtCompact(p.view_count)}</div>
        <p className="line-clamp-1 text-[11px] text-ink-muted">{p.caption ?? "(no caption)"}</p>
      </div>
    </a>
  );
}
