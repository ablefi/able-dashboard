import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface Supplication {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplicationsListResponse {
  results: Supplication[];
  total: number;
}

export const useSupplicationsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSupplications = useCallback(
    async (
      params: { page?: number; limit?: number } = {}
    ): Promise<SupplicationsListResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<SupplicationsListResponse>(
          "/admin/supplications",
          { params }
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch supplications");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const getSupplicationById = async (
    id: string
  ): Promise<Supplication | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<Supplication>(`/admin/supplications/${id}`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch supplication");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createSupplication = async (data: {
    title: string;
    body: string;
  }): Promise<Supplication | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Supplication>("/admin/supplications", data);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to create supplication");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateSupplication = async (
    id: string,
    data: Partial<{ title: string; body: string }>
  ): Promise<Supplication | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.patch<Supplication>(
        `/admin/supplications/${id}`,
        data
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to update supplication");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteSupplication = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/supplications/${id}`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to delete supplication");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const activateSupplication = async (
    id: string
  ): Promise<Supplication | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Supplication>(
        `/admin/supplications/${id}/activate`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to activate supplication");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deactivateSupplication = async (
    id: string
  ): Promise<Supplication | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Supplication>(
        `/admin/supplications/${id}/deactivate`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to deactivate supplication");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchSupplications,
    getSupplicationById,
    createSupplication,
    updateSupplication,
    deleteSupplication,
    activateSupplication,
    deactivateSupplication,
    loading,
    error,
  };
};
