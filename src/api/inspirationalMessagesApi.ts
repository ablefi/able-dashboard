import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface InspirationalMessage {
  id: string;
  title: string;
  body: string;
  reference: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InspirationalMessagesListResponse {
  results: InspirationalMessage[];
  total: number;
}

export const useInspirationalMessagesApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInspirationalMessages = useCallback(
    async (
      params: { page?: number; limit?: number } = {}
    ): Promise<InspirationalMessagesListResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<InspirationalMessagesListResponse>(
          "/admin/inspirational-messages",
          { params }
        );
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch inspirational messages");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const getInspirationalMessageById = async (
    id: string
  ): Promise<InspirationalMessage | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<InspirationalMessage>(
        `/admin/inspirational-messages/${id}`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch inspirational message");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createInspirationalMessage = async (data: {
    title: string;
    body: string;
    reference: string;
  }): Promise<InspirationalMessage | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<InspirationalMessage>(
        "/admin/inspirational-messages",
        data
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to create inspirational message");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateInspirationalMessage = async (
    id: string,
    data: Partial<{ title: string; body: string; reference: string }>
  ): Promise<InspirationalMessage | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.patch<InspirationalMessage>(
        `/admin/inspirational-messages/${id}`,
        data
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to update inspirational message");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteInspirationalMessage = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/inspirational-messages/${id}`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to delete inspirational message");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const activateInspirationalMessage = async (
    id: string
  ): Promise<InspirationalMessage | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<InspirationalMessage>(
        `/admin/inspirational-messages/${id}/activate`
      );
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to activate inspirational message");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchInspirationalMessages,
    getInspirationalMessageById,
    createInspirationalMessage,
    updateInspirationalMessage,
    deleteInspirationalMessage,
    activateInspirationalMessage,
    loading,
    error,
  };
};
