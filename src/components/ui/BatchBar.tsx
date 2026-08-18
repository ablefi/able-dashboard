"use client";

import React from "react";
import { X } from "lucide-react";

/**
 * Selection action bar — shows when ≥1 row is selected. Renders the count,
 * caller-supplied action buttons, and a Clear control. Sits above a table
 * that has DataTable/ContentManager selection enabled.
 */
export default function BatchBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-jp-blue/30 bg-jp-blue/10 px-4 py-2.5">
      <span className="text-sm font-medium text-jp-blue-light">{count} selected</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink">
        <X className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}
