import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";
import type { SubscriptionStatus } from "@/lib/subscription";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  city?: string | null;
  country?: string | null;
  /** App Store / Play Store storefront region from the client (alpha-2 code, e.g. "US"). */
  appStoreRegion?: string | null;
  /** Device platforms across active sessions ∪ active devices. Array (a user
   * can be on both). Staging backend only — absent on production for now. */
  platforms?: string[];
  googleId?: string;
  appleId?: string;
  profilePicture?: string;
  isActive: boolean;
  totalSpent: number;
  /** RevenueCat-derived state — same enum as the subscriptionFilter query param.
   * Optional: the old (pre-enum) backend doesn't send it. */
  subscriptionStatus?: SubscriptionStatus;
  /** Computed access from the freemium backend, for the selected access platform. */
  accessStatus?: string;
  access?: "pro" | "free";
  source?: "purchase" | "free_code" | "region" | "none";
  history?: "paying" | "lapsed_payer" | "never_paid";
  model?: string;
  tier?: string;
  packageKey?: string;
  /** Latest in-app cancel-survey reason, or null if never submitted. */
  cancelReason?: string | null;
  /** Free-text details (usually present when reason is "other"). */
  cancelReasonDetails?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  userProfile: {
    id: string;
    name: string;
    age: number;
    gender: string;
    heard: string;
    settings?: UserAppSettings | null;
  };
  /** Settings blob uploaded by newer app versions. `null` means the user has
   *  never saved from a new build — unknown, NOT "defaults". Every nested part
   *  is optional: the client sends only what it has. */
  settings?: UserAppSettings | null;
}

export interface UserAppSettings {
  schemaVersion?: number;
  updatedAt?: string;
  toolbox?: { liveActivities?: { isEnabled?: boolean } | null; [key: string]: unknown } | null;
  /** Add your app's settings areas here; anything else still type-checks via the index signature. */
  [key: string]: unknown;
}

export interface UsersResponse {
  data: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const useUsersApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (
      params: Record<string, any> = {},
      options?: { silent?: boolean }
    ): Promise<UsersResponse | null> => {
      const silent = options?.silent === true;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get<UsersResponse>("/admin/users", { params });
        return res.data;
      } catch (err: any) {
        if (!silent) setError(err.message || "Failed to fetch users");
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [axios]
  );

  const toggleUserStatus = async (id: string): Promise<User | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.put<User>(`/admin/users/${id}/toggle-status`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to toggle user status");
      return null;
    } finally {
      setLoading(false);
    }
  };


  const restoreUser = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/admin/users/${id}/restore`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to restore user");
      return false;
    } finally {
      setLoading(false);
    }
  };

/**
 * Permanent delete can hang indefinitely server-side (observed on staging:
 * no response after 90s, and the request holds a database connection while it
 * waits). The axios instance sets no timeout, so without this the dialog spins
 * forever and the operator retries — each retry tying up another connection
 * until the pool is exhausted and every other query blocks too. Fail loudly
 * instead.
 */
const PERMANENT_DELETE_TIMEOUT_MS = 45_000;

/**
 * The backend blocks BOTH deletes in production (a guard added 31 Aug 2026,
 * `admin.service.ts`, after the mass-deletion incident) — but it does so by
 * returning HTTP 200 with `{ message: "User delete is disabled in production" }`
 * rather than an error status. Axios doesn't throw on a 200, so without this
 * check the dashboard reported "User permanently deleted" for a row it had not
 * touched. Treat the refusal as the failure it is.
 */
const isProductionRefusal = (data: unknown): boolean =>
  /delete is disabled in production/i.test(
    String((data as { message?: string } | null)?.message ?? "")
  );
const PRODUCTION_REFUSAL_MESSAGE =
  "The backend refuses deletes in production. Nothing was deleted.";

  const softDeleteUser = async (
    id: string
  ): Promise<
    { success: true; deletedAt: string } | { success: false; message: string }
  > => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.delete<{ message: string; deletedAt: string }>(
        `/admin/users/${id}`
      );
      if (isProductionRefusal(res.data)) {
        setError(PRODUCTION_REFUSAL_MESSAGE);
        return { success: false as const, message: PRODUCTION_REFUSAL_MESSAGE };
      }
      return { success: true as const, deletedAt: res.data.deletedAt };
    } catch (err: any) {
      const msg =
        err.response?.status === 404
          ? "User not found"
          : err.response?.status === 400
          ? err.response?.data?.message || "User is already soft-deleted"
          : err.message || "Failed to soft-delete user";
      setError(msg);
      return { success: false as const, message: msg };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Permanently delete a user.
   *
   * The backend refuses unless the row is ALREADY soft-deleted — it throws
   * "User is not soft-deleted. Soft delete the user first." So deleting an
   * ordinary, active user from the dashboard always failed, which read as the
   * feature being broken rather than a two-step flow nobody had been told
   * about. Soft-delete first, then retry; the caller has already confirmed
   * they want the row gone for good, so doing both steps is what they asked
   * for, not an escalation.
   */
  const permanentDeleteUser = async (
    id: string
  ): Promise<{ success: true } | { success: false; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      let res;
      try {
        res = await axios.delete(`/admin/users/${id}/permanent`, { timeout: PERMANENT_DELETE_TIMEOUT_MS });
      } catch (first: any) {
        const notSoftDeleted =
          first.response?.status === 400 && /not soft-?deleted/i.test(String(first.response?.data?.message ?? ""));
        if (!notSoftDeleted) throw first;
        await axios.delete(`/admin/users/${id}`);
        res = await axios.delete(`/admin/users/${id}/permanent`, { timeout: PERMANENT_DELETE_TIMEOUT_MS });
      }
      if (isProductionRefusal(res?.data)) {
        setError(PRODUCTION_REFUSAL_MESSAGE);
        return { success: false as const, message: PRODUCTION_REFUSAL_MESSAGE };
      }
      return { success: true as const };
    } catch (err: any) {
      const msg =
        err.code === "ECONNABORTED"
          ? "The backend didn't answer. The delete is known to hang on some accounts, the row may still be there. Don't retry repeatedly; each attempt ties up a database connection."
          : err.response?.status === 404
          ? "User not found"
          : err.response?.status === 400
          ? err.response?.data?.message || "User must be soft-deleted first"
          : err.message || "Failed to permanently delete user";
      setError(msg);
      return { success: false as const, message: msg };
    } finally {
      setLoading(false);
    }
  };

  return {
    clearError: () => setError(null),
    fetchUsers,
    loading,
    error,
    toggleUserStatus,
    restoreUser,
    softDeleteUser,
    permanentDeleteUser,
  };
};
