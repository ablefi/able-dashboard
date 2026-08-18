"use client";

import type { AnalysisRow } from "@/lib/userAnalysis";

/**
 * The crawl's raw rows, kept so the analysis can be re-sliced by signup date
 * without re-running a multi-minute crawl.
 *
 * They can't live in localStorage — at ~220k rows this is tens of megabytes,
 * far past the ~5MB quota — so they go to IndexedDB. Stored as ONE JSON string
 * rather than 220k objects: a single large primitive is cheap to hand to
 * structured clone, where an object graph that size is not.
 *
 * Everything here is best-effort. If IndexedDB is unavailable, full or blocked
 * (private windows, storage pressure), the period filter simply stays off and
 * the cached all-time analysis still renders — it never breaks the page.
 */

const DB_NAME = "jp-user-analysis";
const STORE = "rows";
const KEY = "latest";

/** Bump when AnalysisRow's shape changes — stale rows would aggregate wrong. */
export const ROWS_VERSION = 1;

type Stored = { version: number; computedAt: number; total: number; json: string };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export async function saveRows(rows: AnalysisRow[], computedAt: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const payload: Stored = { version: ROWS_VERSION, computedAt, total: rows.length, json: JSON.stringify(rows) };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      // Quota errors land here — nothing to do but carry on without them.
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.objectStore(STORE).put(payload, KEY);
    });
  } catch {
    /* serialisation failed — not worth breaking the run over */
  } finally {
    db.close();
  }
}

export async function loadRows(): Promise<{ rows: AnalysisRow[]; computedAt: number } | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const stored = await new Promise<Stored | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Stored) ?? null);
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
    if (!stored || stored.version !== ROWS_VERSION || !stored.json) return null;
    return { rows: JSON.parse(stored.json) as AnalysisRow[], computedAt: stored.computedAt };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearRows(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.objectStore(STORE).delete(KEY);
    });
  } finally {
    db.close();
  }
}
