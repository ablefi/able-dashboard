import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface Quote {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuotesListResponse {
  results: Quote[];
  total: number;
}

export const useQuotesApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotes = useCallback(
    async (
      params: { page?: number; limit?: number } = {}
    ): Promise<QuotesListResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<QuotesListResponse>("/admin/quotes", {
          params,
        });
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch quotes");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const getQuoteById = async (id: string): Promise<Quote | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<Quote>(`/admin/quotes/${id}`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch quote");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createQuote = async (data: {
    title: string;
    body: string;
  }): Promise<Quote | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Quote>("/admin/quotes", data);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to create quote");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateQuote = async (
    id: string,
    data: Partial<{ title: string; body: string }>
  ): Promise<Quote | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.patch<Quote>(`/admin/quotes/${id}`, data);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to update quote");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteQuote = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/quotes/${id}`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to delete quote");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const activateQuote = async (id: string): Promise<Quote | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Quote>(`/admin/quotes/${id}/activate`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to activate quote");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deactivateQuote = async (id: string): Promise<Quote | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<Quote>(`/admin/quotes/${id}/deactivate`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to deactivate quote");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchQuotes,
    getQuoteById,
    createQuote,
    updateQuote,
    deleteQuote,
    activateQuote,
    deactivateQuote,
    loading,
    error,
  };
};
