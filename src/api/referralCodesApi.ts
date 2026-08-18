import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface ReferralCode {
  id: string;
  name: string;
  description?: string;
  code: string;
  active: boolean;
  expiredAt?: string;
  offeringId?: string;
  bypassPaywall: boolean;
  bypassPaywallDurationDays?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  usersCount: number;
  subscribedUsersCount: number;
}

export interface GraphDataPoint {
  date: string;
  count: number;
}

export interface ReferralCodeDetails extends ReferralCode {
  subscribedUsersGraph: GraphDataPoint[];
  totalUsersGraph: GraphDataPoint[];
  totalRevenueGraph: GraphDataPoint[];
}

export interface RevenueByProduct {
  productId: string;
  currency: string;
  totalRevenue: number;
  transactionCount: number;
  refundCount: number;
  totalRefunds: number;
  netRevenue: number;
}

export interface ReferralCodeRevenue {
  id: string;
  name: string;
  description?: string;
  code: string;
  active: boolean;
  expiredAt?: string;
  offeringId?: string;
  bypassPaywall: boolean;
  bypassPaywallDurationDays?: number | null;
  createdAt: string;
  updatedAt: string;
  totalUsers: number;
  subscribedUsers: number;
  revenueByProduct: RevenueByProduct[];
  totalRevenue: number;
  totalTransactions: number;
  totalRefunds: number;
  netRevenue: number;
}

export interface MonthlyRevenueBreakdown {
  month: string;
  totalRevenueUsd: number;
  totalRefundsUsd: number;
  netRevenueUsd: number;
  transactionCount: number;
  revenueByProduct: RevenueByProduct[];
}

export interface ReferralCodeDetailedRevenue extends ReferralCodeRevenue {
  monthlyBreakdown: MonthlyRevenueBreakdown[];
}

export interface ReferralRevenueAnalytics {
  data: ReferralCodeRevenue[];
  totalRevenue: number;
  totalTransactions: number;
  totalRefunds: number;
  netRevenue: number;
  totalUsers: number;
  subscribedUsers: number;
}

export interface ReferralCodesResponse {
  data: ReferralCode[];
}

export const useReferralCodesApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReferralCodes = useCallback(
    async (deleted?: boolean): Promise<ReferralCode[] | null> => {
      setLoading(true);
      setError(null);
      try {
        const params = deleted ? { deleted: "true" } : {};
        const res = await axios.get<ReferralCode[]>("/admin/referral-codes", {
          params,
        });
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch referral codes");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const fetchReferralCodeDetails = useCallback(
    async (id: string): Promise<ReferralCodeDetails | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ReferralCodeDetails>(
          `/admin/referral-codes/${id}`
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch referral code details");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const createReferralCode = async (
    data: Partial<ReferralCode>
  ): Promise<ReferralCode | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<ReferralCode>("/admin/referral-codes", data);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to create referral code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateReferralCode = async (
    id: string,
    data: Partial<ReferralCode>
  ): Promise<ReferralCode | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.put<ReferralCode>(
        `/admin/referral-codes/${id}`,
        data
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to update referral code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const activateReferralCode = async (
    id: string
  ): Promise<ReferralCode | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.put<ReferralCode>(
        `/admin/referral-codes/${id}/activate`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to activate referral code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deactivateReferralCode = async (
    id: string
  ): Promise<ReferralCode | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.put<ReferralCode>(
        `/admin/referral-codes/${id}/deactivate`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to deactivate referral code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchReferralRevenueAnalytics =
    useCallback(async (): Promise<ReferralRevenueAnalytics | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ReferralRevenueAnalytics>(
          "/admin/referral-codes/revenue-analytics"
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch referral revenue analytics");
        return null;
      } finally {
        setLoading(false);
      }
    }, [axios]);

  const fetchReferralCodeRevenueDetails = useCallback(
    async (id: string): Promise<ReferralCodeDetailedRevenue | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ReferralCodeDetailedRevenue>(
          `/admin/referral-codes/${id}/revenue-analytics`
        );
        return res.data;
      } catch (err: any) {
        setError(
          err.message || "Failed to fetch referral code revenue details"
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const deleteReferralCode = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/referral-codes/${id}`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to delete referral code");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const recoverReferralCode = async (
    id: string
  ): Promise<ReferralCode | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.put<ReferralCode>(
        `/admin/referral-codes/${id}/recover`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to recover referral code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchReferralCodes,
    fetchReferralCodeDetails,
    fetchReferralRevenueAnalytics,
    fetchReferralCodeRevenueDetails,
    createReferralCode,
    updateReferralCode,
    activateReferralCode,
    deactivateReferralCode,
    deleteReferralCode,
    recoverReferralCode,
    loading,
    error,
  };
};
