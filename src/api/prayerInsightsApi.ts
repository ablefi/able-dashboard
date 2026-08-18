import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export type PrayerType = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerStatus =
  | "prayed_on_time"
  | "prayed_late"
  | "missed"
  | "excused";

export interface SummaryCount {
  prayer: PrayerType;
  status: PrayerStatus;
  totalCount: number;
}

export interface MonthlyTrend {
  month: string; // Format: "YYYY-MM"
  prayer: PrayerType;
  status: PrayerStatus;
  count: number;
}

export interface PrayerInsightsResponse {
  summaryCounts: SummaryCount[];
  monthlyTrends: MonthlyTrend[];
}

export const usePrayerInsightsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrayerInsights =
    useCallback(async (): Promise<PrayerInsightsResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<PrayerInsightsResponse>(
          "/admin/prayer-insights"
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch prayer insights");
        return null;
      } finally {
        setLoading(false);
      }
    }, [axios]);

  return {
    fetchPrayerInsights,
    loading,
    error,
  };
};
