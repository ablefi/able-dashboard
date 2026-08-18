import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export type AppSettings = Record<string, string | number | boolean | object>;

export interface AppSettingsUpdate {
  key: string;
  value: string;
}

export const useAppSettingsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAppSettings = useCallback(async (): Promise<AppSettings | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<AppSettings>("/admin/app-settings");
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch app settings");
      return null;
    } finally {
      setLoading(false);
    }
  }, [axios]);

  const updateAppSettings = async (
    updates: AppSettingsUpdate[]
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.patch<{ success: boolean }>(
        "/admin/app-settings",
        { updates }
      );
      return res.data.success;
    } catch (err: any) {
      setError(err.message || "Failed to update app settings");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    getAppSettings,
    updateAppSettings,
    loading,
    error,
  };
};
