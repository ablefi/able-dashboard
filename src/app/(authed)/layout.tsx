"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import UserAnalysisAutoRefresh from "@/components/UserAnalysisAutoRefresh";

/**
 * App shell. This build has no login and no section gating: every page is
 * reachable by anyone who can reach the deployment.
 */
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const [collapsed, setCollapsed] = useState(false);



  useEffect(() => {
    if (typeof window !== "undefined") setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  if (!initialized) {
    return (
      <div className="jp-shell flex min-h-screen items-center justify-center bg-jp-navy">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-jp-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="jp-shell min-h-screen bg-jp-navy text-ink">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} sections={user?.sections ?? []} isOwner />
      {/* Daily background refresh of User Analysis — fires from any page. */}
      <UserAnalysisAutoRefresh />
      <main className={"transition-[padding] duration-200 " + (collapsed ? "pl-[4.25rem]" : "pl-64")}>
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
