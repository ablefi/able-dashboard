import { useCallback, useRef, useState } from "react";
import { useAxios } from "./axiosInstance";

/**
 * In-app banner messages (`/admin/in-app-messages` on the NestJS backend).
 *
 * ⚠️ STAGING ONLY for now — production 404s on these routes. Shapes mirror the
 * backend DTOs exactly (verified against /api-json); don't invent fields.
 */

export type BannerStatus = "draft" | "active" | "archived";
/** filter = shown to anyone matching audienceFilters · assignment = only users
 * explicitly assigned (by an admin, or by a journey's in_app action). */
export type BannerDeliveryMode = "assignment" | "filter";

export interface BannerAudienceFilters {
  country?: string[];
  appStoreRegion?: string[];
  city?: string[];
  timezone?: string[];
  isActive?: boolean;
  subscriptionStatus?: string[];
  platform?: ("android" | "ios" | "web")[];
  gender?: ("male" | "female")[];
  personalJourney?: string[];
  heard?: string[];
  minCurrentDailyPrayer?: number;
  maxCurrentDailyPrayer?: number;
  minTargetDailyPrayers?: number;
  maxTargetDailyPrayers?: number;
  donationCountry?: string[];
  isHanafi?: boolean;
}

export interface InAppMessage {
  id: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  ctaLabel?: string | null;
  status: BannerStatus;
  deliveryMode: BannerDeliveryMode;
  priority: number;
  startsAt?: string | null;
  endsAt?: string | null;
  audienceFilters?: BannerAudienceFilters | null;
  behaviorConditions?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BannerInput = {
  title: string;
  description: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  ctaLabel?: string | null;
  status?: BannerStatus;
  deliveryMode?: BannerDeliveryMode;
  priority?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  audienceFilters?: BannerAudienceFilters | null;
};

/** Verified against staging: `{"data":[],"page":1,"limit":3,"total":0}` —
 * the pagination fields are top-level, not nested under `meta`. */
export interface BannerListResponse {
  data: InAppMessage[];
  page?: number;
  limit?: number;
  total?: number;
}

const BASE = "/admin/in-app-messages";

export const useInAppMessagesApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Mirror of `error` that is readable IMMEDIATELY after an awaited call.
   * `error` is React state, so a caller doing `if (!res) toast(api.error)`
   * reads the value from before the failure — always stale, usually null. */
  const errorRef = useRef<string | null>(null);

  /** Backend 404s on production — surface that plainly rather than "failed". */
  const toMessage = (err: any): string => {
    if (err?.response?.status === 404) return "This backend doesn't have in-app messages yet (staging only for now).";
    return err?.response?.data?.message || err?.message || "Request failed";
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

  /** The last error, read synchronously — use this right after an await. */
  const lastError = useCallback(() => errorRef.current, []);

  const list = useCallback(
    async (params: { status?: string; page?: number; limit?: number } = {}): Promise<BannerListResponse | null> => {
      setLoading(true);
      clearError();
      try {
        const res = await axios.get(BASE, { params });
        const d = res.data;
        // Tolerate either a bare array or a paginated envelope.
        return Array.isArray(d) ? { data: d } : d;
      } catch (err: any) {
        return fail(err);
      } finally {
        setLoading(false);
      }
    },
    [axios, clearError, fail]
  );

  /** Every banner, following pagination — `limit` is capped at 100 server-side,
   * and showing only the first page would read as "that's all of them". */
  const listAll = useCallback(
    async (params: { status?: string } = {}): Promise<BannerListResponse | null> => {
      setLoading(true);
      clearError();
      try {
        const out: InAppMessage[] = [];
        for (let page = 1; page <= 20; page++) {
          const d = (await axios.get(BASE, { params: { ...params, page, limit: 100 } })).data;
          const chunk: InAppMessage[] = Array.isArray(d) ? d : (d?.data ?? []);
          out.push(...chunk);
          const total = Array.isArray(d) ? chunk.length : d?.total;
          if (chunk.length < 100 || (typeof total === "number" && out.length >= total)) break;
        }
        return { data: out, total: out.length };
      } catch (err: any) {
        return fail(err);
      } finally {
        setLoading(false);
      }
    },
    [axios, clearError, fail]
  );

  const create = async (body: BannerInput): Promise<InAppMessage | null> => {
    clearError();
    try {
      return (await axios.post<InAppMessage>(BASE, body)).data;
    } catch (err: any) {
      return fail(err);
    }
  };

  const update = async (id: string, body: Partial<BannerInput>): Promise<InAppMessage | null> => {
    clearError();
    try {
      return (await axios.patch<InAppMessage>(`${BASE}/${id}`, body)).data;
    } catch (err: any) {
      return fail(err);
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    clearError();
    try {
      await axios.delete(`${BASE}/${id}`);
      return true;
    } catch (err: any) {
      fail(err);
      return false;
    }
  };

  /** Live match count for a SAVED banner's filters (the endpoint keys off the id). */
  const previewAudience = async (id: string): Promise<number | null> => {
    try {
      const d = (await axios.post<{ count?: number }>(`${BASE}/${id}/preview-audience`)).data;
      return typeof d?.count === "number" ? d.count : null;
    } catch {
      return null;
    }
  };

  /** Assignment mode: give this banner to one specific user. */
  const assignUser = async (id: string, userId: string): Promise<boolean> => {
    clearError();
    try {
      await axios.post(`${BASE}/${id}/assign-user`, { userId });
      return true;
    } catch (err: any) {
      fail(err);
      return false;
    }
  };

  return { list, listAll, create, update, remove, previewAudience, assignUser, loading, error, lastError };
};
