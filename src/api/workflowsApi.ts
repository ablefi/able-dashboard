import { useCallback, useRef, useState } from "react";
import { useAxios } from "./axiosInstance";
import type { ActionPayload, ActionType, JourneyGraph, TriggerType, WorkflowStatus } from "@/lib/messaging";
import type { BannerAudienceFilters } from "./inAppMessagesApi";

/**
 * `/admin/workflows` — the entity behind Emails, Push, Broadcasts and
 * Campaigns. STAGING ONLY (production 404s).
 *
 * Verified list envelope: `{data, page, limit, total}` — top-level, not `meta`.
 */

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  mode: "simple" | "journey";
  status: WorkflowStatus;

  // --- simple mode ---
  triggerType?: TriggerType | null;
  scheduledAt?: string | null;
  timeOfDay?: string | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone?: string | null;
  audienceFilters?: BannerAudienceFilters | null;
  behaviorConditions?: Record<string, unknown> | null;
  actionType?: ActionType | null;
  actionPayload?: ActionPayload | null;

  // --- journey mode ---
  entryTriggerType?: "scheduled" | "manual" | null;
  entryAudienceFilters?: BannerAudienceFilters | null;
  entryBehaviorConditions?: Record<string, unknown> | null;
  schedule?: { type: TriggerType; timeOfDay?: string; dayOfWeek?: number; dayOfMonth?: number; timezone?: string; scheduledAt?: string } | null;
  draftGraph?: JourneyGraph | null;
  publishedVersionId?: string | null;
  cooldownMinutes?: number | null;
  maxSendPerUser?: number | null;

  nextRunAt?: string | null;
  lastRunAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowInput = Partial<Omit<Workflow, "id" | "createdAt" | "updatedAt">> & { name: string };

export interface Paged<T> {
  data: T[];
  page?: number;
  limit?: number;
  total?: number;
}

/** Field names copied from the backend's `workflow-run.entity.ts` — note
 * `totalTargetedUsers` and `completedAt`, not the shorter names you'd guess. */
export interface WorkflowRun {
  id: string;
  status?: "pending" | "running" | "completed" | "failed" | string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  totalTargetedUsers?: number;
  totalDeliveries?: number;
  totalSent?: number;
  totalFailed?: number;
  totalSkipped?: number;
  errorMessage?: string | null;
  [k: string]: unknown;
}

/** From `workflow-enrollment.entity.ts`. */
export interface WorkflowEnrollment {
  id: string;
  userId: string;
  status?: string;
  currentNodeId?: string;
  enteredAt?: string;
  nextRunAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  [k: string]: unknown;
}

export interface WorkflowDelivery {
  id: string;
  userId?: string;
  status?: string;
  channel?: string;
  error?: string | null;
  createdAt?: string;
  [k: string]: unknown;
}

const BASE = "/admin/workflows";

export const useWorkflowsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Readable synchronously after an await — React state is still the
   * pre-failure value at that point, so `api.error` would be stale. */
  const errorRef = useRef<string | null>(null);

  const toMessage = (err: any): string => {
    if (err?.response?.status === 404) return "This backend doesn't have campaigns yet (staging only for now).";
    const m = err?.response?.data?.message;
    return (Array.isArray(m) ? m.join(", ") : m) || err?.message || "Request failed";
  };

  const fail = useCallback((err: any): null => {
    const msg = toMessage(err);
    errorRef.current = msg;
    setError(msg);
    return null;
  }, []);

  const clearError = useCallback(() => {
    errorRef.current = null;
    setError(null);
  }, []);

  const lastError = useCallback(() => errorRef.current, []);

  const list = useCallback(
    async (params: { status?: string; actionType?: string; triggerType?: string; mode?: string; page?: number; limit?: number } = {}) => {
      setLoading(true);
      clearError();
      try {
        const d = (await axios.get(BASE, { params })).data;
        return (Array.isArray(d) ? { data: d } : d) as Paged<Workflow>;
      } catch (err) {
        return fail(err);
      } finally {
        setLoading(false);
      }
    },
    [axios, clearError, fail]
  );

  /**
   * Every matching workflow, following pagination.
   *
   * Two backend facts this works around:
   *  • `limit` over 100 is rejected, so one big fetch isn't an option — and
   *    showing only the first page would read as "that's all of them".
   *  • there is NO `mode` query param. Sending one is silently IGNORED, so a
   *    campaigns list would quietly fill up with emails. `mode` is therefore
   *    filtered here, on the client, and never sent.
   */
  const listAll = useCallback(
    async ({ mode, ...params }: { status?: string; actionType?: string; triggerType?: string; mode?: "simple" | "journey" } = {}) => {
      setLoading(true);
      clearError();
      try {
        const out: Workflow[] = [];
        for (let page = 1; page <= 20; page++) {
          const d = (await axios.get(BASE, { params: { ...params, page, limit: 100 } })).data;
          const chunk: Workflow[] = Array.isArray(d) ? d : (d?.data ?? []);
          out.push(...chunk);
          const total = Array.isArray(d) ? chunk.length : d?.total;
          if (chunk.length < 100 || (typeof total === "number" && out.length >= total)) break;
        }
        // Older rows predate `mode`; treat a missing value as "simple".
        const filtered = mode ? out.filter((w) => (w.mode ?? "simple") === mode) : out;
        return { data: filtered, total: filtered.length } as Paged<Workflow>;
      } catch (err) {
        return fail(err);
      } finally {
        setLoading(false);
      }
    },
    [axios, clearError, fail]
  );

  const get = useCallback(
    async (id: string): Promise<Workflow | null> => {
      clearError();
      try {
        return (await axios.get<Workflow>(`${BASE}/${id}`)).data;
      } catch (err) {
        return fail(err);
      }
    },
    [axios, clearError, fail]
  );

  const create = async (body: WorkflowInput): Promise<Workflow | null> => {
    clearError();
    try {
      return (await axios.post<Workflow>(BASE, body)).data;
    } catch (err) {
      return fail(err);
    }
  };

  const update = async (id: string, body: Partial<WorkflowInput>): Promise<Workflow | null> => {
    clearError();
    try {
      return (await axios.patch<Workflow>(`${BASE}/${id}`, body)).data;
    } catch (err) {
      return fail(err);
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    clearError();
    try {
      await axios.delete(`${BASE}/${id}`);
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  /** activate | pause | archive | publish — all bodiless POSTs. */
  const lifecycle = async (id: string, action: "activate" | "pause" | "archive" | "publish"): Promise<boolean> => {
    clearError();
    try {
      await axios.post(`${BASE}/${id}/${action}`);
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  /**
   * Audience size for filters that have NOT been saved yet — so the composer
   * can show a live count while you edit.
   *
   * Memoized deliberately: the audience editor re-counts whenever this
   * function's identity changes, so an unstable one made every keystroke in
   * an unrelated field (a subject line) fire a fresh count.
   */
  const previewAudience = useCallback(
    async (
      audienceFilters: BannerAudienceFilters | null,
      behaviorConditions?: Record<string, unknown> | null
    ): Promise<number | null> => {
      try {
        const d = (
          await axios.post<{ count: number }>(`${BASE}/preview-audience`, {
            ...(audienceFilters ? { audienceFilters } : {}),
            ...(behaviorConditions ? { behaviorConditions } : {}),
          })
        ).data;
        return typeof d?.count === "number" ? d.count : null;
      } catch {
        return null;
      }
    },
    [axios]
  );

  const saveGraph = async (id: string, graph: JourneyGraph): Promise<boolean> => {
    clearError();
    try {
      await axios.put(`${BASE}/${id}/graph`, { graph });
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  const validate = async (id: string): Promise<{ valid: boolean; errors: string[] } | null> => {
    clearError();
    try {
      return (await axios.post<{ valid: boolean; errors: string[] }>(`${BASE}/${id}/validate`)).data;
    } catch (err) {
      return fail(err);
    }
  };

  /** Send this workflow to one user, right now. */
  const test = async (id: string, userId: string): Promise<{ success: boolean; message?: string } | null> => {
    clearError();
    try {
      return (await axios.post<{ success: boolean; message?: string }>(`${BASE}/${id}/test`, { userId })).data;
    } catch (err) {
      return fail(err);
    }
  };

  const runs = useCallback(
    async (id: string, params: { page?: number; limit?: number } = {}) => {
      try {
        const d = (await axios.get(`${BASE}/${id}/runs`, { params })).data;
        return (Array.isArray(d) ? { data: d } : d) as Paged<WorkflowRun>;
      } catch (err) {
        return fail(err);
      }
    },
    [axios, fail]
  );

  const deliveries = useCallback(
    async (runId: string, params: { page?: number; limit?: number } = {}) => {
      try {
        const d = (await axios.get(`${BASE}/runs/${runId}/deliveries`, { params })).data;
        return (Array.isArray(d) ? { data: d } : d) as Paged<WorkflowDelivery>;
      } catch (err) {
        return fail(err);
      }
    },
    [axios, fail]
  );

  const enrollments = useCallback(
    async (id: string, params: { page?: number; limit?: number } = {}) => {
      try {
        const d = (await axios.get(`${BASE}/${id}/enrollments`, { params })).data;
        return (Array.isArray(d) ? { data: d } : d) as Paged<WorkflowEnrollment>;
      } catch (err) {
        return fail(err);
      }
    },
    [axios, fail]
  );

  const enrollUser = async (id: string, userId: string): Promise<boolean> => {
    clearError();
    try {
      await axios.post(`${BASE}/${id}/enrollments`, { userId });
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  return {
    list, listAll, get, create, update, remove, lifecycle, previewAudience,
    saveGraph, validate, test, runs, deliveries, enrollments, enrollUser,
    loading, error, lastError,
  };
};
