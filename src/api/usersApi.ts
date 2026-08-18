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
    personalJourney: string;
    currentDailyPrayer: number;
    heard: string;
    targetDailyPrayers: number;
    donationCountry?: "SUDAN" | "PALASTINE" | "YEMEN" | null;
  };
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

  const generateFakePrayerLogs = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/admin/users/${id}/generate-fake-prayer-logs`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to generate fake prayer logs");
      return false;
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

  const permanentDeleteUser = async (
    id: string
  ): Promise<{ success: true } | { success: false; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/users/${id}/permanent`);
      return { success: true as const };
    } catch (err: any) {
      const msg =
        err.response?.status === 404
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
    fetchUsers,
    loading,
    error,
    toggleUserStatus,
    generateFakePrayerLogs,
    restoreUser,
    softDeleteUser,
    permanentDeleteUser,
  };
};
