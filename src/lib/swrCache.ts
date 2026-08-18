"use client";

/**
 * Tiny stale-while-revalidate cache over localStorage for the creators
 * section. Views paint the last result for a given key INSTANTLY on mount,
 * then revalidate in the background and overwrite — so navigating back to a
 * page (or re-opening it) feels instant, and a manual Refresh (which re-runs
 * the same fetch) naturally freshens the stored copy. Best-effort: any
 * parse/quota error just means "no cache", never a crash.
 */

type Entry<T> = { at: number; data: T };

export function readCache<T>(key: string): { data: T; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    return e && typeof e.at === "number" ? { data: e.data, at: e.at } : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // quota exceeded / serialization issue — cache is optional, skip silently
  }
}
