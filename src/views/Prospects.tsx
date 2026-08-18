"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Plus, Pencil, Trash2, ArrowUpCircle } from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "@/components/ui/PageHeader";
import Empty from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { resolveTimeframe } from "@/lib/timeframe";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { useCreatorTimeframe } from "@/components/creators/useCreatorTimeframe";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import CreatorFormModal, { triggerAutoPull } from "@/components/creators/CreatorFormModal";

interface Prospect {
  id: string; name: string; profile_image_url: string | null;
  instagram_handle: string | null; tiktok_handle: string | null; youtube_handle: string | null;
  last_scraped_at: string | null;
  ig_avg_views: number; ig_post_count: number;
  tt_avg_views: number; tt_post_count: number;
  yt_avg_views: number; yt_post_count: number;
  combined_avg_views: number; total_posts: number; total_views: number;
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const fmtCompact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const fmtRel = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000); return d <= 0 ? "today" : `${d}d ago`; };
const inputCls = "rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

export default function Prospects() {
  const [data, setData] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tf, setTf] = useCreatorTimeframe();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [busy, setBusy] = useState(false);

  const authHdrs = (): Record<string, string> => { const t = typeof window !== "undefined" ? localStorage.getItem("token") : null; return t ? { Authorization: `Bearer ${t}` } : {}; };
  const act = async (action: string, id: string) => {
    setBusy(true);
    const r = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json", ...authHdrs() }, body: JSON.stringify({ action, id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) { toast.success(action === "promote" ? "Promoted to creator" : "Deleted"); load(); } else toast.error(r.error || "Failed");
  };
  const onDelete = (p: Prospect) => { if (confirm(`Delete prospect "${p.name}" and its posts?`)) act("delete", p.id); };
  const onPromote = (p: Prospect) => { if (confirm(`Promote "${p.name}" to an active creator? It'll move to the roster.`)) act("promote", p.id); };

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fromISO, toISO } = resolveTimeframe(tf);
      const p = new URLSearchParams({ from: fromISO, to: toISO });
      if (debounced) p.set("search", debounced);
      const res = await fetch(`/api/prospects?${p}`, { headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Failed (${res.status})`); }
      const d = await res.json();
      setData(d.prospects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debounced, tf]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prospects"
        subtitle={data.length === 0 ? "Creators you're evaluating before deciding to work with them." : `${data.length} prospect${data.length === 1 ? "" : "s"} · avg views over ${resolveTimeframe(tf).label.toLowerCase()}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-jp-blue px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-jp-blue-light">
              <Plus className="h-4 w-4" /> Add prospect
            </button>
            <TimeframeFilter value={tf} onChange={setTf} />
          </div>
        }
      />

      <CreatorFormModal open={addOpen} onClose={() => setAddOpen(false)} kind="prospect" onSaved={(r) => { if (r.id) triggerAutoPull(r.id); setTimeout(load, 600); }} />
      <CreatorFormModal open={!!editing} onClose={() => setEditing(null)} kind="prospect" initial={editing ? { id: editing.id, name: editing.name, instagram_handle: editing.instagram_handle, tiktok_handle: editing.tiktok_handle, youtube_handle: editing.youtube_handle } : null} onSaved={(r) => { if (r.handleChanged && editing) triggerAutoPull(editing.id); setTimeout(load, 600); }} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={inputCls + " w-56 pl-8"} placeholder="Search prospects…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading prospects…</div>
      ) : data.length === 0 ? (
        <Empty title={debounced ? "No prospects match" : "No prospects yet"} description={debounced ? "Try a different search." : "Prospects are managed in the creators backend (tagged jp-prospect)."} />
      ) : (
        <ul className={cn("space-y-2.5", loading && "opacity-60 transition-opacity")}>
          {data.map((p) => {
            const profile = p.instagram_handle ? `https://instagram.com/${p.instagram_handle}` : p.tiktok_handle ? `https://tiktok.com/@${p.tiktok_handle.replace(/^@/, "")}` : p.youtube_handle ? `https://youtube.com/${p.youtube_handle.startsWith("@") ? p.youtube_handle : "@" + p.youtube_handle}` : null;
            return (
              <li key={p.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40">
                <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <Avatar name={p.name} src={p.profile_image_url} />
                    <div className="min-w-0 flex-1">
                      {profile ? (
                        <a href={profile} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:text-jp-blue-light">{p.name}</a>
                      ) : (
                        <span className="font-medium text-ink">{p.name}</span>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-faint">
                        {p.instagram_handle && <PlatformPill platform="instagram" />}
                        {p.tiktok_handle && <PlatformPill platform="tiktok" />}
                        {p.youtube_handle && <PlatformPill platform="youtube" />}
                        <span className="truncate">{p.instagram_handle || p.tiktok_handle || p.youtube_handle}</span>
                        {p.last_scraped_at && <span className="text-ink-faint/70">· refreshed {fmtRel(p.last_scraped_at)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 sm:gap-7">
                    <AvgCell label="IG avg" avg={p.ig_avg_views} count={p.ig_post_count} have={!!p.instagram_handle} />
                    <AvgCell label="TT avg" avg={p.tt_avg_views} count={p.tt_post_count} have={!!p.tiktok_handle} />
                    <AvgCell label="YT avg" avg={p.yt_avg_views} count={p.yt_post_count} have={!!p.youtube_handle} />
                    <div className="min-w-[64px] text-right">
                      <div className="text-sm font-semibold num text-jp-gold">{p.total_posts > 0 ? fmtCompact(p.combined_avg_views) : "—"}</div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-faint">All avg</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:border-l sm:border-white/[0.06] sm:pl-3">
                    <button onClick={() => setEditing(p)} disabled={busy} title="Edit" className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-white/[0.04] hover:text-ink disabled:opacity-50"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => onPromote(p)} disabled={busy} title="Promote to creator" className="inline-flex items-center gap-1 rounded-lg border border-jp-blue/30 px-2 py-1 text-[11px] font-medium text-jp-blue-light hover:bg-jp-blue/15 disabled:opacity-50"><ArrowUpCircle className="h-3 w-3" /> Promote</button>
                    <button onClick={() => onDelete(p)} disabled={busy} title="Delete" className="inline-flex items-center rounded-lg border border-rose-500/25 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AvgCell({ label, avg, count, have }: { label: string; avg: number; count: number; have: boolean }) {
  return (
    <div className="min-w-[60px] text-right">
      <div className={cn("text-sm font-semibold num", !have ? "text-ink-faint/30" : count === 0 ? "text-ink-faint" : "text-ink")}>
        {!have ? "—" : count === 0 ? "0" : fmtCompact(avg)}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setErr(true)} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jp-blue/15 text-sm font-semibold text-jp-blue-light">{name.charAt(0).toUpperCase()}</div>;
}
