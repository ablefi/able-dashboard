"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, ExternalLink, Users2, Pencil, Archive, ArchiveRestore, Trash2, ImageDown, Globe2, Plus, Unlink } from "lucide-react";
import { toast } from "react-toastify";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cn } from "@/lib/utils";
import Empty from "@/components/ui/Empty";
import { type Creator, type CreatorType, type Granularity } from "@/lib/creators";
import { readCache, writeCache } from "@/lib/swrCache";
import { resolveTimeframe } from "@/lib/timeframe";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { useCreatorTimeframe } from "@/components/creators/useCreatorTimeframe";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { PersonaAvatar } from "@/components/creators/PersonaAvatar";
import { PlatformBadge, PlatformPill } from "@/components/creators/PlatformBadge";
import { PostCard, type CardPost } from "@/components/creators/PostCard";
import { RefreshButton } from "@/components/creators/RefreshButton";
import CreatorFormModal, { triggerAutoPull } from "@/components/creators/CreatorFormModal";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { AudienceCountriesChart } from "@/components/creators/AudienceCountriesChart";
import { fmtCompact, fmtRelative } from "@/components/creators/PostBits";
import { CreatorAttributionCard, CreatorDemographics, InfoDot, useAttribution, attributionFor as heardAttributionFor, missingAnswerPlatform } from "@/components/creators/attribution";
import { creatorApi, useCreatorSection } from "@/lib/creatorMarketClient";

const authH = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
async function manage(body: Record<string, unknown>) {
  const r = await fetch(creatorApi("/api/creators/manage"), { method: "POST", headers: { "Content-Type": "application/json", ...authH() }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}

function ActionBtn({ onClick, icon, label, disabled, danger }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
        danger ? "border-app-red/25 text-app-red-text hover:bg-app-red/10" : "border-white/[0.1] text-ink-muted hover:bg-white/[0.04] hover:text-ink",
      )}
    >
      {icon}{label}
    </button>
  );
}

interface DetailPost extends CardPost {
  is_community: boolean;
  counts: boolean;
  creator_type: CreatorType;
}
interface Account {
  id: string; name: string; type: CreatorType; slug: string;
  profile_image_url: string | null;
  instagram_handle: string | null; tiktok_handle: string | null; youtube_handle: string | null;
  last_scraped_at: string | null;
  total_posts: number; total_views: number;
}
type PlatformKey = "instagram" | "tiktok" | "youtube";
interface DetailData {
  creator: Creator;
  parent: { name: string; slug: string } | null;
  accounts?: Account[];
  posts: DetailPost[];
  stats: {
    total_views: number; total_likes: number; total_comments: number; total_posts: number; community_posts: number; avg_views_per_post: number;
    by_platform: Record<PlatformKey, { views: number; posts: number }>;
  };
  buckets: { date: string; views: number; instagram: number; tiktok: number; youtube: number }[];
  audience?: unknown;
  audienceAt?: string | null;
}

const CHART = { grid: "rgba(255,255,255,0.05)", tick: "#8499b3" };
// Per-platform line colours for the "Segment by platform" view.
const PLATFORM_META: { key: PlatformKey; label: string; color: string }[] = [
  { key: "instagram", label: "Instagram", color: "#ec4899" },
  { key: "tiktok", label: "TikTok", color: "#22d3ee" },
  { key: "youtube", label: "YouTube", color: "#ef4444" },
];
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#15203a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px" },
  labelStyle: { color: "#f0f4f8" }, itemStyle: { color: "#f0f4f8" },
};
const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const TYPE_LABEL: Record<string, string> = { influencer: "Influencer", daily_ugc: "Daily UGC", youtuber: "YouTuber", persona: "Persona", ambassador: "Ambassador", other: "Other" };
function flag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
const handleUrl = (platform: "instagram" | "tiktok" | "youtube", h: string) =>
  platform === "instagram" ? `https://instagram.com/${h}` : platform === "tiktok" ? `https://tiktok.com/@${h.replace(/^@/, "")}` : `https://youtube.com/${h.startsWith("@") ? h : "@" + h}`;

const selectCls = "rounded-lg border border-white/[0.08] bg-app-navy-card/50 px-2.5 py-1.5 text-xs text-ink focus:border-app-blue/45 focus:outline-none";

function TypePill({ type, size = "md" }: { type: CreatorType; size?: "sm" | "md" }) {
  const isPersona = type === "persona";
  return (
    <span className={cn("rounded-md font-medium uppercase tracking-wide", size === "sm" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]", isPersona ? "bg-app-purple/15 text-app-purple" : "bg-white/[0.06] text-ink-muted")}>
      {isPersona && <Users2 className="mr-0.5 inline h-2.5 w-2.5" />}{TYPE_LABEL[type] || type}
    </span>
  );
}

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const OPTIONS: { key: Granularity; label: string }[] = [
    { key: "day", label: "Daily" },
    { key: "week", label: "Weekly" },
    { key: "month", label: "Monthly" },
  ];
  return (
    <div className="inline-flex rounded-xl border border-app-blue/20 bg-app-navy-card/50 p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all", value === opt.key ? "bg-app-blue text-white shadow-sm shadow-app-blue/40" : "text-ink-muted hover:text-ink")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-3">
      {/* nowrap: see the note on the shared Stat. A wrapped label stretches
          its grid row and breaks the alignment with the attribution column. */}
      <div className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
        {hint && <InfoDot text={hint} />}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold num", accent ? "text-app-blue-light" : "text-ink")}>{value}</div>
    </div>
  );
}

export default function CreatorDetail({ slug }: { slug: string }) {
  const { base: creatorsBase } = useCreatorSection();
  // Who named this creator in onboarding, and what those people look like.
  const { data: attributionData, loading: attributionLoading } = useAttribution();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tf, setTf] = useCreatorTimeframe();
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [segment, setSegment] = useState(false); // split stats + chart per platform
  const [account, setAccount] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sort persists across creators (localStorage) so an "find best videos"
  // sweep keeps Most-views active as you click through the roster.
  const [sort, setSort] = useState<"recent" | "views">("recent");
  useEffect(() => {
    try { const s = localStorage.getItem("app-creator-detail-sort"); if (s === "views" || s === "recent") setSort(s); } catch { /* ignore */ }
  }, []);
  const changeSort = (s: "recent" | "views") => {
    setSort(s);
    try { localStorage.setItem("app-creator-detail-sort", s); } catch { /* ignore */ }
  };

  const cacheKey = useMemo(
    () => `creator-detail:${slug}:${tf.key}:${tf.from ?? ""}:${tf.to ?? ""}:${granularity}:${account}`,
    [slug, tf, granularity, account]
  );

  // Instant paint from cache, then revalidate. A manual Refresh / any manage
  // action calls load(), which overwrites the cache with fresh data.
  useEffect(() => {
    const cached = readCache<DetailData>(cacheKey);
    setData(cached ? cached.data : null);
  }, [cacheKey]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const { fromISO, toISO } = resolveTimeframe(tf);
      const p = new URLSearchParams({ from: fromISO, to: toISO, granularity });
      if (account) p.set("account", account);
      const res = await fetch(creatorApi(`/api/creators/${encodeURIComponent(slug)}?${p}`), { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      const d = (await res.json()) as DetailData;
      setData(d);
      writeCache(cacheKey, d);
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [slug, tf, granularity, account, cacheKey]);

  useEffect(() => { load(); }, [load]);

  // Approve/exclude/outlier a post → silently refetch so the counted "post
  // amounts" (stats block) reflect it right away. Debounced to coalesce rapid
  // toggles; silent so the page doesn't dim on every click.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPostChanged = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load({ silent: true }); }, 400);
  }, [load]);
  useEffect(() => () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); }, []);
  // Reset the account filter when navigating between creators.
  useEffect(() => { setAccount(""); setPlatformFilter("all"); }, [slug]);

  const tfResolved = resolveTimeframe(tf);
  const tfLabel = tfResolved.label;
  // Refresh pulls "the last N days" of posts; tie that window (and the button
  // label) to the selected timeframe so it tracks the filter instead of a fixed
  // 30d. Clamped to the API's 1–365 range.
  const refreshDays = Math.min(365, Math.max(1, Math.round((Date.parse(tfResolved.toISO) - Date.parse(tfResolved.fromISO)) / 86_400_000)));
  const granLabel = granularity === "week" ? "Weekly" : granularity === "month" ? "Monthly" : "Daily";

  // YT Shorts vs long-form Videos vs Community split — same URL-shape rules
  // as roster. Non-YT posts always land in Shorts.
  const groups = useMemo(() => {
    if (!data) return { shorts: [] as DetailPost[], videos: [] as DetailPost[], community: [] as DetailPost[] };
    const base = platformFilter === "all" ? data.posts : data.posts.filter((p) => p.platform === platformFilter);
    // API returns posted_at desc; re-rank by views when the user is hunting
    // best videos. .filter() below preserves this order into each group.
    const filtered = sort === "views" ? [...base].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)) : base;
    const community = filtered.filter((p) => p.platform === "youtube" && (p.url ?? "").includes("/post/"));
    const communityIds = new Set(community.map((p) => p.id));
    const videos = filtered.filter((p) => {
      if (p.platform !== "youtube" || communityIds.has(p.id)) return false;
      if (p.creator_type !== "youtuber") return false;
      return !(p.url ?? "").includes("/shorts/");
    });
    const videoIds = new Set(videos.map((p) => p.id));
    const shorts = filtered.filter((p) => !communityIds.has(p.id) && !videoIds.has(p.id));
    return { shorts, videos, community };
  }, [data, platformFilter, sort]);

  // General baseline (GCP): EVERY non-community post in the window regardless
  // of approval — what this creator's average post does, vs. what they do for
  // us. Computed from the same (account-filtered) post set as `stats`.
  const general = useMemo(() => {
    if (!data) return null;
    const nc = data.posts.filter((p) => !p.is_community);
    const views = nc.reduce((s, p) => s + (p.view_count || 0), 0);
    return { posts: nc.length, views, avg: nc.length > 0 ? Math.round(views / nc.length) : 0 };
  }, [data]);

  const doArchive = async (id: string, archived: boolean) => {
    setBusy(true);
    const r = await manage({ action: archived ? "unarchive" : "archive", id });
    setBusy(false);
    if (r.ok) { toast.success(archived ? "Unarchived" : "Archived"); load(); } else toast.error(r.error || "Failed");
  };
  /** Deleting a creator takes their posts with it and cannot be undone, so it
   *  asks in the dashboard's own modal rather than a browser confirm() that
   *  looks like a phishing popup and says nothing about what is being lost. */
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; isChild: boolean; name: string } | null>(null);

  const doDelete = async (id: string, isChild: boolean) => {
    setDeleteTarget(null);
    setBusy(true);
    const r = await manage({ action: "delete", id, force: true });
    setBusy(false);
    if (r.ok) { toast.success("Deleted"); if (isChild) load(); else window.location.assign(creatorsBase); } else toast.error(r.error || "Failed");
  };
  const openEdit = async () => {
    if (!data) return;
    if (data.creator.type === "persona") { setEditOpen(true); return; }
    setBusy(true);
    try {
      const response = await fetch(creatorApi("/api/creators?type=persona&status=all"), { headers: authH() });
      if (!response.ok) throw new Error("Could not load personas. Please try again.");
      const result = await response.json();
      if (!Array.isArray(result.creators)) throw new Error("Could not load personas. Please try again.");
      const options = result.creators.map((persona: { id: string; name: string }) => ({ id: persona.id, name: persona.name }));
      // Keep an existing parent selected even if it is absent from the roster.
      if (data.creator.parent_id && !options.some((persona: { id: string }) => persona.id === data.creator.parent_id)) {
        options.push({ id: data.creator.parent_id, name: data.parent?.name || "Current persona" });
      }
      setPersonas(options);
      setEditOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load personas.");
    } finally {
      setBusy(false);
    }
  };
  const doDetach = async (id: string) => {
    setBusy(true);
    const r = await manage({ action: "detach", id });
    setBusy(false);
    if (r.ok) { toast.success("Detached from persona"); load(); } else toast.error(r.error || "Failed");
  };
  const doRefreshProfile = async (id: string) => {
    setBusy(true);
    const tid = toast.loading("Refreshing avatar…");
    const r = await fetch(creatorApi("/api/creators/profile"), { method: "POST", headers: { "Content-Type": "application/json", ...authH() }, body: JSON.stringify({ action: "profile", id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    toast.update(tid, { render: r.ok ? "Avatar refreshed" : r.error || "Failed", type: r.ok ? "success" : "error", isLoading: false, autoClose: 3500 });
    if (r.ok) load();
  };
  const doAudience = async (id: string) => {
    setBusy(true);
    const tid = toast.loading("Pulling audience (≈26 credits)…");
    const r = await fetch(creatorApi("/api/creators/profile"), { method: "POST", headers: { "Content-Type": "application/json", ...authH() }, body: JSON.stringify({ action: "audience", id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    toast.update(tid, { render: r.ok ? "Audience pulled" : r.error || "Failed", type: r.ok ? "success" : "error", isLoading: false, autoClose: 4000 });
    if (r.ok) load();
  };

  if (loading && !data) return <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading creator…</div>;
  if (error) return (
    <div className="space-y-4">
      <Link href={creatorsBase} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All creators</Link>
      <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>
    </div>
  );
  if (!data) return null;

  const { creator: c, parent, accounts, posts, stats, buckets, audience, audienceAt } = data;
  // Segment-by-platform only makes sense when this creator has counted posts on
  // more than one platform; otherwise the toggle is hidden and we stay combined.
  const presentPlatforms = PLATFORM_META.filter((p) => (stats.by_platform?.[p.key]?.posts ?? 0) > 0);
  const canSegment = presentPlatforms.length > 1;
  const segmented = segment && canSegment;
  const isPersona = c.type === "persona";
  const isYouTuber = c.type === "youtuber";
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const attributionFor = (p: DetailPost) => {
    if (!isPersona) return undefined;
    const a = accountById.get(p.creator_id);
    return a ? { name: a.name, slug: a.slug } : undefined;
  };

  const shortsSection = (
    <section className="mt-10" key="shorts">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Posts ({groups.shorts.length})</h2>
        <select className={selectCls} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
          <option value="all">All platforms</option>
          <option value="instagram">Instagram only</option>
          <option value="tiktok">TikTok only</option>
          <option value="youtube">YouTube only</option>
        </select>
      </div>
      <div className="mt-3">
        {groups.shorts.length === 0 ? (
          <Empty title="No posts in this window" description={isPersona ? "Try a different time range or account." : "Try a different time range or platform."} />
        ) : (
          <div className="flex flex-wrap justify-start gap-4">
            {groups.shorts.map((p) => (
              <div key={p.id} className="w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)]">
                <PostCard post={p} creatorType={p.creator_type} attribution={attributionFor(p)} onChanged={onPostChanged} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const videosSection = groups.videos.length > 0 ? (
    <section className="mt-10" key="videos">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">YouTube videos ({groups.videos.length})</h2>
      </div>
      <div className="mt-3 flex flex-wrap justify-start gap-4">
        {groups.videos.map((p) => (
          <div key={p.id} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]">
            <PostCard post={p} creatorType={p.creator_type} attribution={attributionFor(p)} variant="landscape" onChanged={onPostChanged} />
          </div>
        ))}
      </div>
    </section>
  ) : null;

  const communitySection = groups.community.length > 0 ? (
    <section className="mt-10" key="community">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">YouTube community ({groups.community.length})</h2>
        <span className="text-[11px] text-ink-faint">Text + image · /post/</span>
      </div>
      <div className="mt-3 flex flex-wrap justify-start gap-4">
        {groups.community.map((p) => (
          <div key={p.id} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]">
            <PostCard post={p} creatorType={p.creator_type} attribution={attributionFor(p)} variant="square" onChanged={onPostChanged} />
          </div>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <div className={cn(loading && "opacity-60 transition-opacity")}>
      <Link href={creatorsBase} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"><ArrowLeft className="h-3 w-3" /> All creators</Link>

      {parent && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-app-purple/15 px-2 py-1 text-[11px] text-app-purple ring-1 ring-inset ring-app-purple/30">
          <Users2 className="h-3 w-3" />
          <span className="font-medium uppercase tracking-wider">Account of</span>
          <Link href={`${creatorsBase}/${parent.slug}`} className="font-semibold underline-offset-2 hover:underline">{parent.name}</Link>
        </div>
      )}

      {/* Header: avatar | name + chips | granularity + timeframe */}
      <div className="mt-3 flex flex-wrap items-start gap-4">
        {isPersona ? (
          <PersonaAvatar name={c.name} accounts={accounts ?? []} size="xl" />
        ) : (
          <CreatorAvatar name={c.name} src={c.profile_image_url} size="xl" />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Name row: the name, its type, and the platform marks. The
                  handle text is gone on purpose — it repeated what the icon
                  already says and pushed the useful chips onto another line.
                  Each icon still links out to that account. */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{c.name}</h1>
                <TypePill type={c.type} />
                {c.region && <span className="text-sm">{flag(c.region)}</span>}
                {!isPersona && (["instagram", "tiktok", "youtube"] as const).map((pl) =>
                  c[`${pl}_handle`] ? (
                    <a
                      key={pl}
                      href={handleUrl(pl, c[`${pl}_handle`] as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c[`${pl}_handle`] as string}
                      className="inline-flex items-center hover:opacity-80"
                    >
                      <PlatformBadge platform={pl} />
                    </a>
                  ) : null
                )}
                {isPersona && <span className="text-xs text-ink-muted">{(accounts ?? []).length} {(accounts ?? []).length === 1 ? "account" : "accounts"}</span>}
                {c.status === "archived" && (
                  <span className="rounded-md bg-app-orange/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-app-orange ring-1 ring-inset ring-app-orange/30">Archived</span>
                )}
              </div>

              {/* Management actions, with the refresh time riding the end of
                  the row instead of taking a line to itself. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <ActionBtn onClick={openEdit} icon={<Pencil className="h-3 w-3" />} label="Edit" disabled={busy} />
                {!isPersona && <ActionBtn onClick={() => doRefreshProfile(c.id)} icon={<ImageDown className="h-3 w-3" />} label="Refresh avatar" disabled={busy} />}
                {!isPersona && c.tiktok_handle && <ActionBtn onClick={() => doAudience(c.id)} icon={<Globe2 className="h-3 w-3" />} label="Audience" disabled={busy} />}
                <ActionBtn onClick={() => doArchive(c.id, c.status === "archived")} icon={c.status === "archived" ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />} label={c.status === "archived" ? "Unarchive" : "Archive"} disabled={busy} />
                {parent && <ActionBtn onClick={() => doDetach(c.id)} icon={<Unlink className="h-3 w-3" />} label="Detach" disabled={busy} />}
                <ActionBtn onClick={() => setDeleteTarget({ id: c.id, isChild: !!parent, name: c.name })} icon={<Trash2 className="h-3 w-3" />} label="Delete" disabled={busy} danger />
                {c.last_scraped_at && (
                  <span className="ml-1 text-[11px] text-ink-faint">Last refreshed {fmtRelative(c.last_scraped_at)}</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <RefreshButton action={isPersona ? "persona" : "creator"} id={c.id} windowDays={refreshDays} onDone={load} size="sm" />
              <div className="inline-flex rounded-xl border border-app-blue/20 bg-app-navy-card/50 p-0.5">
                {([["recent", "Recent"], ["views", "Most views"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => changeSort(k)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all", sort === k ? "bg-app-blue text-white shadow-sm shadow-app-blue/40" : "text-ink-muted hover:text-ink")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <GranularityToggle value={granularity} onChange={setGranularity} />
              <TimeframeFilter value={tf} onChange={setTf} />
            </div>
          </div>
        </div>
      </div>

      {/* PERSONA: accounts section + per-account filter */}
      {isPersona && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Accounts ({(accounts ?? []).length})</h2>
            <button onClick={() => setAddChildOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-app-blue/30 bg-app-blue/10 px-2.5 py-1 text-xs font-medium text-app-blue-light hover:bg-app-blue/20">
              <Plus className="h-3.5 w-3.5" /> Add account
            </button>
          </div>
          <div className="mt-3">
            {(accounts ?? []).length === 0 ? (
              <Empty title="No accounts yet" description="This persona has no child accounts. Add them from the creators dashboard." />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(accounts ?? []).map((a) => {
                  const isActive = account === a.id;
                  return (
                    <li key={a.id}>
                      <div className={cn("rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-3", isActive && "ring-1 ring-app-blue/40")}>
                        <div className="flex items-center gap-3">
                          <CreatorAvatar name={a.name} src={a.profile_image_url} size="sm" />
                          <div className="min-w-0 flex-1">
                            <Link href={`${creatorsBase}/${a.slug}`} className="block truncate text-sm font-medium text-ink hover:underline">
                              {a.name}
                              <ExternalLink className="ml-1 inline-block h-3 w-3 text-ink-faint" />
                            </Link>
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                              <TypePill type={a.type} size="sm" />
                              {a.instagram_handle && <PlatformPill platform="instagram" />}
                              {a.tiktok_handle && <PlatformPill platform="tiktok" />}
                              {a.youtube_handle && <PlatformPill platform="youtube" />}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <span className="num font-semibold text-app-blue-light">{fmtCompact(a.total_views)}</span>
                              <span className="text-ink-faint">{a.total_posts} {a.total_posts === 1 ? "post" : "posts"}</span>
                              {a.last_scraped_at && (
                                <>
                                  <span className="text-ink-faint/40">·</span>
                                  <span className="text-ink-faint">refreshed {fmtRelative(a.last_scraped_at)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-white/[0.06] pt-2">
                          <ActionBtn onClick={() => doDetach(a.id)} icon={<Unlink className="h-3 w-3" />} label="Detach" disabled={busy} />
                          <ActionBtn onClick={() => setDeleteTarget({ id: a.id, isChild: true, name: a.name })} icon={<Trash2 className="h-3 w-3" />} label="Delete" disabled={busy} danger />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(accounts ?? []).length > 1 && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[11px] text-ink-faint">Filter posts to one account</span>
              <select className={selectCls} value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">All accounts (combined)</option>
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
        </section>
      )}

      {/* PERFORMANCE */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-3">
            {canSegment && (
              <button
                type="button"
                onClick={() => setSegment((s) => !s)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  segmented ? "border-app-blue/40 bg-app-blue/15 text-app-blue-light" : "border-white/[0.1] text-ink-muted hover:bg-white/[0.04] hover:text-ink",
                )}
              >
                Segment by platform
              </button>
            )}
          </div>
        </div>
        {/* Numbers on the left, attribution on the right. They answer the two
            halves of the same question — how much reach, and what it brought —
            so reading them side by side beats scrolling between them. */}
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Posts</div>
        <div className={cn("mt-2 grid gap-3", stats.community_posts > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
          <Stat label="Approved posts" value={stats.total_posts.toString()} />
          <Stat label="Approved views" value={fmtCompact(stats.total_views)} accent />
          <Stat label="Avg / post" value={stats.total_posts > 0 ? fmtCompact(stats.avg_views_per_post) : "-"} />
          {stats.community_posts > 0 && <Stat label="Counted CP" value={stats.community_posts.toString()} accent />}
        </div>

        {/* GCP: the same creator's every-post baseline + the us-vs-general ratio */}
        {general && general.posts > 0 && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="All posts" value={general.posts.toString()} />
              <Stat label="All views" value={fmtCompact(general.views)} accent />
              {/* The us-vs-general ratio rides Avg / post as an "i" rather than
                  a sentence over the row. It is a footnote about this number,
                  so it belongs on this number. */}
              <Stat
                label="Avg / post (all)"
                value={fmtCompact(general.avg)}
                hint={
                  general.avg > 0 && stats.total_posts > 0
                    ? `Their approved posts average ${Math.round((stats.avg_views_per_post / general.avg) * 100)}% of this.`
                    : undefined
                }
              />
            </div>
          </>
        )}

        </div>

        {/* Attribution — the other half of the same question. */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Attribution</div>
          <div className="mt-2">
            <CreatorAttributionCard attribution={heardAttributionFor(attributionData, c.id)} loading={attributionLoading} />
          </div>
        </div>
        </div>

        {/* Total views broken out per platform when segmenting. */}
        {segmented && (
          <div className={cn("mt-3 grid gap-3", presentPlatforms.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
            {presentPlatforms.map((p) => (
              <div key={p.key} className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label}
                </div>
                <div className="mt-1 num text-xl font-semibold text-ink">{fmtCompact(stats.by_platform[p.key].views)}</div>
                <div className="text-[10px] text-ink-faint">{stats.by_platform[p.key].posts} {stats.by_platform[p.key].posts === 1 ? "post" : "posts"}</div>
              </div>
            ))}
          </div>
        )}

        {buckets.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-ink">{granLabel} views by post date</h3>
              <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                Peak: {fmtCompact(segmented ? Math.max(0, ...buckets.flatMap((b) => presentPlatforms.map((p) => b[p.key]))) : Math.max(0, ...buckets.map((b) => b.views)))}
              </span>
            </div>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={segmented ? 232 : 200}>
                <AreaChart data={buckets} margin={{ top: 6, right: 10, bottom: 0, left: 6 }}>
                  <defs>
                    <linearGradient id="cdViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5b8def" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#5b8def" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={56} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [fmtCompact(v), name]} />
                  {segmented ? (
                    <>
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="plainline" />
                      {presentPlatforms.map((p) => (
                        <Area key={p.key} type="monotone" dataKey={p.key} name={p.label} stroke={p.color} strokeWidth={2} fill="none" dot={false} />
                      ))}
                    </>
                  ) : (
                    <Area type="monotone" dataKey="views" name="Views" stroke="#5b8def" strokeWidth={2} fill="url(#cdViews)" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* Demographics of the people who named them. */}
      {(() => {
        const attr = heardAttributionFor(attributionData, c.id);
        if (!attr || attr.downloads === 0) return null;
        return (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Who they bring in</h2>
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-5">
              <CreatorDemographics
                demo={attr.demographics}
                downloads={attr.downloads}
                missingPlatform={missingAnswerPlatform(attributionData)}
              />
            </div>
          </section>
        );
      })()}

      {/* Audience by country (TikTok demographics) — leaf creators with a TT handle */}
      {!isPersona && c.tiktok_handle && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Audience by country</h2>
            <span className="text-[11px] text-ink-faint">
              {audienceAt ? `Last pulled ${fmtRelative(audienceAt)}` : "TikTok-only · ~26 credits per pull"}
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-5">
            {audience ? (
              <AudienceCountriesChart raw={audience} />
            ) : (
              <p className="text-sm text-ink-faint">No audience data yet, hit <span className="text-app-blue-light">Audience</span> above to pull it from ScrapeCreators (~26 credits).</p>
            )}
          </div>
        </section>
      )}

      {/* Posts — YouTubers lead with long-form Videos, then Community, then
          Shorts; everyone else Shorts → Community → Videos. */}
      {posts.length === 0 ? (
        <section className="mt-10">
          <Empty title="No posts in this window" description="Try a longer time range." />
        </section>
      ) : isYouTuber ? (
        <>{videosSection}{communitySection}{shortsSection}</>
      ) : (
        <>{shortsSection}{communitySection}{videosSection}</>
      )}

      {/* Edit this creator */}
      <CreatorFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        kind="creator"
        initial={{ id: c.id, name: c.name, type: c.type, instagram_handle: c.instagram_handle, tiktok_handle: c.tiktok_handle, youtube_handle: c.youtube_handle, parent_id: c.parent_id }}
        personas={personas}
        onSaved={() => load()}
      />
      {/* Add a child account to this persona */}
      {isPersona && (
        <CreatorFormModal
          open={addChildOpen}
          onClose={() => setAddChildOpen(false)}
          kind="creator"
          initial={{ parent_id: c.id, type: "daily_ugc" }}
          onSaved={(r) => { if (r.id) triggerAutoPull(r.id); setTimeout(load, 600); }}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        title={deleteTarget?.isChild ? "Delete this account?" : "Delete this creator?"}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => deleteTarget && doDelete(deleteTarget.id, deleteTarget.isChild)}
            >
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            <strong className="text-ink">{deleteTarget?.name}</strong> and every post recorded
            against them will be removed.
          </p>
          <p>
            Their view history goes with them, so anything already paid on those numbers
            becomes unverifiable. This cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
