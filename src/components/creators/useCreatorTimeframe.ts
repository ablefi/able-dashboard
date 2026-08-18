"use client";

import { useCallback, useEffect, useState } from "react";
import type { Timeframe } from "@/lib/timeframe";

const KEY = "jp-creators-timeframe";
const EVT = "jp-creators-tf";
const DEFAULT: Timeframe = { key: "30d" };

function read(): Timeframe {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Timeframe;
      if (v && typeof v.key === "string") return v;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

/**
 * Creators-wide timeframe, shared across the roster, posts, performance,
 * prospects and a specific creator. Persisted to localStorage so the range you
 * pick on one screen carries into the others and into a creator you click
 * (and survives a reload). A window event keeps screens that are mounted
 * together in sync live; the `storage` event syncs other tabs.
 *
 * The stored value is read synchronously in the initializer. That's safe here
 * because the authed layout shows a spinner until the session is restored, so
 * these views only ever first-render on the client (never during SSR) — no
 * hydration mismatch — and it avoids a default->stored double fetch (and the
 * response race that came with it).
 */
export function useCreatorTimeframe(): [Timeframe, (tf: Timeframe) => void] {
  const [tf, setTf] = useState<Timeframe>(read);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<Timeframe>).detail;
      if (d?.key) setTf(d);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setTf(read());
    };
    window.addEventListener(EVT, onEvt as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, onEvt as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next: Timeframe) => {
    setTf(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
    } catch {
      /* ignore */
    }
  }, []);

  return [tf, update];
}
