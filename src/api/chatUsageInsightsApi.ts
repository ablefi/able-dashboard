import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface ChatUsageSummary {
  totalRequests: number;
}

export interface ChatUsageMonthlyTrend {
  month: string; // Format: "YYYY-MM"
  totalRequests: number;
}

export interface ChatUsageInsightsResponse {
  summary: ChatUsageSummary;
  monthlyTrends: ChatUsageMonthlyTrend[];
}

export const useChatUsageInsightsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChatUsageInsights =
    useCallback(async (): Promise<ChatUsageInsightsResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ChatUsageInsightsResponse>(
          "/admin/chat-usage-insights"
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch chat usage insights");
        return null;
      } finally {
        setLoading(false);
      }
    }, [axios]);

  return {
    fetchChatUsageInsights,
    loading,
    error,
  };
};
