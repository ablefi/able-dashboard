"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdminSettingsLink from "@/components/admins/AdminSettingsLink";
import { usePathname } from "next/navigation";
import { Search, MoreHorizontal, LogOut } from "lucide-react";
import { canSeeSection, type AdminSession } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { NAV, activeHrefFor, sectionIdForPath, type Section, visibleNav } from "@/lib/nav";

/**
 * How many sections get their own tab before the rest fold into the overflow.
 *
 * Every section gets its own tab, so the built-in overflow button never
 * appears. Lower this if you add more sections than fit.
 */
const PRIMARY = 8;

const DEFAULT_SECTION_HREF: Record<string, string> = {
  users: "/users",
  creators: "/creators",
  referral: "/referral-codes",
  growth: "/growth",
  finances: "/money",
};

/**
 * iOS-style bottom bar.
 *
 * The honest trade: the window gets its full width back and the chrome reads
 * as an app rather than an admin panel, but ten sections do not fit as tabs,
 * so the tail folds into More. That is the same compromise iOS makes, and it
 * is only tolerable because the palette (⌘K) means the bar is not carrying
 * the whole navigation load.
 *
 * Hovering a section raises its pages above that tab. Clicking goes straight
 * to the section's most useful everyday page.
 */
export default function BottomNav({ admin }: { admin: AdminSession | null }) {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname);
  const activeSection = sectionIdForPath(pathname);
  const { logout } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /**
   * Hover opens a section, so reaching a page is one click instead of two.
   *
   * Both delays exist for a reason. Opening waits ~110ms so dragging the
   * pointer across the bar to reach Search does not flash five sheets on the
   * way. Closing waits ~220ms so the gap between a tab and the sheet above it
   * does not count as leaving, which would make the sheet impossible to reach.
   *
   * Guarded on (hover: hover): a touch screen reports a mouseenter on tap, so
   * without this a phone would open the sheet and immediately act on the tap
   * underneath it. Click still works everywhere regardless.
   */
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
  const clearHover = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } };
  const hoverOpen = (id: string) => {
    if (!canHover()) return;
    clearHover();
    hoverTimer.current = setTimeout(() => setOpenId(id), 110);
  };
  const hoverLeave = () => {
    if (!canHover()) return;
    clearHover();
    hoverTimer.current = setTimeout(() => setOpenId(null), 220);
  };
  // A timer that outlives the component would setState on an unmounted tree.
  useEffect(() => clearHover, []);

  const nodes = visibleNav((s) => canSeeSection(admin, s));
  const sections = nodes.filter((n): n is Section => n.kind === "section");
  const primary = sections.slice(0, PRIMARY);
  const overflow = sections.slice(PRIMARY);

  // Close the sheet on navigation and on any outside press.
  useEffect(() => setOpenId(null), [pathname]);
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [openId]);

  return (
    <div ref={barRef} className="app-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
      {/* The overflow sheet is a plain list of the remaining sections. */}
      {openId === "__more__" && (
        <div onMouseEnter={clearHover} onMouseLeave={hoverLeave} className="app-sheet pointer-events-auto mb-5 w-[min(90vw,20rem)] rounded-2xl border border-white/[0.09] bg-app-navy-card/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {overflow.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenId(s.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[0.8125rem] text-ink-muted transition-colors duration-100 hover:bg-white/[0.04] hover:text-ink"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[0.8125rem] text-ink-faint transition-colors duration-100 hover:bg-white/[0.04] hover:text-app-red-text"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      )}

      <nav
        className="app-tabbar pointer-events-auto mb-3.5 flex items-end gap-1.5 rounded-[1.2rem] border border-white/[0.1] bg-app-navy-card/85 px-1.5 py-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
        aria-label="Sections"
      >
        <Link href="/" className={"app-tab " + (activeHref === "/" ? "is-on" : "")}>
          {(() => {
            const Icon = NAV[0].icon;
            return <Icon className="h-[1.25rem] w-[1.25rem]" />;
          })()}
          <span>Home</span>
        </Link>

        {primary.map((s, index) => {
          const Icon = s.icon;
          const on = activeSection === s.id;
          const requestedHref = DEFAULT_SECTION_HREF[s.id];
          const defaultHref = s.items.some((item) => item.href === requestedHref)
            ? requestedHref
            : s.items[0].href;
          const sheetPosition = index < 2
            ? "left-0"
            : index >= primary.length - 2
              ? "right-0"
              : "left-1/2 -translate-x-1/2";
          return (
            <div key={s.id} className="relative">
              {openId === s.id && (
                <div
                  onMouseEnter={clearHover}
                  onMouseLeave={hoverLeave}
                  className={`pointer-events-auto absolute bottom-[calc(100%+1.25rem)] ${sheetPosition} w-[min(90vw,24rem)]`}
                >
                  <div className="app-sheet rounded-2xl border border-white/[0.09] bg-app-navy-card/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
                    <p className="px-2.5 pb-1 pt-1 text-[0.625rem] font-medium uppercase tracking-wider text-ink-faint">
                      {s.label}
                    </p>
                    <div className="grid grid-cols-2 gap-0.5">
                      {s.items.map((item) => {
                        const ItemIcon = item.icon;
                        const itemOn = activeHref === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={
                              "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.8125rem] transition-colors duration-100 " +
                              (itemOn ? "bg-app-blue/[0.14] text-ink" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")
                            }
                          >
                            <ItemIcon className={"h-3.5 w-3.5 shrink-0 " + (itemOn ? "text-app-blue" : "")} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <Link
                href={defaultHref}
                scroll
                onClick={() => { clearHover(); setOpenId(null); window.scrollTo({ top: 0, left: 0 }); }}
                onMouseEnter={() => hoverOpen(s.id)}
                onMouseLeave={hoverLeave}
                // Full blue means "this is the page you are on". Merely opening the
                // sheet gets the same quiet highlight as a hover, so raising a
                // menu never looks like you already navigated.
                className={"app-tab " + (on ? "is-on" : openId === s.id ? "is-open" : "")}
              >
                <Icon className="h-[1.25rem] w-[1.25rem]" />
                <span>{s.label.replace("User ", "")}</span>
              </Link>
            </div>
          );
        })}

        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenId((v) => (v === "__more__" ? null : "__more__"))}
            className={
              "app-tab " +
              (openId === "__more__" || overflow.some((s) => s.id === activeSection) ? "is-on" : "")
            }
          >
            <MoreHorizontal className="h-[1.25rem] w-[1.25rem]" />
            <span>More</span>
          </button>
        )}

        <span className="mx-1 h-8 w-px self-center bg-white/[0.1]" />

        <AdminSettingsLink className="app-tab" label />

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("app-open-palette"))}
          className="app-tab"
          title="Jump to a page  (⌘K)"
        >
          <Search className="h-[1.25rem] w-[1.25rem]" />
          <span>Search</span>
        </button>
      </nav>
    </div>
  );
}
