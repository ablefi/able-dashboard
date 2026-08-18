"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Eye, Star, Plus } from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Empty from "@/components/ui/Empty";
import { slugForCreator, type CreatorType } from "@/lib/creators";
import { PlatformBadge } from "@/components/creators/PlatformBadge";
import { OutlierAdminControls } from "@/components/creators/OutlierAdminControls";
import { ExpandableCaption, thumbUrl, fmtCompact, fmtRelative } from "@/components/creators/PostBits";

interface FeedPost {
  id: string; platform: "instagram" | "tiktok" | "youtube"; url: string; thumbnail_url: string | null;
  caption: string | null; view_count: number; posted_at: string; is_outlier: boolean;
  archive_status: "pending" | "archived" | "failed" | "skipped_yt" | null; archive_video_url: string | null; published_to_top: boolean;
  creator: { id: string; name: string; type: CreatorType; profile_image_url: string | null; instagram_handle: string | null; tiktok_handle: string | null; youtube_handle: string | null };
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Outliers() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const addByUrl = async () => {
    if (!/^https?:\/\//.test(url.trim())) { toast.error("Paste a full https:// URL"); return; }
    setAdding(true);
    try {
      const r = await fetch("/api/creators/outliers", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ action: "add_manual", url: url.trim(), note: note.trim() }) });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.error || "Failed");
      // Kick off the archive (downloads the video + backfills metadata).
      if (d.postId) fetch("/api/creators/outliers", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ action: "archive", id: d.postId }) }).catch(() => {});
      toast.success("Outlier added — archiving in the background");
      setAddOpen(false); setUrl(""); setNote("");
      setTimeout(load, 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAdding(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creators/posts?state=outliers&days=3650&sort=views`, { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      const d = await res.json();
      setPosts(d.feed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unstar = async (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id)); // optimistic — leaves the grid
    try {
      await fetch("/api/creators/posts", { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ id, field: "is_outlier", value: false }) });
    } catch { load(); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outliers"
        subtitle={`${posts.length} starred post${posts.length === 1 ? "" : "s"} across the roster · all-time`}
        actions={
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-jp-blue px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-jp-blue-light">
            <Plus className="h-4 w-4" /> Add by URL
          </button>
        }
      />

      <Modal
        open={addOpen}
        onClose={() => !adding && setAddOpen(false)}
        title="Add outlier by URL"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button size="sm" onClick={addByUrl} disabled={adding}>{adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add outlier</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Post URL <span className="text-rose-400">*</span></label>
            <input className="w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none" placeholder="https://www.tiktok.com/@user/video/… or instagram.com/reel/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Note (optional)</label>
            <input className="w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none" placeholder="why this is an outlier…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-[11px] text-ink-faint">We'll auto-resolve the creator (TikTok URLs carry the @handle; others land under "External") and archive the video so it's ready to publish.</p>
        </div>
      </Modal>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {loading && posts.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading outliers…</div>
      ) : posts.length === 0 ? (
        <Empty title="No outliers yet" description="Star a post from the Posts tab (the gold star) — top-performing posts collect here." icon={<Star className="h-5 w-5 text-jp-gold" />} />
      ) : (
        <div className="flex flex-wrap justify-start gap-4">
          {posts.map((p) => (
            <div key={p.id} className="w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)]">
              <OutlierCard p={p} onUnstar={() => unstar(p.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutlierCard({ p, onUnstar }: { p: FeedPost; onUnstar: () => void }) {
  const [err, setErr] = useState(false);
  const t = thumbUrl(p);
  const slug = slugForCreator(p.creator);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40 ring-1 ring-jp-gold/30 transition-all hover:-translate-y-0.5 hover:border-jp-gold/40 hover:shadow-[0_8px_24px_-12px_rgba(245,158,11,0.4)]">
      <div className="relative aspect-[9/13] bg-jp-navy-light/40">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full" aria-label="Open post">
          {t && !err ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setErr(true)} className="h-full w-full object-cover" />
          ) : null}
        </a>
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10">
          <PlatformBadge platform={p.platform} size="sm" url={p.url} creatorType={p.creator.type} />
        </div>
        <button
          onClick={onUnstar}
          title="Remove from outliers"
          className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-jp-gold/95 text-jp-navy shadow-md shadow-jp-gold/40 backdrop-blur-md transition-all hover:bg-jp-gold"
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
      <div className="p-2.5">
        <Link href={`/creators/${slug}`} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink">
          <span className="truncate">{p.creator.name}</span>
        </Link>
        <ExpandableCaption text={p.caption} className="mt-1.5 text-[11px] leading-snug text-ink" />
        <div className="mt-2 flex items-center justify-between gap-1.5 text-[10px] text-ink-muted">
          <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> <span className="num">{fmtCompact(p.view_count)}</span></span>
          <span className="text-ink-faint">{fmtRelative(p.posted_at)}</span>
        </div>
        <OutlierAdminControls
          postId={p.id}
          initialStatus={p.archive_status}
          initialPublished={p.published_to_top}
          platform={p.platform}
        />
      </div>
    </div>
  );
}
