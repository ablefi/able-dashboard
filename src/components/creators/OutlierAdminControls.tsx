"use client";

import { useState, useTransition } from "react";
import { Check, CircleSlash, Loader2, RefreshCw, Trash2, Globe, Film } from "lucide-react";
import { cn } from "@/lib/utils";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
async function action(body: Record<string, unknown>) {
  const res = await fetch("/api/creators/outliers", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false }));
}

type ArchiveStatus = "pending" | "archived" | "failed" | "skipped_yt" | null;

/**
 * Admin row under each outlier card — ported from jp-creators'
 * OutlierAdminControls. Shows archive status (so you know the video is
 * safely backed up to the top-videos bucket) and gates the Publish
 * toggle that actually promotes the post on the public site.
 *
 *   star → auto-archives → review → Publish → live on /topvideos
 */
export function OutlierAdminControls({
  postId,
  initialStatus,
  initialPublished,
  initialError,
  platform,
}: {
  postId: string;
  initialStatus: ArchiveStatus;
  initialPublished: boolean;
  initialError?: string | null;
  platform: "instagram" | "tiktok" | "youtube";
}) {
  const [status, setStatus] = useState<ArchiveStatus>(initialStatus);
  const [published, setPublished] = useState(initialPublished);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, start] = useTransition();

  const archived = status === "archived" || status === "skipped_yt";

  function doArchive() {
    setError(null);
    setStatus("pending");
    start(async () => {
      const r = await action({ action: "archive", id: postId });
      if (r.ok) setStatus((r.status as ArchiveStatus) ?? "archived");
      else { setStatus("failed"); setError(r.error ?? "Archive failed"); }
    });
  }

  function doPublish(next: boolean) {
    if (next && !archived) { setError("Archive must finish before publishing."); return; }
    setError(null);
    setPublished(next);
    start(async () => {
      const r = await action({ action: "publish", id: postId, value: next });
      if (!r.ok) { setPublished(!next); setError(r.error ?? "Publish failed"); }
    });
  }

  function doDelete() {
    setError(null);
    start(async () => {
      const r = await action({ action: "delete_archive", id: postId });
      if (r.ok) { setStatus(null); setPublished(false); }
    });
  }

  const pill = (cls: string, icon: React.ReactNode, label: string) => (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", cls)}>{icon}{label}</span>
  );

  return (
    <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
      <div className="flex items-center gap-1.5">
        {/* Archive status */}
        {status === "pending" ? (
          pill("bg-amber-500/15 text-amber-300", <Loader2 className="h-2.5 w-2.5 animate-spin" />, "Archiving…")
        ) : status === "archived" ? (
          pill("bg-emerald-500/15 text-emerald-300", <Check className="h-2.5 w-2.5" strokeWidth={3} />, "Archived")
        ) : status === "skipped_yt" ? (
          pill("bg-white/[0.06] text-ink-muted", <Film className="h-2.5 w-2.5" />, "Link-out")
        ) : status === "failed" ? (
          <button onClick={doArchive} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/25">
            <RefreshCw className="h-2.5 w-2.5" /> Retry archive
          </button>
        ) : (
          <button onClick={doArchive} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-white/[0.08]">
            <RefreshCw className="h-2.5 w-2.5" /> Archive
          </button>
        )}

        {/* Delete archive (only when there's something to clear) */}
        {(status === "archived" || status === "failed") && (
          <button onClick={doDelete} disabled={pending} title="Delete archive" className="inline-flex items-center justify-center rounded-md p-1 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-rose-300">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Publish toggle — gated on archive */}
      <button
        onClick={() => doPublish(!published)}
        disabled={pending || (!archived && !published)}
        title={!archived ? "Archive must finish before publishing" : published ? "Remove from /topvideos" : "Publish to /topvideos"}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
          published
            ? "bg-jp-blue/20 text-jp-blue-light ring-1 ring-inset ring-jp-blue/40 hover:bg-jp-blue/25"
            : archived
              ? "bg-white/[0.05] text-ink hover:bg-white/[0.08]"
              : "cursor-not-allowed bg-white/[0.03] text-ink-faint/50",
        )}
      >
        {published ? <Globe className="h-3 w-3" /> : <CircleSlash className="h-3 w-3" />}
        {published ? "Published to topvideos" : "Publish to topvideos"}
      </button>

      {error && <p className="text-[10px] leading-tight text-rose-300">{error}</p>}
    </div>
  );
}
