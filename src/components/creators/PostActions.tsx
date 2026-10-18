"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Star, X } from "lucide-react";
import { creatorApi } from "@/lib/creatorMarketClient";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function patchPost(id: string, field: "approved" | "excluded" | "is_outlier", value: boolean) {
  try {
    await fetch(creatorApi("/api/creators/posts"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, field, value }),
    });
    // Starring auto-archives the video (download → top-videos bucket) so it's
    // ready to publish to /topvideos. Fire-and-forget; the Outliers tab shows
    // archive status + the Publish toggle. Mirrors roster' OutlierToggle.
    if (field === "is_outlier" && value) {
      fetch(creatorApi("/api/creators/outliers"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "archive", id }),
      }).catch(() => {});
    }
  } catch {
    /* optimistic state stays; next load reconciles */
  }
}

/**
 * Approve / Exclude toggles for a post — ported from roster.
 * Approved = teal-green, Excluded = rose-red, instant optimistic flip.
 *
 * Layouts: "stack" (vertical, posts feed) | "row" (horizontal, post cards).
 */
export function PostActions({
  postId,
  initialApproved,
  initialExcluded,
  initialOutlier,
  isInfluencer,
  layout = "stack",
  showOutlierToggle = true,
  onChanged,
}: {
  postId: string;
  initialApproved: boolean;
  initialExcluded: boolean;
  initialOutlier?: boolean;
  isInfluencer: boolean;
  layout?: "stack" | "row";
  showOutlierToggle?: boolean;
  /** Fires after a flag is written so the parent can recompute counted
   * totals — approving must move the "post amounts" without a manual reload. */
  onChanged?: () => void;
}) {
  const [approved, setApproved] = useState(initialApproved);
  const [excluded, setExcluded] = useState(initialExcluded);
  const [outlier, setOutlier] = useState(initialOutlier ?? false);
  const [pending, startTransition] = useTransition();

  function toggle(flag: "approved" | "excluded") {
    let next: boolean;
    if (flag === "approved") {
      next = !approved;
      setApproved(next);
      if (next) setExcluded(false);
    } else {
      next = !excluded;
      setExcluded(next);
      if (next) setApproved(false);
    }
    startTransition(async () => {
      await patchPost(postId, flag, next);
      onChanged?.();
    });
  }

  function toggleOutlier() {
    const next = !outlier;
    setOutlier(next);
    startTransition(async () => {
      await patchPost(postId, "is_outlier", next);
      onChanged?.();
    });
  }

  const wrapCls = layout === "row" ? "flex w-full gap-2" : "flex flex-col gap-1.5";
  const btnCls = "inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors flex-1 ";

  return (
    <div className={wrapCls + (pending ? " opacity-90" : "")}>
      {isInfluencer && (
        <button
          type="button"
          onClick={() => toggle("approved")}
          className={
            btnCls +
            (approved
              ? "bg-app-teal/20 text-app-teal ring-1 ring-inset ring-app-teal/40 hover:bg-app-teal/25"
              : "bg-app-navy-light/60 text-ink ring-1 ring-inset ring-app-blue/15 hover:bg-app-navy-light hover:ring-app-blue/35")
          }
        >
          {approved && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          {approved ? "Approved" : "Approve"}
        </button>
      )}
      <button
        type="button"
        onClick={() => toggle("excluded")}
        className={
          btnCls +
          (excluded
            ? "bg-app-red/20 text-app-red-text ring-1 ring-inset ring-app-red/40 hover:bg-app-red/25"
            : "bg-transparent text-ink-muted ring-1 ring-inset ring-app-blue/10 hover:bg-white/[0.03] hover:text-ink hover:ring-app-blue/25")
        }
      >
        {excluded && <X className="h-3.5 w-3.5" strokeWidth={3} />}
        {excluded ? "Excluded" : "Exclude"}
      </button>

      {showOutlierToggle && (
        <button
          type="button"
          onClick={toggleOutlier}
          title={outlier ? "Unmark outlier" : "Mark as outlier"}
          aria-pressed={outlier}
          className={
            "inline-flex w-9 items-center justify-center rounded-xl px-2 py-2 text-xs font-semibold transition-colors flex-shrink-0 " +
            (outlier
              ? "bg-app-gold/20 text-app-gold ring-1 ring-inset ring-app-gold/40 hover:bg-app-gold/25"
              : "bg-transparent text-ink-muted ring-1 ring-inset ring-app-blue/10 hover:bg-white/[0.03] hover:text-app-gold hover:ring-app-gold/30")
          }
        >
          <Star className={"h-3.5 w-3.5 " + (outlier ? "fill-app-gold" : "")} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/**
 * Always-on outlier star overlaying a post thumbnail's top-right corner.
 * Outlier = solid gold pill; not = dimmed dark backdrop with hollow star.
 */
export function OutlierToggle({ postId, initialOutlier, onChanged }: { postId: string; initialOutlier: boolean; onChanged?: () => void }) {
  const [outlier, setOutlier] = useState(initialOutlier);
  const [pending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !outlier;
    setOutlier(next);
    startTransition(async () => {
      await patchPost(postId, "is_outlier", next);
      onChanged?.();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={outlier ? "Unmark outlier" : "Mark as outlier"}
      aria-pressed={outlier}
      className={
        "absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-all " +
        (outlier
          ? "bg-app-gold/95 text-app-navy shadow-md shadow-app-gold/40 hover:bg-app-gold"
          : "bg-black/40 text-white/85 ring-1 ring-white/15 hover:bg-black/60 hover:text-app-gold hover:ring-app-gold/40")
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className={"h-3.5 w-3.5 " + (outlier ? "fill-current" : "")} strokeWidth={2} />}
    </button>
  );
}
