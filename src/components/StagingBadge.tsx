"use client";

import { isProductionDashboard } from "@/lib/apiBase";

import { useEffect, useState } from "react";

/**
 * Small "Staging" tag beside the logo.
 *
 * This replaces the full-width amber bar that used to run across the top of
 * every page. That was unmissable, which was the point, but it dominated the
 * whole window and every screenshot taken from it.
 *
 * Shows on every host EXCEPT the production domain, so the same build ships to
 * production and simply renders nothing there — there is no flag to remember
 * to flip. The check is client-side, so it's absent for the first paint
 * rather than briefly wrong.
 */
export default function StagingBadge({ compact = false }: { compact?: boolean }) {
  const [staging, setStaging] = useState(false);

  useEffect(() => {
    setStaging(!isProductionDashboard());
  }, []);

  if (!staging) return null;

  // Collapsed sidebar has no room for a word, so it becomes a dot on the icon.
  if (compact) {
    return (
      <span
        title="Staging. Test environment, not production"
        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-app-orange ring-2 ring-app-navy"
      />
    );
  }

  return (
    <span
      title="Test environment, not production"
      className="rounded border border-app-orange/30 bg-app-orange/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.12em] text-app-orange/90"
    >
      Staging
    </span>
  );
}
