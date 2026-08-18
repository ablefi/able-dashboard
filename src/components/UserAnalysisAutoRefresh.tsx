"use client";

import { useEffect } from "react";
import { useUsersApi } from "@/api/usersApi";
import { useAuth } from "@/context/AuthContext";
import { isAnalysisStale, startAnalysisRun, runner, type FetchUsersFn } from "@/lib/userAnalysisRunner";

/**
 * Daily background refresh of the User Analysis figures.
 *
 * Mounted once in the authed layout, so it fires from ANYWHERE in the
 * dashboard — by the time you open User Analysis the numbers are usually
 * already fresh. Behaviour:
 *   - only when the cached analysis is missing or >24h old
 *   - silent: the page keeps showing the previous numbers while it runs
 *   - one crawl at a time (the runner self-guards), and once per page load
 *   - if it fails or the tab closes mid-run, nothing is written — it simply
 *     tries again next time the dashboard is opened
 *
 * It crawls ~440 pages of /admin/users and takes several minutes, hence the
 * delay before starting: never compete with the page the user actually opened.
 */

/** Once per page load — a layout remount shouldn't kick off a second crawl. */
let attemptedThisLoad = false;

const START_DELAY_MS = 15_000;

export default function UserAnalysisAutoRefresh() {
  const { user } = useAuth();
  const { fetchUsers } = useUsersApi();

  useEffect(() => {
    if (attemptedThisLoad) return;
    // Needs the users section — otherwise every /admin/users call 401s.
    if (!user || !(user.isOwner || user.sections?.includes("users"))) return;
    if (runner.running || !isAnalysisStale()) return;

    attemptedThisLoad = true;
    const t = setTimeout(() => {
      // Re-check: the user may have hit Refresh manually in the meantime.
      if (!runner.running && isAnalysisStale()) void startAnalysisRun(fetchUsers as FetchUsersFn);
    }, START_DELAY_MS);
    return () => clearTimeout(t);
  }, [user, fetchUsers]);

  return null;
}
