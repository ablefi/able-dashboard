"use client";

import ThemePicker from "@/components/ThemePicker";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import Rail from "@/components/layout/Rail";
import TopNav from "@/components/layout/TopNav";
import BottomNav from "@/components/layout/BottomNav";
import CommandPalette from "@/components/layout/CommandPalette";
import { DEFAULT_NAV_MODE, readNavMode, type NavMode } from "@/lib/navMode";
import { DEFAULT_PRESENTATION, readPresentation, type Presentation } from "@/lib/presentation";
import { applyFont, readFont, type FontKey } from "@/lib/fonts";
import UserAnalysisAutoRefresh from "@/components/UserAnalysisAutoRefresh";
import { sectionForPath } from "@/lib/sections";
import { canSeeSection } from "@/lib/permissions";

/**
 * Authenticated shell. Guards on the dashboard session (restored from the
 * httpOnly cookie via /api/auth/me) and gates sections on the admin's
 * permissions. This is the UX guard only — the backend enforces the same keys
 * on its own routes, and our /api routes re-check via requireSession.
 *
 * `isSuperAdmin` is NOT a bypass here, deliberately: the backend does not skip
 * permission checks for a super admin either (the seeded one just holds every
 * key), so a UI that bypassed would show pages the API would then refuse.
 */
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(DEFAULT_NAV_MODE);
  const [presentation, setPresentation] = useState<Presentation>(DEFAULT_PRESENTATION);

  // Not signed in → login.
  useEffect(() => {
    if (initialized && !user) router.replace("/login");
  }, [initialized, user, router]);

  // Signed in but not permitted here → home.
  useEffect(() => {
    if (!initialized || !user) return;
    const section = sectionForPath(pathname || "/");
    if (!canSeeSection(user, section)) router.replace("/");
  }, [initialized, user, pathname, router]);

  useEffect(() => {
    if (typeof window !== "undefined") setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  // Nav shell is a per-browser preference, switched live from the picker so it
  // can be judged by using it rather than by reloading between commits.
  useEffect(() => {
    setNavMode(readNavMode());
    const onChange = (e: Event) => setNavMode((e as CustomEvent).detail as NavMode);
    window.addEventListener("app-nav-mode", onChange);
    return () => window.removeEventListener("app-nav-mode", onChange);
  }, []);

  // Font is applied here rather than in the picker, because the picker is not
  // mounted for everyone — a saved choice has to survive without it.
  useEffect(() => {
    applyFont(readFont());
    const onChange = (e: Event) => applyFont((e as CustomEvent).detail as FontKey);
    window.addEventListener("app-font-change", onChange);
    return () => window.removeEventListener("app-font-change", onChange);
  }, []);

  // Presentation rides on a data attribute rather than props, so the shared
  // primitives restyle without every view having to know about the mode.
  useEffect(() => {
    setPresentation(readPresentation());
    const onChange = (e: Event) => setPresentation((e as CustomEvent).detail as Presentation);
    window.addEventListener("app-presentation", onChange);
    return () => window.removeEventListener("app-presentation", onChange);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  if (!initialized) {
    // Carries data-presentation like the real shell does. Without it this gate
    // renders as bare navy with a spinner on it, so the first thing you see on
    // every cold load is the one screen that does not look like the product.
    return (
      <div
        className="app-shell flex min-h-screen flex-col items-center justify-center gap-4 bg-app-navy"
        data-presentation={presentation}
      >
        <Image src="/icon-200.png" alt="" width={44} height={44} className="rounded-xl opacity-90" priority />
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-app-blue border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  // Each shell reserves its own edge. Kept in one place so a mode can never
  // half-apply and leave content under the chrome.
  const pad =
    navMode === "sidebar" ? (collapsed ? "pl-[4.25rem]" : "pl-64")
    : navMode === "rail" ? "pl-[4.25rem]"
    : navMode === "top" ? "pt-[5.25rem]"
    : "pb-24";

  return (
    <div className="app-shell min-h-screen bg-app-navy text-ink" data-presentation={presentation}>
      {navMode === "sidebar" && <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} admin={user} />}
      {navMode === "rail" && <Rail admin={user} />}
      {navMode === "top" && <TopNav admin={user} />}
      {navMode === "bottom" && <BottomNav admin={user} />}

      {/* Available in every mode: it is what lets the chrome be small. */}
      <CommandPalette admin={user} />

      {/* Daily background refresh of User Analysis — fires from any page. */}
      <UserAnalysisAutoRefresh />
      {/* Local-only palette control, for dialling the look in by eye. */}
      {user.isSuperAdmin && <ThemePicker />}
      <main className={"transition-[padding] duration-200 " + pad}>
        {/* The canvas. Capped and centred under Focused, which sounds like the
            opposite of using the space but is the thing that makes it look
            composed rather than stretched: an uncapped page gives you 1900px
            table rows and unreadable line lengths. The width gets spent on
            side-by-side regions (PageGrid) instead of on wider single columns. */}
        <div className="app-canvas px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
