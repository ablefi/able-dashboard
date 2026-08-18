"use client";

import { AnalysisStats, AnalysisRow, mapUserToRow, computeUserAnalysis } from "@/lib/userAnalysis";
import { saveRows } from "@/lib/analysisRows";

/**
 * The User Analysis crawl, as a module-level singleton.
 *
 * It pages through /admin/users (500 at a time — the backend caps it there) and
 * aggregates client-side. At ~220k users that's ~440 requests and several
 * minutes, so it lives OUTSIDE React: navigating to another tab mid-run doesn't
 * lose it, and the view re-attaches to the live progress on return. A full
 * browser reload still kills it — inherent to running in the browser.
 *
 * Lives in lib/ (not the view) so the authed layout can kick off the daily
 * background refresh from anywhere in the dashboard.
 */

// Bump on any AnalysisStats shape change — a stale cache would otherwise
// render missing fields as zeros (i.e. plausible but WRONG numbers).
// v2: storeRegionData/userCountryData · v3: per-region paying/rate/spend + convByRegion
// · v4: platformData/platformCoverage · v6: ageByCohort (and the crawl now
// keeps its raw rows, which a pre-v6 run never stored).
export const CACHE_KEY = "user-analysis-cache-v6";

/** How old a cached analysis may be before the daily auto-refresh re-runs it. */
export const ANALYSIS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CachedAnalysis = { total: number; stats: AnalysisStats | null; computedAt: number };

export function readAnalysisCache(): CachedAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return saved && saved.stats ? (saved as CachedAnalysis) : null;
  } catch {
    return null;
  }
}

/** True when there's no cached analysis, or it's older than 24h. */
export function isAnalysisStale(): boolean {
  const c = readAnalysisCache();
  if (!c) return true;
  return Date.now() - (c.computedAt || 0) > ANALYSIS_MAX_AGE_MS;
}

export type FetchUsersFn = (
  params: Record<string, any>,
  options?: { silent?: boolean }
) => Promise<{ data: any[]; meta: { total: number } } | null>;

export const runner: {
  running: boolean;
  fetched: number;
  total: number | null;
  error: string | null;
  result: { total: number; stats: AnalysisStats | null; computedAt: number; partial?: boolean } | null;
  /** The raw rows behind `result`, kept so the view can re-slice by signup
   * date without re-crawling. Also persisted to IndexedDB so a reload can
   * pick them up. Null until a crawl finishes in this tab. */
  rows: AnalysisRow[] | null;
} = { running: false, fetched: 0, total: null, error: null, result: null, rows: null };

const runnerListeners = new Set<() => void>();
const notifyRunner = () => runnerListeners.forEach((l) => l());
/** Subscribe to runner progress; returns an unsubscribe fn. */
export function subscribeRunner(fn: () => void): () => void {
  runnerListeners.add(fn);
  return () => {
    runnerListeners.delete(fn);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One page, with up to 4 attempts + exponential backoff. A single backend
 * hiccup (5xx / timeout / rate-limit) used to silently abort the whole crawl
 * — that's why runs "finished" at exact multiples of 500 (86,000 = page 172). */
async function fetchPageWithRetry(fetchUsers: FetchUsersFn, page: number, limit: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchUsers({ page, limit }, { silent: true });
    if (res) return res;
    await sleep(1000 * 2 ** attempt);
  }
  return null;
}

export async function startAnalysisRun(fetchUsers: FetchUsersFn) {
  if (runner.running) return; // one crawl at a time
  runner.running = true;
  runner.fetched = 0;
  runner.total = null;
  runner.error = null;
  notifyRunner();
  try {
    const rows: AnalysisRow[] = [];
    const limit = 500;
    let page = 1;
    let shortRetries = 0;
    let partial = false;
    for (;;) {
      const res = await fetchPageWithRetry(fetchUsers, page, limit);
      if (!res) {
        partial = true;
        runner.error = `The backend kept failing around page ${page} — showing a partial analysis of ${rows.length.toLocaleString()} users. Hit Refresh to retry.`;
        break;
      }
      if (res.meta && typeof res.meta.total === "number") runner.total = res.meta.total;
      const expected = runner.total;
      const isLastPage = expected != null ? page * limit >= expected : res.data.length < limit;
      // A short page BEFORE the real end is a backend glitch, not completion —
      // the old code treated it as "done" and quietly analyzed a third of the
      // base. Discard it and re-fetch the same page.
      if (res.data.length < limit && !isLastPage) {
        shortRetries++;
        if (shortRetries > 3) {
          res.data.forEach((u) => rows.push(mapUserToRow(u)));
          partial = true;
          runner.error = `The backend kept returning incomplete pages — showing a partial analysis of ${rows.length.toLocaleString()} users. Hit Refresh to retry.`;
          break;
        }
        await sleep(1000 * shortRetries);
        continue;
      }
      shortRetries = 0;
      res.data.forEach((u) => rows.push(mapUserToRow(u)));
      runner.fetched = rows.length;
      notifyRunner();
      if (isLastPage || res.data.length === 0) break;
      page++;
    }
    const computed = computeUserAnalysis(rows);
    runner.result = { total: computed.total, stats: computed.stats, computedAt: Date.now(), partial };
    runner.rows = rows;
    // Never overwrite a good full cache with a partial crawl.
    if (!partial) {
      // Keep the rows so the view can re-slice by signup period. Fire and
      // forget: a failed write only costs the period filter after a reload.
      void saveRows(rows, runner.result.computedAt);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ total: computed.total, stats: computed.stats, computedAt: runner.result.computedAt }));
      } catch {
        /* non-fatal */
      }
      // Also publish the country tally centrally, so the Dashboard globe works
      // on any machine rather than only where the crawl happened to run. Just
      // counts per country — no user records. Best-effort; never block the run.
      const countries = computed.stats?.userCountryData;
      if (countries?.length) {
        fetch("/api/user-geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countries,
            paying: computed.stats?.payingCountryData ?? [],
            total: computed.total,
            coverage: computed.stats?.countryCoverage ?? 0,
          }),
        }).catch(() => {
          /* the globe falls back to the local cache */
        });
      }
    }
  } finally {
    runner.running = false;
    notifyRunner();
  }
}
