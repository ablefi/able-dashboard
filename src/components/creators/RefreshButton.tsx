"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Pulls fresh posts from ScrapeCreators for one creator / a persona's
 * children / the whole roster. Calls /api/creators/refresh and reports the
 * insert/update tally. onDone fires after a successful pull so the view can
 * reload.
 */
export function RefreshButton({
  action,
  id,
  windowDays = 30,
  label,
  onDone,
  size = "md",
}: {
  action: "creator" | "persona" | "all";
  id?: string;
  windowDays?: number;
  label?: string;
  onDone?: () => void;
  size?: "sm" | "md";
}) {
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const tid = toast.loading(action === "all" ? "Refreshing all creators…" : "Pulling fresh posts…");
    try {
      const res = await fetch("/api/creators/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, id, windowDays }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) throw new Error(d.error || `Failed (${res.status})`);
      const parts: string[] = [];
      if (d.creators_processed != null) parts.push(`${d.creators_processed} creators`);
      if (d.inserted != null) parts.push(`+${d.inserted} new`);
      if (d.updated != null) parts.push(`${d.updated} updated`);
      if (d.failures) parts.push(`${d.failures} failed`);
      toast.update(tid, { render: parts.length ? `Refreshed · ${parts.join(" · ")}` : "Refreshed", type: "success", isLoading: false, autoClose: 4000 });
      if (d.errors?.length) toast.warn(d.errors.slice(0, 3).join("; "));
      onDone?.();
    } catch (e) {
      toast.update(tid, { render: e instanceof Error ? e.message : "Refresh failed", type: "error", isLoading: false, autoClose: 5000 });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-jp-blue/30 bg-jp-blue/15 font-medium text-jp-blue-light transition-colors hover:bg-jp-blue/25 disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
      )}
    >
      {pending ? <Loader2 className={cn("animate-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} /> : <RefreshCw className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {label ?? `Refresh · ${windowDays}d`}
    </button>
  );
}
