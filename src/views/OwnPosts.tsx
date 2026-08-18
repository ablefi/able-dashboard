import { PRIMARY_HANDLE } from "@/lib/brand";
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Eye, Heart, ExternalLink, LayoutGrid, Film, Image as ImageIcon, Layers } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

type PostType = "carousel" | "reel" | "image";

interface OwnPost {
  id: string;
  shortcode: string;
  url: string;
  thumbnail_url: string | null;
  type: PostType;
  view_count: number;
  like_count: number;
  posted_at: string;
  caption: string | null;
  scraped_at: string;
}

interface Stats {
  total: number;
  carousels: number;
  reels: number;
  images: number;
  totalViews: number;
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const inputCls =
  "rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TypeBadge({ type }: { type: PostType }) {
  const map = {
    carousel: { label: "Carousel", cls: "bg-purple-500/15 text-purple-300 border-purple-500/20", Icon: Layers },
    reel: { label: "Reel", cls: "bg-jp-blue/15 text-jp-blue-light border-jp-blue/20", Icon: Film },
    image: { label: "Image", cls: "bg-white/[0.06] text-ink-muted border-white/[0.08]", Icon: ImageIcon },
  };
  const { label, cls, Icon } = map[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

export default function OwnPosts() {
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("views");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ type, sort });
      const res = await fetch(`/api/content/own-posts?${p}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      const d = await res.json();
      setPosts(d.posts ?? []);
      setStats(d.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [type, sort]);

  useEffect(() => { load(); }, [load]);

  const statCards = stats
    ? [
        { label: "Total Posts", value: stats.total, icon: LayoutGrid },
        { label: "Carousels", value: stats.carousels, icon: Layers },
        { label: "Reels", value: stats.reels, icon: Film },
        { label: "Images", value: stats.images, icon: ImageIcon },
        { label: "Total Views", value: fmtCompact(stats.totalViews), icon: Eye, raw: true },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Our Posts"
        subtitle={`${PRIMARY_HANDLE} · ${posts.length} post${posts.length === 1 ? "" : "s"} shown`}
      />

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-jp-navy-card/40 p-4">
              <div className="flex items-center gap-2 text-ink-faint">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">{label}</span>
              </div>
              <div className="num mt-1.5 text-2xl font-semibold text-ink">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="carousel">Carousels</option>
          <option value="reel">Reels</option>
          <option value="image">Images</option>
        </select>
        <select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="views">Most views</option>
          <option value="recent">Most recent</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-ink-muted">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted">
          <LayoutGrid className="mb-2 h-8 w-8 opacity-30" />
          <p className="text-sm">No posts yet. Run the scraper to populate data.</p>
          <code className="mt-2 rounded bg-white/[0.04] px-3 py-1.5 text-xs text-ink-faint">
            node /Users/adam/.openclaw/workspace/scripts/scrape-own-posts.js
          </code>
        </div>
      ) : (
        <div className={`overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40 ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-2.5 text-left">Post</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-right">Views</th>
                <th className="px-4 py-2.5 text-right">Likes</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {posts.map((p) => (
                <tr key={p.id} className="group hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="h-14 w-10 flex-shrink-0 rounded-md object-cover ring-1 ring-white/[0.08]"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-14 w-10 flex-shrink-0 rounded-md bg-white/[0.04] ring-1 ring-white/[0.08]" />
                      )}
                      <p className="line-clamp-2 max-w-xs text-xs text-ink-muted">{p.caption || "(no caption)"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={p.type} />
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{fmtDate(p.posted_at)}</td>
                  <td className="num px-4 py-3 text-right text-sm text-ink">
                    <span className="flex items-center justify-end gap-1">
                      <Eye className="h-3 w-3 text-ink-faint" />
                      {fmtCompact(p.view_count)}
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-right text-sm text-ink-muted">
                    <span className="flex items-center justify-end gap-1">
                      <Heart className="h-3 w-3 text-ink-faint" />
                      {fmtCompact(p.like_count)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
