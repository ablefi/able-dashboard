"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { hasPermission, canSeeSection, type AdminSession } from "@/lib/permissions";

/**
 * Dashboard auth — email/password against the BACKEND's admin accounts.
 *
 * The session is an httpOnly cookie the browser can't read, so we learn who
 * we are by calling /api/auth/me. /me also hands back the admin's own backend
 * token, which we mirror into localStorage under
 * "token" so the existing useAxios (direct backend calls) keeps working
 * unchanged. Roles without backend sections (e.g. Marketing) get no token.
 */

/** The signed-in operator, as the backend describes them. Identity and
 * permissions both come from `POST /admin/login` — the dashboard no longer
 * has an opinion about who anyone is. */
export type SessionUser = AdminSession;

interface AuthContextType {
  /** The signed-in admin, with their permissions. */
  user: SessionUser | null;
  /** That admin's OWN backend token — scoped to their permissions, not the
   * shared super-admin credential every operator used to be handed. */
  token: string | null;
  initialized: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  /** Re-read permissions from the backend — call after changing them. */
  refresh: () => Promise<void>;
  logout: (callback?: () => void) => void;
  loading: boolean;
  error: string | null;
  /** Convenience wrappers so components don't import the helpers directly. */
  can: (key: string) => boolean;
  canSection: (section: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setBackendToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sliding 24h idle session. While the user is actively using the dashboard,
  // ping /me (which re-stamps the cookie with a fresh 24h expiry) at most once
  // every 10 min, and only when the tab is in the foreground. No interaction =>
  // no pings => the session lapses 24h after the last activity. Listeners are
  // attached once; userRef lets the handler read the latest auth state without
  // re-subscribing.
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;
  useEffect(() => {
    let lastBeat = 0;
    const beat = () => {
      if (!userRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastBeat < 10 * 60 * 1000) return;
      lastBeat = now;
      fetch("/api/auth/me", { cache: "no-store" }).catch(() => {});
    };
    window.addEventListener("pointerdown", beat);
    window.addEventListener("keydown", beat);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.removeEventListener("pointerdown", beat);
      window.removeEventListener("keydown", beat);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  // Restore session from the cookie via /me on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (d.authenticated && d.admin) {
            setUser(d.admin as SessionUser);
            setToken(d.backendToken ?? null);
            setBackendToken(d.backendToken ?? null);
          }
        } else {
          setBackendToken(null);
          localStorage.removeItem("admin");
        }
      } catch {
        /* offline / network — stay logged out */
      } finally {
        setInitialized(true);
      }
    })();
  }, []);

  const login = async (email: string, password: string): Promise<SessionUser> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || "Login failed");
      const u = d.admin as SessionUser;
      setUser(u);
      setToken(d.backendToken ?? null);
      setBackendToken(d.backendToken ?? null);
      return u;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  /** Pull the current permissions without making anyone sign in again. */
  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (d.authenticated && d.admin) {
        setUser(d.admin as SessionUser);
        setToken(d.backendToken ?? null);
        setBackendToken(d.backendToken ?? null);
      }
    } catch {
      /* offline — keep what we have */
    }
  };

  const can = (key: string) => hasPermission(user, key);
  const canSection = (section: string) => canSeeSection(user, section);

  const logout = (callback?: () => void) => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setToken(null);
    setBackendToken(null);
    if (typeof window !== "undefined") localStorage.removeItem("admin");
    callback?.();
  };

  return (
    <AuthContext.Provider value={{ user, token, initialized, login, refresh, logout, loading, error, can, canSection }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // During SSR/prerender a client component can render before the provider
    // resolves — return an inert logged-out default so it doesn't crash. On
    // the client a missing provider is a real bug, so keep throwing.
    if (typeof window === "undefined") {
      return {
        user: null,
        token: null,
        initialized: false,
        login: async () => {
          throw new Error("not ready");
        },
        refresh: async () => {},
        can: () => false,
        canSection: () => false,
        logout: () => {},
        loading: false,
        error: null,
      } as AuthContextType;
    }
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
