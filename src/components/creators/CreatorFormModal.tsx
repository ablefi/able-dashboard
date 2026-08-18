"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Search, Plus } from "lucide-react";
import { toast } from "react-toastify";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface CreatorFormValues {
  id?: string;
  name?: string;
  type?: string;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  youtube_handle?: string | null;
  parent_id?: string | null;
}

interface SearchHit { platform: "tiktok" | "youtube"; handle: string; name: string; followers?: number; avatarUrl?: string }

const inputCls = "w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

/**
 * Add / edit a creator or prospect. ScrapeCreators handle search autofills
 * the platform fields. `kind` switches the endpoint + which fields show
 * (prospects have no type/parent). On success the parent fires the
 * auto-pull (refresh + profile) for the new/edited id via onSaved(id).
 */
export default function CreatorFormModal({
  open,
  onClose,
  kind,
  initial,
  personas,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: "creator" | "prospect";
  initial?: CreatorFormValues | null;
  /** Persona options for the parent dropdown (creators only). */
  personas?: { id: string; name: string }[];
  onSaved?: (r: { id?: string; handleChanged?: boolean }) => void;
}) {
  const editing = !!initial?.id;
  const [name, setName] = useState("");
  const [type, setType] = useState("influencer");
  const [ig, setIg] = useState("");
  const [tt, setTt] = useState("");
  const [yt, setYt] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "influencer");
    setIg(initial?.instagram_handle ?? "");
    setTt(initial?.tiktok_handle ?? "");
    setYt(initial?.youtube_handle ?? "");
    setParentId(initial?.parent_id ?? "");
    setQ(""); setHits([]);
  }, [open, initial]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (q.trim().length < 2) { setHits([]); return; }
    debRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/creators/search?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() });
        const d = await r.json();
        setHits(d.results ?? []);
      } catch { setHits([]); } finally { setSearching(false); }
    }, 350);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [q]);

  const applyHit = (h: SearchHit) => {
    if (!name) setName(h.name);
    if (h.platform === "tiktok") setTt(h.handle);
    else setYt(h.handle);
    setQ(""); setHits([]);
  };

  const isPersona = kind === "creator" && type === "persona";

  async function submit() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!isPersona && !ig.trim() && !tt.trim() && !yt.trim()) { toast.error("At least one handle is required"); return; }
    setSaving(true);
    try {
      const endpoint = kind === "creator" ? "/api/creators/manage" : "/api/prospects";
      const body: Record<string, unknown> = {
        action: editing ? "update" : "create",
        id: initial?.id,
        name: name.trim(),
        instagram_handle: ig.trim() || null, tiktok_handle: tt.trim() || null, youtube_handle: yt.trim() || null,
      };
      if (kind === "creator") { body.type = type; body.parent_id = parentId || null; }
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.ok === false) { toast.error(d.error || "Save failed"); setSaving(false); return; }
      toast.success(editing ? "Saved" : `${kind === "creator" ? "Creator" : "Prospect"} added`);
      onSaved?.({ id: d.id ?? initial?.id, handleChanged: d.handleChanged });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${editing ? "Edit" : "Add"} ${kind === "creator" ? "creator" : "prospect"}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* SC search */}
        <div>
          <label className={labelCls}>Search TikTok / YouTube (autofills handle)</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input className={inputCls + " pl-8"} placeholder="Search a name or @handle…" value={q} onChange={(e) => setQ(e.target.value)} />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-faint" />}
          </div>
          {hits.length > 0 && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-white/[0.08] bg-jp-navy">
              {hits.map((h, i) => (
                <li key={i}>
                  <button onClick={() => applyHit(h)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink">
                    <span className={cn("rounded px-1 py-0.5 text-[9px] font-semibold", h.platform === "tiktok" ? "bg-jp-cyan/15 text-jp-cyan" : "bg-red-500/15 text-red-400")}>{h.platform === "tiktok" ? "TT" : "YT"}</span>
                    <span className="font-medium text-ink">{h.name}</span>
                    <span className="text-ink-faint">@{h.handle}</span>
                    {h.followers != null && <span className="ml-auto text-ink-faint">{h.followers >= 1000 ? `${(h.followers / 1000).toFixed(0)}K` : h.followers}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] text-ink-faint">Instagram has no search API — type the IG handle manually.</p>
        </div>

        <div>
          <label className={labelCls}>Name <span className="text-rose-400">*</span></label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
        </div>

        {kind === "creator" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="influencer">Influencer</option>
                <option value="daily_ugc">Daily UGC</option>
                <option value="youtuber">YouTuber</option>
                <option value="persona">Persona</option>
              </select>
            </div>
            {!isPersona && (personas?.length ?? 0) > 0 && (
              <div>
                <label className={labelCls}>Parent persona (optional)</label>
                <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">— none —</option>
                  {personas!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {!isPersona && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>Instagram</label><input className={inputCls} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="handle" /></div>
            <div><label className={labelCls}>TikTok</label><input className={inputCls} value={tt} onChange={(e) => setTt(e.target.value)} placeholder="handle" /></div>
            <div><label className={labelCls}>YouTube</label><input className={inputCls} value={yt} onChange={(e) => setYt(e.target.value)} placeholder="handle" /></div>
          </div>
        )}
        {isPersona && <p className="text-xs text-ink-faint">Personas have no handles of their own — add child accounts after creating it.</p>}
      </div>
    </Modal>
  );
}

/** Fire the post + avatar pull for a freshly created/edited creator (client-side, reliable). */
export function triggerAutoPull(id: string) {
  fetch("/api/creators/refresh", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ action: "creator", id }) }).catch(() => {});
  fetch("/api/creators/profile", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ action: "profile", id }) }).catch(() => {});
}

export { Plus };
