"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Check, X, Star, Inbox, CheckCheck, Send, Pencil, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";
import Pagination from "@/components/ui/Pagination";

type Status = "pending" | "approved" | "rejected" | "posted" | "failed";

interface Draft {
  id: string;
  rating: number;
  territory: string;
  title: string;
  body: string;
  nickname: string;
  createdDate: string;
  draft: string;
  status: Status;
  edited?: boolean;
  error?: string | null;
}
interface Counts { total: number; pending: number; approved: number; rejected: number; posted: number; failed: number }

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PAGE = 25;

export default function Reviews() {
  const { can } = useAuth();
  const canWrite = can("reviews:write");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [matched, setMatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [rating, setRating] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Pending edits, flushed on a debounce with only ONE request in flight, so
  // rapid ticking can't interleave two read-modify-writes and lose one.
  const dirty = useRef<Map<string, { status?: Status; draft?: string }>>(new Map());
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `status=${status}&rating=${rating}&limit=${PAGE}&offset=${page * PAGE}`;
      const res = await fetch(`/api/reviews?${qs}`, { headers: authHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const d = await res.json();
      setDrafts(d.drafts);
      setCounts(d.counts);
      setMatched(d.matched);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status, rating, page]);

  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    if (inFlight.current || dirty.current.size === 0) return;
    inFlight.current = true;
    setSaving(true);
    const batch = [...dirty.current.entries()].map(([id, v]) => ({ id, ...v }));
    dirty.current.clear();
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ patches: batch }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setCounts(d.counts);
      setSavedAt(Date.now());
    } catch (e) {
      // Put them back so nothing is silently lost.
      for (const b of batch) dirty.current.set(b.id, { status: b.status, draft: b.draft });
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      inFlight.current = false;
      setSaving(false);
      if (dirty.current.size > 0) void flush();
    }
  }, []);

  const queue = useCallback((id: string, patch: { status?: Status; draft?: string }) => {
    dirty.current.set(id, { ...dirty.current.get(id), ...patch });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }, [flush]);

  // Don't let a half-saved queue disappear on navigate away.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0 || inFlight.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const setStatusFor = (id: string, s: Status) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status: s } : d)));
    queue(id, { status: s });
  };
  const setDraftFor = (id: string, text: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, draft: text, edited: true } : d)));
    queue(id, { draft: text });
  };

  const approveAllVisible = () => {
    const targets = drafts.filter((d) => d.status !== "posted" && d.status !== "approved");
    if (targets.length === 0) return;
    setDrafts((prev) => prev.map((d) => (d.status === "posted" ? d : { ...d, status: "approved" })));
    for (const t of targets) queue(t.id, { status: "approved" });
    toast.success(`Approved ${targets.length} on this page.`);
  };

  const pages = Math.max(1, Math.ceil(matched / PAGE));
  const chip = (active: boolean) =>
    cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "bg-app-blue text-white" : "bg-app-navy-card/60 text-ink-muted hover:text-ink");

  /**
   * Pull new Apple reviews.
   *
   * The dashboard cannot call App Store Connect itself — that key stays off
   * Vercel so nothing here can publish to the App Store. This records a
   * request; the worker on the owner's computer picks it up within ~30s and stamps
   * `completedAt` when done, which is what we wait for. If that Mac is asleep
   * the request just waits, so we time out rather than spin forever.
   */
  const syncReviews = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/reviews/sync", { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || "Could not request a sync");
      const { requestedAt } = await res.json();

      const deadline = Date.now() + 90_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch("/api/reviews/sync", { headers: authHeaders(), cache: "no-store" });
        if (st.ok) {
          const d = await st.json();
          if (d.completedAt && d.completedAt >= requestedAt) {
            setPage(0);
            await load();
            toast.success("Apple reviews up to date");
            return;
          }
        }
        if (Date.now() > deadline) {
          toast.info("Sync requested. The Mac that fetches reviews looks asleep, it will run when it wakes.");
          return;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apple reviews"
        subtitle="Approve, reject or edit the replies to App Store reviews. Approved replies get posted to the App Store."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-faint">
              {saving ? "Saving…" : savedAt ? "Saved" : ""}
            </span>
            <Button size="sm" variant="secondary" disabled={!canWrite || syncing} onClick={syncReviews}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncing ? "Fetching…" : "Refresh"}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting you" value={(counts?.pending ?? 0).toLocaleString()} icon={Inbox} />
        <StatCard label="Approved" value={(counts?.approved ?? 0).toLocaleString()} icon={CheckCheck} />
        <StatCard label="Rejected" value={(counts?.rejected ?? 0).toLocaleString()} icon={X} />
        <StatCard label="Posted" value={(counts?.posted ?? 0).toLocaleString()} icon={Send} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-app-navy-card/60 p-4">
        <span className="mr-1 text-xs text-ink-faint">Show</span>
        {["pending", "approved", "rejected", "posted", "all"].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(0); }} className={chip(status === s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-white/10" />
        <span className="mr-1 text-xs text-ink-faint">Stars</span>
        {["all", "1", "2", "3", "4", "5"].map((r) => (
          <button key={r} onClick={() => { setRating(r); setPage(0); }} className={chip(rating === r)}>
            {r === "all" ? "All" : `${r}★`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-faint">{matched.toLocaleString()} match</span>
          <Button size="sm" variant="secondary" onClick={approveAllVisible} disabled={!canWrite || loading || drafts.length === 0}>
            <CheckCheck className="h-3.5 w-3.5" /> Approve page
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-ink-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/60 py-16 text-center text-sm text-ink-muted">
          Nothing here. Try a different filter.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <div
              key={d.id}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                d.status === "approved" ? "border-app-green/40 bg-app-green/[0.06]"
                  : d.status === "rejected" ? "border-app-red/40 bg-app-red/[0.06]"
                  : d.status === "posted" ? "border-app-blue/40 bg-app-blue/[0.06]"
                  : "border-white/[0.06] bg-app-navy-card/60"
              )}
            >
              {/* the review */}
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <span className="flex items-center gap-0.5 text-app-orange">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={cn("h-3.5 w-3.5", i < d.rating ? "fill-app-orange" : "opacity-25")} />
                  ))}
                </span>
                <span className="font-medium text-ink-muted">{d.territory}</span>
                <span>·</span>
                <span>{d.createdDate}</span>
                {d.nickname && (<><span>·</span><span>{d.nickname}</span></>)}
                {d.status === "posted" && <span className="ml-auto rounded-full bg-app-blue/20 px-2 py-0.5 text-[10px] font-medium text-app-blue-light">Posted</span>}
                {d.edited && d.status !== "posted" && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-ink-faint"><Pencil className="h-3 w-3" /> edited</span>
                )}
              </div>
              {d.title && <p className="text-sm font-semibold text-ink">{d.title}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{d.body}</p>

              {/* the reply */}
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <textarea
                  value={d.draft}
                  onChange={(e) => setDraftFor(d.id, e.target.value)}
                  disabled={!canWrite || d.status === "posted"}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none disabled:opacity-60"
                  placeholder="Reply…"
                />
                {d.error && <p className="mt-1 text-xs text-app-red-text">{d.error}</p>}
                {d.status !== "posted" && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      disabled={!canWrite}
                      onClick={() => setStatusFor(d.id, d.status === "approved" ? "pending" : "approved")}
                      title="Approve"
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                        d.status === "approved"
                          ? "border-app-green/50 bg-app-green/20 text-app-green"
                          : "border-white/[0.1] text-ink-muted hover:border-app-green/40 hover:text-app-green"
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      disabled={!canWrite}
                      onClick={() => setStatusFor(d.id, d.status === "rejected" ? "pending" : "rejected")}
                      title="Reject (don't reply to this one)"
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                        d.status === "rejected"
                          ? "border-app-red/50 bg-app-red/20 text-app-red-text"
                          : "border-white/[0.1] text-ink-muted hover:border-app-red/40 hover:text-app-red-text"
                      )}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-ink-faint">
                      {d.status === "approved" ? "Approved" : d.status === "rejected" ? "Skipped" : "Awaiting you"}
                    </span>
                    <span className="ml-auto text-[11px] text-ink-faint">{d.draft.length} chars</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          {/* `page` is 0-indexed here; Pagination is 1-based, so shift both ways. */}
          <Pagination page={page + 1} totalPages={pages} onChange={(p) => setPage(p - 1)} />
        </div>
      )}
    </div>
  );
}
