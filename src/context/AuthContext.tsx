"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { hasPermission, canSeeSection, type AdminSession } from "@/lib/permissions";

export type SessionUser = AdminSession;
interface AuthContextType {
  user: SessionUser | null;
  /** Google sessions never receive backend credentials. */
  token: null;
  initialized: boolean;
  refresh: () => Promise<void>;
  logout: (callback?: () => void) => void;
  loading: boolean;
  error: string | null;
  can: (key: string) => boolean;
  canSection: (section: string) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

function clearLegacyCredentials() {
  try { localStorage.removeItem("token"); localStorage.removeItem("admin"); } catch { /* storage disabled */ }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    clearLegacyCredentials();
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) { setUser(null); return; }
      const data = await res.json();
      setUser(data.authenticated && data.admin ? data.admin : null);
    } catch { setUser(null); }
    finally { setInitialized(true); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    // Recheck expiry/allowlist on focus and periodically. This does not renew the session.
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", check);
    const timer = setInterval(check, 60_000);
    return () => { window.removeEventListener("focus", check); clearInterval(timer); };
  }, [refresh]);

  const logout = async (callback?: () => void) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Could not sign out. Please try again.");
      setUser(null); clearLegacyCredentials();
      // Drop report caches on this browser, while preserving display preferences.
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("able:") || key.startsWith("user-analysis-cache-")) localStorage.removeItem(key);
        }
      } catch { /* storage disabled */ }
      callback?.();
      window.location.assign("/login");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setLoading(false); }
  };
  return <AuthContext.Provider value={{ user, token: null, initialized, refresh, logout, loading, error,
    can: (key) => hasPermission(user, key), canSection: (section) => canSeeSection(user, section),
  }}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context) return context;
  if (typeof window === "undefined") return {
    user: null, token: null, initialized: false, refresh: async () => {}, logout: () => {},
    loading: false, error: null, can: () => false, canSection: () => false,
  };
  throw new Error("useAuth must be used within AuthProvider");
}
