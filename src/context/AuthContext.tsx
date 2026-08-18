"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ALL_SECTION_KEYS, type SectionKey } from "@/lib/sections";

/**
 * No-auth build. There is no login on this dashboard: every visitor is treated
 * as a full-access user. The context is kept so the layout, sidebar and axios
 * instance work unchanged, and so a real session can be reinstated later by
 * restoring this file and the /api/auth routes from the original.
 *
 * The one thing it still does is fetch a backend token from /api/auth/token
 * and mirror it into localStorage under "token", which is what the direct
 * browser-to-backend calls in src/api use.
 */

export interface SessionUser {
  username: string;
  role: string;
  isOwner: boolean;
  sections: SectionKey[];
}

interface AuthContextType {
  user: SessionUser | null;
  token: string | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
}

const OPEN_USER: SessionUser = {
  username: "able",
  role: "owner",
  isOwner: true,
  sections: ALL_SECTION_KEYS,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/token", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (d.backendToken) {
            setToken(d.backendToken);
            if (typeof window !== "undefined") localStorage.setItem("token", d.backendToken);
          }
        }
      } catch {
        /* backend not configured yet — pages that need it will show empty */
      } finally {
        setInitialized(true);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ user: OPEN_USER, token, initialized, loading: false, error: null }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return { user: OPEN_USER, token: null, initialized: false, loading: false, error: null };
  }
  return ctx;
};
