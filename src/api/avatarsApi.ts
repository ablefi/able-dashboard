import { useState, useCallback } from "react";
import { useAxios } from "./axiosInstance";

export interface Avatar {
  id: string;
  name: string;
  gender: "male" | "female";
  verse?: string;
  source?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarsListResponse {
  results: Avatar[];
  total: number;
}

export const useAvatarsApi = () => {
  const axios = useAxios();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvatars = useCallback(
    async (
      params: { page?: number; limit?: number } = {}
    ): Promise<AvatarsListResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<AvatarsListResponse>("/admin/avatars", {
          params,
        });
        return res.data;
      } catch (err: any) {
        setError(err.message || "Failed to fetch avatars");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [axios]
  );

  const getAvatarById = async (id: string): Promise<Avatar | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<Avatar>(`/admin/avatars/${id}`);
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch avatar");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createAvatar = async (data: {
    name?: string;
    gender: "male" | "female";
    verse?: string;
    source?: string;
    file: File;
  }): Promise<Avatar | null> => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (data.name) formData.append("name", data.name);
      formData.append("gender", data.gender);
      if (data.verse) formData.append("verse", data.verse);
      if (data.source) formData.append("source", data.source);
      formData.append("file", data.file);

      const res = await axios.post<Avatar>("/admin/avatars", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to create avatar");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateAvatar = async (
    id: string,
    data: {
      name?: string;
      gender?: "male" | "female";
      verse?: string;
      source?: string;
      file?: File;
    }
  ): Promise<Avatar | null> => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (data.name) formData.append("name", data.name);
      if (data.gender) formData.append("gender", data.gender);
      if (data.verse !== undefined) formData.append("verse", data.verse);
      if (data.source !== undefined) formData.append("source", data.source);
      if (data.file) formData.append("file", data.file);

      const res = await axios.patch<Avatar>(`/admin/avatars/${id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return res.data;
    } catch (err: any) {
      setError(err.message || "Failed to update avatar");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteAvatar = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/admin/avatars/${id}`);
      return true;
    } catch (err: any) {
      setError(err.message || "Failed to delete avatar");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchAvatars,
    getAvatarById,
    createAvatar,
    updateAvatar,
    deleteAvatar,
    loading,
    error,
  };
};
