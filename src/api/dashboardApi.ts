import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface DashboardStatsResponse {
  rooms: {
    totalRooms: number;
    avgParticipantsPerRoom: number;
  };
}

export const useDashboardStatsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardStats =
    useCallback(async (): Promise<DashboardStatsResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<DashboardStatsResponse>(
          "/admin/dashboard/stats"
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch dashboard stats");
        return null;
      } finally {
        setLoading(false);
      }
    }, [axios]);

  return {
    fetchDashboardStats,
    loading,
    error,
  };
};
