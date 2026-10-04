"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Plus, Trash2, Star, Globe, RefreshCw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

const JUST_PRAY_ID = "6747154163";

interface Competitor {
  id: string;
  name: string;
  app_store_id: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  youtube_handle: string | null;
  website: string | null;
  app_store_price: string | null;
  app_store_rating: number | null;
  app_store_review_count: number;
  has_free_trial: boolean | null;
  iap_tiers: string | null;
  followers_ig: number;
  followers_tt: number;
  followers_yt: number;
  app_icon_url: string | null;
  genre_id: number | null;
  last_refreshed: string | null;
  notes: string | null;
}

interface RankingsData {
  rankings: { appId: string; appName: string; genreId?: number; rankings: { country: { code: string; name: string; flag: string }; rank: number | null }[] }[];
  countries: { code: string; name: string; flag: string }[];
  primaryCount: number;
  checkedAt: string;
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtNum = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-ink-faint">No rating</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.25;
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i <= full ? "fill-amber-400 text-amber-400" : i === full + 1 && half ? "fill-amber-400/50 text-amber-400" : "text-ink-faint"}`}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-ink-muted">{rating.toFixed(1)}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-sm text-ink-faint">-</span>;
  let color = "bg-white/[0.04] text-ink-muted";
  if (rank === 1) color = "bg-amber-500/20 text-amber-300 font-bold";
  else if (rank <= 3) color = "bg-amber-500/10 text-amber-300 font-semibold";
  else if (rank <= 10) color = "bg-emerald-500/15 text-emerald-300";
  else if (rank <= 50) color = "bg-jp-blue/15 text-jp-blue-light";
  return <span className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 text-sm num ${color}`}>#{rank}</span>;
}

const inputCls =
  "mt-1 w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";

const emptyForm = { name: "", app_store_id: "", instagram_handle: "", tiktok_handle: "", youtube_handle: "", website: "", notes: "" };

export default function Competitors() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [rankingsData, setRankingsData] = useState<RankingsData | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [compRes, rankRes] = await Promise.all([
        fetch("/api/competitors", { headers: authHeaders() }),
        fetch("/api/rankings", { headers: authHeaders() }), // cached blob — instant
      ]);
      if (compRes.ok) {
        const d = await compRes.json();
        if (Array.isArray(d)) setCompetitors(d);
      }
      if (rankRes.ok) {
        const r = await rankRes.json();
        if (r?.rankings) setRankingsData(r);
      }
    } catch {
      setError("Failed to load competitors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshRankings = async () => {
    setRankingsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rankings", { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      setRankingsData(await res.json());
      toast.success("Rankings refreshed and cached");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rankings refresh failed");
    } finally {
      setRankingsLoading(false);
    }
  };

  const addCompetitor = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: form.name.trim(),
          app_store_id: form.app_store_id.trim() || null,
          instagram_handle: form.instagram_handle.trim().replace(/^@/, "") || null,
          tiktok_handle: form.tiktok_handle.trim().replace(/^@/, "") || null,
          youtube_handle: form.youtube_handle.trim().replace(/^@/, "") || null,
          website: form.website.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Add failed");
      setForm({ ...emptyForm });
      setShowAdd(false);
      toast.success("Competitor added");
      load();
    } catch {
      toast.error("Failed to add competitor");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/competitors?id=${deleteTarget.id}`, { method: "DELETE", headers: authHeaders() });
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const sortedRankings = rankingsData?.rankings
    ? [...rankingsData.rankings.filter((r) => r.appId === JUST_PRAY_ID), ...rankingsData.rankings.filter((r) => r.appId !== JUST_PRAY_ID)]
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-muted">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading competitors…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Competitors & Rankings"
        subtitle={`${competitors.length} tracked · Top Free charts, ${rankingsData ? `last checked ${new Date(rankingsData.checkedAt).toLocaleString()}` : "not checked yet"}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <Button size="sm" onClick={refreshRankings} disabled={rankingsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${rankingsLoading ? "animate-spin" : ""}`} />
              {rankingsLoading ? "Checking…" : "Refresh Rankings"}
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>}

      {showAdd && (
        <div className="space-y-4 rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-ink">New Competitor</h3>
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ["name", "Name *", "App name"],
                ["app_store_id", "App Store ID", "e.g. 6747154163"],
                ["website", "Website", "https://example.com"],
                ["instagram_handle", "Instagram", "username"],
                ["tiktok_handle", "TikTok", "username"],
                ["youtube_handle", "YouTube", "channel handle"],
              ] as const
            ).map(([key, label, ph]) => (
              <div key={key}>
                <label className="text-xs font-medium text-ink-muted">{label}</label>
                <input className={inputCls} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addCompetitor} disabled={submitting || !form.name.trim()}>
              {submitting ? "Adding…" : "Add Competitor"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Rankings table — loads from cache instantly */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40">
        {rankingsData && sortedRankings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="sticky left-0 z-10 bg-jp-navy px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">App</th>
                  {rankingsData.countries.map((c, idx) => (
                    <th key={c.code} className={`px-3 py-3 text-center text-xs text-ink-muted ${idx === rankingsData.primaryCount ? "border-l-2 border-white/[0.10]" : ""}`} title={c.name}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-lg">{c.flag}</span>
                        <span className="text-[10px] uppercase">{c.code}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRankings.map((app) => {
                  const isJP = app.appId === JUST_PRAY_ID;
                  const comp = competitors.find((c) => c.app_store_id === app.appId);
                  return (
                    <tr key={app.appId} className={isJP ? "bg-jp-blue/[0.08]" : ""}>
                      <td className={`sticky left-0 z-10 px-5 py-3 ${isJP ? "bg-emerald-50" : "bg-white"}`}>
                        <div className="flex items-center gap-3">
                          {comp?.app_icon_url || isJP ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={isJP ? "/icon-200.png" : comp!.app_icon_url!} alt="" className="h-9 w-9 shrink-0 rounded-lg" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-sm font-semibold text-ink-muted">
                              {app.appName.charAt(0)}
                            </div>
                          )}
                          <span className={`whitespace-nowrap text-sm font-medium ${isJP ? "font-semibold text-jp-blue-light" : "text-ink"}`}>{app.appName}</span>
                        </div>
                      </td>
                      {app.rankings.map((r, idx) => (
                        <td key={r.country.code} className={`px-3 py-3 text-center ${idx === rankingsData.primaryCount ? "border-l-2 border-white/[0.10]" : ""}`}>
                          <RankBadge rank={r.rank} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rankingsLoading && !rankingsData && (
          <div className="flex items-center justify-center py-12 text-sm text-ink-faint">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Checking rankings across 50+ countries…
          </div>
        )}
        {!rankingsData && !rankingsLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-ink-faint">Hit &quot;Refresh Rankings&quot; — results are cached after the first run.</div>
        )}
      </div>

      {/* Competitor details (collapsible) */}
      <button onClick={() => setShowCards(!showCards)} className="flex items-center gap-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
        {showCards ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showCards ? "Hide" : "Show"} Competitor Details ({competitors.length})
      </button>

      {showCards && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {competitors.map((c) => (
            <div key={c.id} className="relative rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5 backdrop-blur-sm">
              <button
                onClick={() => setDeleteTarget(c)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="mb-4 flex items-start gap-3">
                {c.app_icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.app_icon_url} alt="" className="h-12 w-12 rounded-xl" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-jp-blue/15 text-lg font-semibold text-jp-blue-light">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1 pr-6">
                  <h3 className="truncate text-base font-semibold text-ink">{c.name}</h3>
                  {c.app_store_id && <span className="text-xs text-ink-faint">ID: {c.app_store_id}</span>}
                  {c.website && (
                    <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-jp-blue-light hover:underline">
                      <Globe className="h-3 w-3" />
                      {c.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between">
                <StarRating rating={c.app_store_rating} />
                {c.app_store_review_count > 0 && <span className="text-xs text-ink-faint">{fmtNum(c.app_store_review_count)} reviews</span>}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {c.app_store_price && <Badge variant="default">{c.app_store_price}</Badge>}
                {c.has_free_trial && <Badge variant="success">Free Trial</Badge>}
                {c.iap_tiers && <Badge variant="info">{c.iap_tiers}</Badge>}
              </div>
              {(c.followers_ig > 0 || c.followers_tt > 0 || c.followers_yt > 0) && (
                <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                  {c.followers_ig > 0 && <span>IG {fmtNum(c.followers_ig)}</span>}
                  {c.followers_tt > 0 && <span>TT {fmtNum(c.followers_tt)}</span>}
                  {c.followers_yt > 0 && <span>YT {fmtNum(c.followers_yt)}</span>}
                </div>
              )}
              {c.notes && <div className="text-xs italic text-ink-faint">{c.notes}</div>}
            </div>
          ))}
          {competitors.length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-sm text-ink-faint">
              No competitors yet — add your first above.
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        This removes the competitor and its tracked data. This cannot be undone.
      </Modal>
    </div>
  );
}
