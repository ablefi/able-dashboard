"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/swrCache";

/**
 * Load one of Able's API reports through `/api/able`.
 *
 * Paints the last cached copy immediately, then revalidates. `refreshMs`
 * re-fetches on an interval while the tab is visible (the old Ops page
 * refreshed health every minute and reports every five).
 */
export function useAbleReport<T>(path: string, opts: { refreshMs?: number } = {}) {
  const key = `able:${path}`;
  const [data, setData] = useState<T | null>(() => readCache<T>(key)?.data ?? null);
  const [at, setAt] = useState<number | null>(() => readCache<T>(key)?.at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  // A refresh asked for while one is running (say right after a write) runs once
  // the current one ends, so the page never keeps a copy older than the write.
  const again = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/able?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setData(body as T);
      setAt(Date.now());
      setError(null);
      writeCache(key, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
    if (again.current) {
      again.current = false;
      await refresh();
    }
  }, [path, key]);

  useEffect(() => {
    void refresh();
    if (!opts.refreshMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, opts.refreshMs);
    return () => clearInterval(t);
  }, [refresh, opts.refreshMs]);

  return { data, at, error, loading, refresh };
}

/** Exact phone lookup on Able's user store; returns masked roster rows. */
export async function searchAbleUsersByPhone<Row>(phone: string): Promise<Row[]> {
  const res = await fetch(`/api/able?path=${encodeURIComponent("/marketing/users/search")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Search failed (${res.status})`);
  return (body?.users ?? []) as Row[];
}

/**
 * Creator edit on Able's API through `/api/able/write` (scoped creators token).
 * Throws with the API's own error message so forms can show it as is.
 */
export async function ableCreatorWrite<T = unknown>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/able/write?path=${encodeURIComponent(path)}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    cache: "no-store",
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `Request failed (${res.status})`);
  return out as T;
}
