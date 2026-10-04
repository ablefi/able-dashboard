"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/layout/BottomNav";
import Link from "next/link";
import UserAnalysisAutoRefresh from "@/components/UserAnalysisAutoRefresh";

/**
 * App shell. This build has no login and no section gating: every page is
 * reachable by anyone who can reach the deployment.
 */
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { initialized } = useAuth();

  if (!initialized) {
    return (
      <div className="jp-shell flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-jp-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="jp-shell min-h-screen bg-white text-ink">
      <header className="able-topbar">
        <Link href="/" className="able-wordmark"><span aria-hidden="true" />Able Ops</Link>
        <span className="text-xs text-ink-faint">Marketing workspace</span>
      </header>
      {/* Daily background refresh of User Analysis — fires from any page. */}
      <UserAnalysisAutoRefresh />
      <main className="able-workspace">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
