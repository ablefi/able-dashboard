"use client";

import ThemePicker from "@/components/ThemePicker";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/layout/BottomNav";
import SectionNav from "@/components/layout/SectionNav";
import CommandPalette from "@/components/layout/CommandPalette";
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

  return (
    <div className="app-shell min-h-screen bg-app-navy text-ink" data-presentation={presentation}>
      {/* Able uses the Just Pray-style floating bottom navigation on every
          screen. Saved experimental layouts must not restore the sidebar. */}
      <BottomNav admin={user} />

      {/* Available in every mode: it is what lets the chrome be small. */}
      <CommandPalette admin={user} />

      {/* Daily background refresh of User Analysis — fires from any page. */}
      <UserAnalysisAutoRefresh />
      {/* Local-only palette control, for dialling the look in by eye. */}
      {user.isSuperAdmin && <ThemePicker />}
      <main className="pb-24">
        {/* The canvas. Capped and centred under Focused, which sounds like the
            opposite of using the space but is the thing that makes it look
            composed rather than stretched: an uncapped page gives you 1900px
            table rows and unreadable line lengths. The width gets spent on
            side-by-side regions (PageGrid) instead of on wider single columns. */}
        <div className="app-canvas px-6 py-8 lg:px-10"><SectionNav />{children}</div>
      </main>
    </div>
  );
}
