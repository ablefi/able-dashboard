"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Click-to-sort headers for the hand-written tables.
 *
 * The wide ones (Referral Analytics at 9 columns) are also the ones long enough to paginate, so finding a row
 * means sorting rather than scrolling. DataTable would give this plus column
 * hiding, but those tables carry conditional checkboxes, expandable cells and
 * per-row action buttons, and rebuilding that is a lot of risk on pages that
 * approve applications and email people. Sorting is the part that was missing.
 *
 * Nulls always sink, in both directions. A column of names sorted A to Z should
 * not open with a screen of dashes.
 */

export type SortDir = "asc" | "desc";
export type Accessors<T> = Record<string, (row: T) => string | number | null | undefined>;

export function useSort<T>(rows: T[], accessors: Accessors<T>, initialKey?: string, initialDir: SortDir = "asc") {
  const [key, setKey] = useState<string | null>(initialKey ?? null);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!key || !accessors[key]) return rows;
    const get = accessors[key];
    const out = [...rows];
    out.sort((a, b) => {
      const va = get(a), vb = get(b);
      const na = va === null || va === undefined || va === "";
      const nb = vb === null || vb === undefined || vb === "";
      if (na && nb) return 0;
      if (na) return 1;   // empties sink regardless of direction
      if (nb) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, key, dir, accessors]);

  /** Click the active column to flip it, a new one to sort by it ascending. */
  const toggle = (k: string) => {
    if (!accessors[k]) return;
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("asc"); }
  };

  return { sorted, sortKey: key, sortDir: dir, toggle };
}

export function SortTh({
  label,
  sortKey,
  active,
  dir,
  onToggle,
  className,
}: {
  label: string;
  /** Omit to render a plain, unsortable header (actions, checkboxes). */
  sortKey?: string;
  active?: boolean;
  dir?: SortDir;
  onToggle?: (key: string) => void;
  className?: string;
}) {
  const base = "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint";
  if (!sortKey || !onToggle) return <th className={cn(base, className)}>{label}</th>;
  return (
    <th className={cn(base, "select-none", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-ink",
          active && "text-ink"
        )}
        title={`Sort by ${label}`}
      >
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-35" />
        )}
      </button>
    </th>
  );
}
