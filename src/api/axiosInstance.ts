"use client";

import axios from "axios";
import { useMemo } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

/**
 * Authenticated axios instance.
 *
 * The interceptors are installed SYNCHRONOUSLY in useMemo (during render),
 * NOT in a useEffect. That matters: React runs child effects before parent
 * effects, so when a child component (e.g. ContentManager) fired its fetch
 * in its own effect, the parent's interceptor-installing effect hadn't run
 * yet — the first request went out with no Authorization header and got a
 * 401. Installing in useMemo guarantees the interceptors exist before any
 * effect fires.
 *
 * The request interceptor reads the token from localStorage at REQUEST time
 * (always current). This build has no login, so a 401 re-mints the backend
 * token once and retries rather than logging anyone out.
 */
export const useAxios = () => {
  const instance = useMemo(() => {
    const inst = axios.create({ baseURL: getApiBaseUrl() });

    inst.interceptors.request.use(
      (config) => {
        const token =
          typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (token && token !== "undefined" && token !== "null") {
          config.headers = config.headers || {};
          config.headers["Authorization"] = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    inst.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;
        // A 401 from the backend usually just means the browser's backend
        // token lapsed — not that the dashboard session is gone. So try to
        // re-mint it via our session (/me) and retry the request ONCE before
        // logging anyone out. We only bounce to /login if /me itself says the
        // session is no longer valid.
        if (error.response?.status === 401 && original && !original._retried) {
          original._retried = true;
          // A 401 from the backend means the browser's backend token lapsed.
          // This dashboard has no login, so re-mint the token and retry once.
          try {
            const res = await fetch("/api/auth/token", { cache: "no-store" });
            if (res.ok) {
              const d = await res.json();
              if (d.backendToken) {
                localStorage.setItem("token", d.backendToken);
                original.headers = original.headers || {};
                original.headers["Authorization"] = `Bearer ${d.backendToken}`;
                return inst(original);
              }
            }
          } catch {
            /* backend not configured — surface the original error */
          }
          return Promise.reject(error);
        }
        return Promise.reject(error);
      }
    );

    return inst;
  }, []);

  return instance;
};
