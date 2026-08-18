"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loader2, Search, ArrowUp, ArrowDown, ChevronsUpDown, Users2, ChevronRight, Check, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Empty from "@/components/ui/Empty";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import BatchBar from "@/components/ui/BatchBar";
import { cn } from "@/lib/utils";
import { slugForCreator, type CreatorWithStats, type Platform } from "@/lib/creators";
import { readCache, writeCache } from "@/lib/swrCache";
import { resolveTimeframe } from "@/lib/timeframe";
import { TimeframeFilter } from "@/components/creators/TimeframeFilter";
import { useCreatorTimeframe } from "@/components/creators/useCreatorTimeframe";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { PersonaAvatar } from "@/components/creators/PersonaAvatar";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import { RefreshButton } from "@/components/creators/RefreshButton";
import CreatorFormModal, { triggerAutoPull } from "@/components/creators/CreatorFormModal";
import { Plus } from "lucide-react";

type SortKey = "name" | "posts" | "views" | "avg";
type SortDir = "asc" | "desc";
type BulkAction = "archive" | "unarchive" | "delete";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}
/** Coarser "time since last post" — scales to weeks/months/years so a long-
 * dormant creator reads clearly (not "412d ago"). */
function fmtAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
function flag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const TYPE_LABEL: Record<string, string> = { influencer: "Influencer", daily_ugc: "Daily UGC", youtuber: "YouTuber", persona: "Persona", ambassador: "Ambassador", other: "Other" };

const inputCls =
  "rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

/** Square checkbox matching the DataTable / Columns-picker style. */
function CheckBox({ state, onClick, label }: { state: "on" | "off"; onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "on"}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
        state === "on" ? "border-jp-blue bg-jp-blue text-white" : "border-white/25 hover:border-white/45"
      )}
    >
      {state === "on" && <Check className="h-3 w-3" />}
    </button>
  );
}

export default function Creators() {
  const [data, setData] = useState<CreatorWithStats[]>([]);
  const [counts, setCounts] = useState<{ active: number; archived: number; total: number } | null>(null);
  const [scCredits, setScCredits] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("active");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tf, setTf] = useCreatorTimeframe();
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");

  // ---- bulk selection ----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Cache key = the inputs that change the result (timeframe by its stable
  // key, not the moving from/to timestamps).
  const cacheKey = useMemo(
    () => `creators-roster:${status}:${type}:${debounced}:${tf.key}:${tf.from ?? ""}:${tf.to ?? ""}`,
    [status, type, debounced, tf]
  );

  // Instant paint from the last cached result for this key (stale-while-
  // revalidate). The fetch below always runs and overwrites, so a manual
  // "Refresh all" (onDone → load) freshens the cache too.
  useEffect(() => {
    const cached = readCache<{ creators: CreatorWithStats[]; counts: typeof counts; scCredits: number | null }>(cacheKey);
    if (cached) {
      setData(cached.data.creators);
      setCounts(cached.data.counts);
      if (cached.data.scCredits != null) setScCredits(cached.data.scCredits);
    } else {
      setData([]);
    }
  }, [cacheKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fromISO, toISO } = resolveTimeframe(tf);
      const p = new URLSearchParams({ status, type, from: fromISO, to: toISO });
      if (debounced) p.set("search", debounced);
      const res = await fetch(`/api/creators?${p}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      const d = await res.json();
      setData(d.creators);
      setCounts(d.counts);
      if (d.scCredits != null) setScCredits(d.scCredits);
      writeCache(cacheKey, { creators: d.creators, counts: d.counts, scCredits: d.scCredits ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status, type, debounced, tf, cacheKey]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const mult = dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) * mult;
      if (sort === "posts") return (a.total_posts - b.total_posts) * mult;
      if (sort === "views") return (a.total_views - b.total_views) * mult;
      return (a.avg_views_per_post - b.avg_views_per_post) * mult;
    });
  }, [data, sort, dir]);

  const mainList = sorted.filter((c) => c.type !== "youtuber");
  const youtubers = sorted.filter((c) => c.type === "youtuber");

  // Drop anyone no longer on screen (filter/search change) from the selection,
  // so a hidden row can't be archived by a button the user thinks applies to
  // what they can see.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(sorted.map((c) => c.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sorted]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleIds = useMemo(() => sorted.map((c) => c.id), [sorted]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allVisibleIds));

  const selectedCreators = useMemo(() => sorted.filter((c) => selected.has(c.id)), [sorted, selected]);

  /** Run a manage action over the selection. Sent in small batches rather than
   * all at once so a large selection doesn't open 50 parallel writes, and
   * failures are counted rather than swallowed. */
  const runBulk = async (action: BulkAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    const tid = toast.loading(`${action === "delete" ? "Deleting" : action === "archive" ? "Archiving" : "Unarchiving"} ${ids.length}…`);

    let ok = 0;
    const failures: string[] = [];
    const nameOf = (id: string) => sorted.find((c) => c.id === id)?.name ?? id;

    for (let i = 0; i < ids.length; i += 4) {
      const batch = ids.slice(i, i + 4);
      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            const r = await fetch("/api/creators/manage", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              // `force` matches the single-creator Delete on a creator's own
              // page: without it the API refuses anything not already archived.
              body: JSON.stringify({ action, id, ...(action === "delete" ? { force: true } : {}) }),
            });
            const d = await r.json().catch(() => ({ ok: false }));
            return { id, ok: !!d.ok, error: d.error as string | undefined };
          } catch {
            return { id, ok: false, error: "Request failed" };
          }
        })
      );
      for (const r of results) {
        if (r.ok) ok++;
        else failures.push(`${nameOf(r.id)}${r.error ? `: ${r.error}` : ""}`);
      }
    }

    setBusy(false);
    setConfirmDelete(false);
    const verb = action === "delete" ? "Deleted" : action === "archive" ? "Archived" : "Unarchived";
    if (failures.length === 0) {
      toast.update(tid, { render: `${verb} ${ok}`, type: "success", isLoading: false, autoClose: 3000 });
    } else {
      toast.update(tid, {
        render: `${verb} ${ok}, ${failures.length} failed — ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`,
        type: ok > 0 ? "warning" : "error",
        isLoading: false,
        autoClose: 8000,
      });
    }
    setSelected(new Set());
    load();
  };

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir(k === "name" ? "asc" : "desc"); }
  };
  const SortLabel = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button onClick={() => clickSort(k)} className={cn("flex items-center gap-1 hover:text-ink-muted", className)}>
      <span>{children}</span>
      {sort === k ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Creators"
        subtitle={
          counts
            ? `${counts.active} active${counts.archived ? ` · ${counts.archived} archived` : ""} · stats over ${resolveTimeframe(tf).label.toLowerCase()}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {scCredits != null && (
              <span className="rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2.5 py-1.5 text-xs text-ink-muted" title="ScrapeCreators credits remaining">
                {scCredits >= 1000 ? `${(scCredits / 1000).toFixed(1)}K` : scCredits} credits
              </span>
            )}
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-jp-blue px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-jp-blue-light">
              <Plus className="h-4 w-4" /> Add creator
            </button>
            <RefreshButton action="all" windowDays={30} label="Refresh all" onDone={load} />
            <TimeframeFilter value={tf} onChange={setTf} />
          </div>
        }
      />

      <CreatorFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        kind="creator"
        personas={data.filter((c) => c.type === "persona").map((c) => ({ id: c.id, name: c.name }))}
        onSaved={(r) => { if (r.id) triggerAutoPull(r.id); setTimeout(load, 600); }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input className={inputCls + " w-56 pl-8"} placeholder="Search creators…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="persona">Personas</option>
          <option value="influencer">Influencer</option>
          <option value="daily_ugc">Daily UGC</option>
          <option value="youtuber">YouTuber</option>
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">Active + archived</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      <BatchBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="secondary" onClick={() => runBulk("archive")} disabled={busy}>
          <Archive className="h-3.5 w-3.5" /> Archive
        </Button>
        <Button size="sm" variant="secondary" onClick={() => runBulk("unarchive")} disabled={busy}>
          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
        </Button>
        <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </BatchBar>

      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-ink-muted"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading creators…</div>
      ) : data.length === 0 ? (
        <Empty title={debounced ? "No creators match" : "No creators"} description="Adjust the filters or timeframe." />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* Column headers */}
          <div className="mb-2 hidden items-center gap-7 px-4 text-[10px] font-semibold uppercase tracking-wider text-ink-faint md:flex">
            <div className="flex flex-1 items-center gap-3">
              <CheckBox state={allSelected ? "on" : "off"} onClick={toggleAll} label={allSelected ? "Deselect all" : "Select all"} />
              <SortLabel k="name" className="justify-start">Creator</SortLabel>
            </div>
            <span className="min-w-[84px] text-right">Last post</span>
            <SortLabel k="posts" className="min-w-[60px] justify-end">Posts</SortLabel>
            <SortLabel k="views" className="min-w-[64px] justify-end">Views</SortLabel>
            <SortLabel k="avg" className="min-w-[64px] justify-end">Avg / post</SortLabel>
          </div>

          <ul className="space-y-2.5">
            {mainList.map((c) => (
              <CreatorRow key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => toggle(c.id)} />
            ))}
          </ul>

          {youtubers.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-baseline gap-3 px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">YouTubers</h2>
                <span className="text-[10px] text-ink-faint/60">{youtubers.length} creator{youtubers.length === 1 ? "" : "s"}</span>
                <div className="ml-1 h-px flex-1 bg-gradient-to-r from-jp-blue/15 via-white/[0.04] to-transparent" />
              </div>
              <ul className="space-y-2.5">
                {youtubers.map((c) => (
                  <CreatorRow key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => toggle(c.id)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selected.size} creator${selected.size === 1 ? "" : "s"}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={() => runBulk("delete")} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete {selected.size}
            </Button>
          </>
        }
      >
        <p>
          This permanently deletes {selected.size === 1 ? "this creator" : "these creators"} <span className="font-medium text-ink">and every post scraped for them</span>. It
          cannot be undone. To take them off the roster while keeping the history, use Archive instead.
        </p>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-jp-navy/40 p-3 text-xs">
          {selectedCreators.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-ink">{c.name}</span>
              <span className="shrink-0 text-ink-faint">{c.total_posts} post{c.total_posts === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function CreatorRow({ c, selected, onToggle }: { c: CreatorWithStats; selected: boolean; onToggle: () => void }) {
  const platforms = (["instagram", "tiktok", "youtube"] as Platform[]).filter((p) => c[`${p}_handle` as const]);
  const isArchived = c.status === "archived";
  const isPersona = c.type === "persona";

  return (
    <li
      className={cn(
        "flex items-center overflow-hidden rounded-xl border bg-jp-navy-card/40 transition-colors",
        selected ? "border-jp-blue/45 bg-jp-blue/[0.06]" : "border-white/[0.06] hover:border-jp-blue/25 hover:bg-white/[0.02]"
      )}
    >
      {/* Outside the Link, so selecting never navigates. */}
      <div className="py-3.5 pl-4">
        <CheckBox state={selected ? "on" : "off"} onClick={onToggle} label={`Select ${c.name}`} />
      </div>

      <Link href={`/creators/${slugForCreator(c)}`} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5">
        {isPersona ? <PersonaAvatar name={c.name} accounts={c.accounts ?? []} size="md" /> : <CreatorAvatar name={c.name} src={c.profile_image_url} size="md" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{c.name}</span>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", isPersona ? "bg-jp-purple/15 text-jp-purple" : "bg-white/[0.06] text-ink-muted")}>
              {isPersona && <Users2 className="mr-0.5 inline h-2.5 w-2.5" />}{TYPE_LABEL[c.type] || c.type}
            </span>
            {c.region && <span className="text-xs">{flag(c.region)}</span>}
            {isArchived && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">Archived</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-faint">
            {platforms.map((p) => <PlatformPill key={p} platform={p} />)}
            <span className="truncate">{c.instagram_handle || c.tiktok_handle || c.youtube_handle || (isPersona ? "persona" : "")}</span>
            {c.last_scraped_at && <span className="text-ink-faint/70">· {fmtRelative(c.last_scraped_at)}</span>}
          </div>
        </div>
        <div className="hidden items-center gap-7 text-right md:flex">
          <LastPostCell iso={c.last_posted_at} />
          <Cell value={c.total_posts.toString()} />
          <Cell value={fmtCompact(c.total_views)} accent />
          <Cell value={c.total_posts > 0 ? fmtCompact(c.avg_views_per_post) : "—"} />
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint/50" />
      </Link>
    </li>
  );
}

function Cell({ value, accent }: { value: string; accent?: boolean }) {
  return <div className={cn("min-w-[60px] text-sm font-semibold num", accent ? "text-jp-blue-light" : "text-ink")}>{value}</div>;
}

/** "Last post" cell — relative time of the creator's most recent counted post.
 * Amber once it's been ≥14 days (a nudge that they've gone quiet); "—" if none
 * in the selected window. Hover shows the exact date/time. */
function LastPostCell({ iso }: { iso: string | null }) {
  if (!iso) return <div className="min-w-[84px] text-sm text-ink-faint">—</div>;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return (
    <div className={cn("min-w-[84px] text-sm font-medium", days >= 14 ? "text-amber-300/90" : "text-ink-muted")} title={new Date(iso).toLocaleString()}>
      {fmtAgo(iso)}
    </div>
  );
}
