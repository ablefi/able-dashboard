"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Button from "@/components/ui/Button";

interface PaginationProps {
  /** Current page, 1-based. A 0-indexed caller passes `page + 1` and un-shifts in onChange. */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

/**
 * First / Prev / [type a page] / Next / Last.
 *
 * The typed page is held in local state and only committed on Enter or blur —
 * committing per keystroke would fire a fetch for "1" and "12" on the way to
 * "123". Anything out of range clamps rather than erroring, so "999" on a
 * 12-page table just goes to 12.
 */
export default function Pagination({ page, totalPages, onChange, disabled }: PaginationProps) {
  const [draft, setDraft] = useState(String(page));

  // Follow the page when it changes elsewhere (Prev/Next, a filter reset to 1).
  useEffect(() => setDraft(String(page)), [page]);

  // A caller that renders with 0 pages (an empty result set) would otherwise
  // clamp every jump to 0 and hand back page -1 to a 0-indexed view.
  const pages = Math.max(1, totalPages);

  const go = (target: number) => {
    const clamped = Math.min(pages, Math.max(1, target));
    if (clamped !== page) onChange(clamped);
    setDraft(String(clamped));
  };

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(page)); // gibberish reverts, it doesn't navigate
      return;
    }
    go(parsed);
  };

  const atFirst = disabled || page <= 1;
  const atLast = disabled || page >= pages;

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" size="sm" className="px-2" disabled={atFirst} onClick={() => go(1)} aria-label="First page" title="First page">
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" className="px-2" disabled={atFirst} onClick={() => go(page - 1)} aria-label="Previous page" title="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") setDraft(String(page));
        }}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        inputMode="numeric"
        aria-label={`Page number, ${pages} pages total`}
        className="h-[2.125rem] w-14 rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 text-center text-[0.8125rem] text-ink focus:border-app-blue/45 focus:outline-none disabled:opacity-45"
      />
      <span className="whitespace-nowrap text-xs text-ink-faint">of {pages.toLocaleString()}</span>

      <Button variant="secondary" size="sm" className="px-2" disabled={atLast} onClick={() => go(page + 1)} aria-label="Next page" title="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" className="px-2" disabled={atLast} onClick={() => go(pages)} aria-label="Last page" title="Last page">
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
