"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, CornerDownLeft, Clock } from "lucide-react";
import { canSeeSection, type AdminSession } from "@/lib/permissions";
import { flatDestinations, scoreMatch, type Destination } from "@/lib/nav";

const RECENT_KEY = "app-nav-recent-v1";
const MAX_RECENT = 6;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/**
 * Jump to any page by typing.
 *
 * This is the reason the chrome can shrink. There are ~35 destinations across
 * 10 sections, which is more than any bar of icons can carry honestly — but
 * for someone in here every day, *browsing* nav is the wrong primitive
 * anyway. Two or three keystrokes beats hunting a tree, and it costs zero
 * pixels. Available in every nav mode, on purpose.
 */
export default function CommandPalette({ admin }: { admin: AdminSession | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(
    () => flatDestinations().filter((d) => d.section === null || canSeeSection(admin, d.section)),
    [admin]
  );

  // Empty query shows where you have actually been, most recent first, so the
  // palette is useful before you have typed anything.
  const results = useMemo(() => {
    if (!q.trim()) {
      const byHref = new Map(all.map((d) => [d.href, d]));
      const seen = recent.map((h) => byHref.get(h)).filter(Boolean) as Destination[];
      const rest = all.filter((d) => !recent.includes(d.href));
      return [...seen, ...rest].slice(0, 12);
    }
    return all
      .map((d) => {
        const own = scoreMatch(q, d.label);
        const grouped = scoreMatch(q, `${d.group} ${d.label}`);
        const best = Math.max(own ?? -Infinity, (grouped ?? -Infinity) - 40);
        return Number.isFinite(best) ? { d, score: best } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 12)
      .map((r) => r!.d);
  }, [q, all, recent]);

  const go = useCallback(
    (dest: Destination) => {
      try {
        const next = [dest.href, ...readRecent().filter((h) => h !== dest.href)].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setOpen(false);
      router.push(dest.href);
    },
    [router]
  );

  // Open / close. Cmd+K on Mac, Ctrl+K elsewhere. "/" opens too, but only
  // when the user is not already typing into something.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "/" && !open) {
        const el = e.target as HTMLElement | null;
        const typing = !!el?.closest("input, textarea, select, [contenteditable='true']");
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("app-open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app-open-palette", onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    setRecent(readRecent());
    // Focus after paint so the caret lands reliably on first open.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Close on navigation, so following a result never leaves it hanging open.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => setCursor(0), [q]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const dest = results[cursor];
      if (dest) go(dest);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Jump to a page"
    >
      <div className="app-palette-veil absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <div
        className="app-palette relative w-full max-w-[36rem] overflow-hidden rounded-[1.25rem] border border-white/[0.1] bg-app-navy-card/95 shadow-[0_28px_70px_-12px_rgba(0,0,0,0.75)] backdrop-blur-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
      >
        {/* Search row. No border of its own — a boxed field inside an already
            bordered panel is what made this look like a 2005 dialog. The hairline
            under it is the only division, and it only appears once there is a
            list below to divide from. */}
        <div className={"flex items-center gap-3 px-5 " + (results.length ? "border-b border-white/[0.06]" : "")}>
          <Search className="h-[1.05rem] w-[1.05rem] shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a page…"
            className="w-full py-4 text-[0.9375rem] tracking-[-0.01em] text-ink placeholder:text-ink-faint"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-1 text-[10px] font-medium text-ink-faint">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[21rem] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-7 text-center text-[0.8125rem] text-ink-faint">Nothing matches “{q}”.</p>
          )}
          {results.map((d, i) => {
            const Icon = d.icon;
            const isRecent = !q.trim() && recent.includes(d.href);
            const on = i === cursor;
            return (
              <button
                key={d.href}
                data-i={i}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(d)}
                className={
                  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-100 " +
                  (on ? "bg-white/[0.07]" : "hover:bg-white/[0.035]")
                }
              >
                {/* Selection is carried by the icon plate lighting up, not by a
                    saturated block behind the whole row, that read as heavy
                    and dated at this size. */}
                <span
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] transition-colors duration-100 " +
                    (on ? "bg-app-blue/25 text-app-blue-light" : "bg-white/[0.05] text-ink-muted")
                  }
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] leading-snug text-ink">{d.label}</span>
                  <span className="block truncate text-[0.75rem] leading-snug text-ink-faint">{d.group}</span>
                </span>
                {isRecent && <Clock className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
                <CornerDownLeft
                  className={"h-3.5 w-3.5 shrink-0 text-ink-faint transition-opacity duration-100 " + (on ? "opacity-100" : "opacity-0")}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
