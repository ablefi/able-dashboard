"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { ableCreatorWrite } from "@/lib/useAbleReport";
import {
  CREATOR_KINDS,
  CREATOR_STATUSES,
  KIND_RULE,
  postFlagBody,
  todayUtc,
  type CreatorKind,
  type CreatorReportPost,
  type CreatorRow,
  type CreatorStatus,
  type CreatorWriteBody,
  type CreatorsReport,
  type FeedRefreshResult,
  type PostFlagAction,
} from "./creatorTypes";

// Client-side mirror of validateCreator, codeOwner and handleOwner in
// apps/api/src/creators.ts. The API stays the authority: whatever it rejects is
// shown with its own message.
const CODE_RE = /^[A-Z0-9_.-]{2,32}$/;
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const NAME_MAX = 80;
const NOTES_MAX = 2000;
const FEE_CENTS_MAX = 1_000_000_000;

/** Same normalisation as the API: no @, no profile URL prefix, no trailing path. */
function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\/(?:@)?/i, "").replace(/[/?#].*$/, "");
}

function parseCodes(raw: string): string[] {
  return [...new Set(raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

type Draft = {
  name: string;
  kind: CreatorKind;
  status: CreatorStatus;
  instagramHandle: string;
  tiktokHandle: string;
  youtubeHandle: string;
  codes: string;
  fee: string;
  startedAt: string;
  dealNotes: string;
};

function draftFor(c: CreatorRow | null): Draft {
  return {
    name: c?.name ?? "",
    kind: c?.kind ?? "influencer",
    status: c?.status ?? "active",
    instagramHandle: c?.instagramHandle ?? "",
    tiktokHandle: c?.tiktokHandle ?? "",
    youtubeHandle: c?.youtubeHandle ?? "",
    codes: c?.codes.join(", ") ?? "",
    fee: c?.feeCents ? (c.feeCents / 100).toFixed(2) : "",
    startedAt: c?.startedAt ?? todayUtc(),
    dealNotes: c?.dealNotes ?? "",
  };
}

/** The request body, or the first problem the API would also reject. */
function buildBody(d: Draft, editing: CreatorRow | null, roster: CreatorRow[]): CreatorWriteBody | string {
  const name = d.name.trim();
  if (!name) return "Enter the creator's name.";
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;

  const handles = {
    instagramHandle: normalizeHandle(d.instagramHandle),
    tiktokHandle: normalizeHandle(d.tiktokHandle),
    youtubeHandle: normalizeHandle(d.youtubeHandle),
  };
  const labels = { instagramHandle: "Instagram", tiktokHandle: "TikTok", youtubeHandle: "YouTube" } as const;
  for (const key of Object.keys(handles) as Array<keyof typeof handles>) {
    const h = handles[key];
    if (h && !HANDLE_RE.test(h)) return `${labels[key]} handle may only use letters, digits, dot, dash and underscore.`;
  }

  const codes = parseCodes(d.codes);
  for (const c of codes) {
    if (!CODE_RE.test(c)) return `Invite code ${c} may only use letters, digits, dot, dash and underscore (2 to 32 characters).`;
  }
  if (!codes.length && !handles.instagramHandle && !handles.tiktokHandle && !handles.youtubeHandle) {
    return "Enter an invite code or at least one handle.";
  }

  const feeText = d.fee.trim().replace(/^\$/, "").replace(/,/g, "");
  if (feeText && !/^\d+(\.\d{1,2})?$/.test(feeText)) return "Fee must be a USD amount with at most 2 decimals, or blank for a gifted deal.";
  const feeCents = feeText ? Math.round(Number(feeText) * 100) : 0;
  if (!Number.isInteger(feeCents) || feeCents < 0 || feeCents > FEE_CENTS_MAX) return "Fee must be 10,000,000 USD or less.";

  const startedAt = d.startedAt.trim() || todayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt) || Number.isNaN(Date.parse(`${startedAt}T00:00:00Z`))) return "Start date must be YYYY-MM-DD.";

  const dealNotes = d.dealNotes.trim();
  if (dealNotes.length > NOTES_MAX) return `Deal notes must be ${NOTES_MAX} characters or fewer.`;

  // A code or a feed under two creators would double count; the API answers 409.
  const selfId = editing?.id ?? "";
  for (const other of roster) {
    if (other.id === selfId) continue;
    const code = codes.find((c) => other.codes.includes(c));
    if (code) return `Invite code ${code} is already attributed to ${other.name}.`;
  }
  const same = (a: string, b: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
  for (const other of roster) {
    if (other.id === selfId) continue;
    if (same(handles.instagramHandle, other.instagramHandle)) return `Instagram handle ${handles.instagramHandle} is already tracked as ${other.name}.`;
    if (same(handles.tiktokHandle, other.tiktokHandle)) return `TikTok handle ${handles.tiktokHandle} is already tracked as ${other.name}.`;
    if (same(handles.youtubeHandle, other.youtubeHandle)) return `YouTube handle ${handles.youtubeHandle} is already tracked as ${other.name}.`;
  }

  return {
    ...(editing ? { id: editing.id } : {}),
    name,
    kind: d.kind,
    status: d.status,
    ...handles,
    codes,
    feeCents,
    dealNotes,
    startedAt,
  };
}

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-faint";
const hintCls = "mt-1 text-[11px] leading-snug text-ink-faint";

function Field({ label, hint, htmlFor, className, children }: { label: string; hint?: ReactNode; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

/**
 * Add or edit one creator. Mount it with a `key` per creator so the draft starts
 * from that creator's saved values.
 */
export default function CreatorForm({
  open,
  creator,
  roster,
  kinds,
  statuses,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null adds a new creator. */
  creator: CreatorRow | null;
  roster: CreatorRow[];
  kinds?: CreatorKind[];
  statuses?: CreatorStatus[];
  onClose: () => void;
  onSaved: (saved: CreatorRow, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(creator));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const close = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  // A second POST for a new creator would add them twice: one save at a time.
  const inFlight = useRef(false);
  const save = async () => {
    if (inFlight.current) return;
    const body = buildBody(draft, creator, roster);
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setError(null);
    inFlight.current = true;
    setSaving(true);
    try {
      const saved = await ableCreatorWrite<CreatorRow>("POST", "/creators", body);
      onSaved(saved, !creator);
    } catch (e) {
      inFlight.current = false;
      setSaving(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const kindOptions = kinds?.length ? kinds : CREATOR_KINDS;
  const statusOptions = statuses?.length ? statuses : CREATOR_STATUSES;

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={creator ? `Edit ${creator.name}` : "Add creator"}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { if (!saving) void save(); }} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void save();
        }}
        onKeyDown={(e) => {
          // Enter in a single-line field saves; Enter in the notes adds a line.
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && !saving) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <Field label="Name" htmlFor="cf-name" className="sm:col-span-2">
          <input id="cf-name" className={inputCls} value={draft.name} maxLength={NAME_MAX} autoFocus onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Kind" htmlFor="cf-kind" hint={KIND_RULE[draft.kind]}>
          <select id="cf-kind" className={inputCls} value={draft.kind} onChange={(e) => set("kind", e.target.value as CreatorKind)}>
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="cf-status">
          <select id="cf-status" className={inputCls} value={draft.status} onChange={(e) => set("status", e.target.value as CreatorStatus)}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
          <Field label="Instagram handle" htmlFor="cf-ig">
            <input id="cf-ig" className={inputCls} value={draft.instagramHandle} placeholder="without @" onChange={(e) => set("instagramHandle", e.target.value)} />
          </Field>
          <Field label="TikTok handle" htmlFor="cf-tt">
            <input id="cf-tt" className={inputCls} value={draft.tiktokHandle} placeholder="without @" onChange={(e) => set("tiktokHandle", e.target.value)} />
          </Field>
          <Field label="YouTube handle" htmlFor="cf-yt">
            <input id="cf-yt" className={inputCls} value={draft.youtubeHandle} placeholder="without @" onChange={(e) => set("youtubeHandle", e.target.value)} />
          </Field>
          <p className={`${hintCls} -mt-2 sm:col-span-3`}>The accounts to scrape. Leave blank for a code-only deal.</p>
        </div>

        <Field
          label="Invite codes"
          htmlFor="cf-codes"
          className="sm:col-span-2"
          hint="Each code must exist in INVITE_CODES on the API, or be the creator's Able username"
        >
          <input id="cf-codes" className={`${inputCls} font-mono`} value={draft.codes} placeholder="Comma separated" onChange={(e) => set("codes", e.target.value)} />
        </Field>
        <Field label="Fee (USD)" htmlFor="cf-fee" hint="Blank for a gifted or affiliate-only deal.">
          <input id="cf-fee" className={`${inputCls} num`} inputMode="decimal" value={draft.fee} placeholder="0.00" onChange={(e) => set("fee", e.target.value)} />
        </Field>
        <Field label="Start date (UTC)" htmlFor="cf-start" hint="YYYY-MM-DD the deal started.">
          <input id="cf-start" type="date" className={inputCls} value={draft.startedAt} onChange={(e) => set("startedAt", e.target.value)} />
        </Field>
        <Field label="Deal notes" htmlFor="cf-notes" className="sm:col-span-2">
          <textarea
            id="cf-notes"
            rows={3}
            className={inputCls}
            value={draft.dealNotes}
            maxLength={NOTES_MAX}
            placeholder="Posts agreed, payment schedule"
            onChange={(e) => set("dealNotes", e.target.value)}
          />
        </Field>

        {error && (
          <div role="alert" className="rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-sm text-app-red-text sm:col-span-2">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "3 new posts, 2 updated" plus any failures, as the old Ops page reported it. */
export function feedRefreshMessage(r: FeedRefreshResult): { text: string; problem: boolean } {
  let text = `${plural(r.inserted ?? 0, "new post")}, ${(r.updated ?? 0).toLocaleString()} updated`;
  const errors = r.errors ?? [];
  if (r.failed) text += `, ${plural(r.failed, "creator")} failed`;
  if (errors.length) {
    const shown = errors.slice(0, 3).join("; ");
    text += `. Problems: ${shown}${errors.length > 3 ? `; and ${errors.length - 3} more` : ""}`;
  }
  return { text, problem: Boolean(r.failed || errors.length) };
}

/**
 * Every creator write a page offers: add, edit, remove, refresh feeds, and post
 * decisions. Render `dialogs` once on the page.
 */
export function useCreatorEditor({ report, refresh }: { report: CreatorsReport | null; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<{ creator: CreatorRow | null; seq: number } | null>(null);
  const [removing, setRemoving] = useState<{ creator: CreatorRow; onRemoved?: () => void } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [feedBusy, setFeedBusy] = useState<ReadonlySet<string>>(new Set());
  const [postBusy, setPostBusy] = useState<ReadonlySet<string>>(new Set());
  const feedInFlight = useRef(new Set<string>());

  const roster = report?.creators ?? [];
  const scrapingOn = Boolean(report?.scraping.enabled);

  const openAdd = useCallback(() => setForm({ creator: null, seq: Date.now() }), []);
  const openEdit = useCallback((creator: CreatorRow) => setForm({ creator, seq: Date.now() }), []);
  const askRemove = useCallback((creator: CreatorRow, onRemoved?: () => void) => {
    setRemoveError(null);
    setRemoving({ creator, onRemoved });
  }, []);

  /** One creator's feed, or every creator's when `creator` is omitted. */
  const refreshFeed = useCallback(
    async (creator?: Pick<CreatorRow, "id" | "name">) => {
      const key = creator?.id ?? "*";
      // A pull spends ScrapeCreators credits: never send a second one for the same feed.
      if (feedInFlight.current.has(key)) return;
      feedInFlight.current.add(key);
      setFeedBusy(new Set(feedInFlight.current));
      try {
        const path = creator ? `/creators/${encodeURIComponent(creator.id)}/refresh` : "/creators/refresh";
        const r = await ableCreatorWrite<FeedRefreshResult>("POST", path, {});
        const { text, problem } = feedRefreshMessage(r);
        const prefix = creator ? `${creator.name}: ` : "All feeds: ";
        (problem ? toast.warning : toast.success)(prefix + text);
        await refresh();
      } catch (e) {
        toast.error(`Could not refresh: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        feedInFlight.current.delete(key);
        setFeedBusy(new Set(feedInFlight.current));
      }
    },
    [refresh],
  );

  const setPostFlag = useCallback(
    async (post: Pick<CreatorReportPost, "id">, action: PostFlagAction) => {
      setPostBusy((prev) => new Set(prev).add(post.id));
      try {
        await ableCreatorWrite("POST", `/creators/posts/${encodeURIComponent(post.id)}`, postFlagBody(action));
        await refresh();
      } catch (e) {
        toast.error(`Could not update the post: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setPostBusy((prev) => {
          const next = new Set(prev);
          next.delete(post.id);
          return next;
        });
      }
    },
    [refresh],
  );

  const onSaved = async (saved: CreatorRow, isNew: boolean) => {
    setForm(null);
    toast.success(isNew ? `Added ${saved.name}.` : `Saved ${saved.name}.`);
    await refresh();
    // A new creator with a feed gets its first pull straight away so their posts
    // show now rather than after the next 8-hour sweep.
    if (isNew && scrapingOn && (saved.instagramHandle || saved.tiktokHandle || saved.youtubeHandle)) {
      toast.info(`Pulling ${saved.name}'s feed.`);
      await refreshFeed(saved);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await ableCreatorWrite("DELETE", `/creators/${encodeURIComponent(removing.creator.id)}`);
      const { creator, onRemoved } = removing;
      setRemoving(null);
      toast.success(`Removed ${creator.name}.`);
      if (onRemoved) onRemoved();
      else await refresh();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoveBusy(false);
    }
  };

  const dialogs = (
    <>
      {form && (
        <CreatorForm
          key={`${form.creator?.id ?? "new"}:${form.seq}`}
          open
          creator={form.creator}
          roster={roster}
          kinds={report?.kinds}
          statuses={report?.statuses}
          onClose={() => setForm(null)}
          onSaved={(saved, isNew) => void onSaved(saved, isNew)}
        />
      )}
      <Modal
        open={Boolean(removing)}
        onClose={() => {
          if (!removeBusy) setRemoving(null);
        }}
        title="Remove creator"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(null)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => void confirmRemove()} disabled={removeBusy}>
              {removeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Remove
            </Button>
          </>
        }
      >
        <p>Remove {removing?.creator.name}? Their scraped posts are deleted. Signups stay attributed to the code.</p>
        {removeError && (
          <div role="alert" className="mt-3 rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-sm text-app-red-text">
            {removeError}
          </div>
        )}
      </Modal>
    </>
  );

  return { openAdd, openEdit, askRemove, refreshFeed, setPostFlag, feedBusy, postBusy, scrapingOn, dialogs };
}

/** Title for a disabled feed refresh. */
export const SCRAPING_OFF = "Scraping is off: SCRAPECREATORS_API_KEY is not set on the API.";
