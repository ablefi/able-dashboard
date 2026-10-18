"use client";

import axios from "axios";
import { useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
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
 * (always current), and the 401 handler calls the latest logout via a ref —
 * so there's no stale-closure / effect-ordering race anywhere.
 */
export const useAxios = () => {
  const { logout } = useAuth();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

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
          try {
            const me = await fetch("/api/auth/me", { cache: "no-store" });
            if (me.ok) {
              const d = await me.json();
              if (d.authenticated) {
                if (d.backendToken) {
                  localStorage.setItem("token", d.backendToken);
                  original.headers = original.headers || {};
                  original.headers["Authorization"] = `Bearer ${d.backendToken}`;
                  return inst(original); // retry once with the fresh token
                }
                // Valid session, just no backend token for this role — don't
                // nuke the session; let the caller see the error.
                return Promise.reject(error);
              }
            }
          } catch {
            /* network/parse issue — fall through to logout */
          }
          // Session really is gone (cookie expired / signed out elsewhere).
          logoutRef.current?.();
          if (typeof window !== "undefined") window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );

    return inst;
  }, []);

  return instance;
};
