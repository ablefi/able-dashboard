"use client";

import { useState } from "react";
import Link from "next/link";
import AdminSettingsLink from "@/components/admins/AdminSettingsLink";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { canSeeSection, type AdminSession } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { NAV, activeHrefFor, sectionIdForPath, visibleNav } from "@/lib/nav";

export const RAIL_W = "4.25rem";

/**
 * Icon rail with a hover flyout.
 *
 * Same spatial order as the sidebar, so muscle memory survives, but 208px
 * narrower. The section's pages appear in a floating panel on hover rather
 * than pushing the page around, which is what made the collapsed sidebar
 * frustrating: you could see where to go but not what was there.
 *
 * Opens on hover AND on focus, so it is reachable by keyboard rather than
 * mouse-only.
 */
export default function Rail({ admin }: { admin: AdminSession | null }) {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname);
  const activeSection = sectionIdForPath(pathname);
  const { logout } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  const nodes = visibleNav((s) => canSeeSection(admin, s));

  return (
    <nav
      className="fixed inset-y-0 left-0 z-40 flex w-[4.25rem] flex-col items-center border-r border-white/[0.06] bg-app-navy-card/60 py-3 backdrop-blur-xl"
      onMouseLeave={() => setOpenId(null)}
      aria-label="Sections"
    >
      <Link href="/" className="mb-2 shrink-0" aria-label="Dashboard">
        <Image src="/logo.png" alt="" width={30} height={30} className="rounded-lg" />
      </Link>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("app-open-palette"))}
        title="Jump to a page  (⌘K)"
        aria-label="Jump to a page"
        className="app-rail-btn mb-1 text-ink-faint hover:text-ink"
      >
        <Search className="h-[1.05rem] w-[1.05rem]" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {nodes.map((n) => {
          const Icon = n.icon;
          const isItem = n.kind === "item";
          const on = isItem ? activeHref === n.href : activeSection === n.id;
          const id = isItem ? n.href : n.id;

          const button = isItem ? (
            <Link href={n.href} className={"app-rail-btn " + (on ? "is-on" : "")} aria-label={n.label}>
              <Icon className="h-[1.05rem] w-[1.05rem]" />
            </Link>
          ) : (
            <button type="button" className={"app-rail-btn " + (on ? "is-on" : "")} aria-label={n.label}>
              <Icon className="h-[1.05rem] w-[1.05rem]" />
            </button>
          );

          return (
            <div
              key={id}
              className="relative"
              onMouseEnter={() => setOpenId(isItem ? null : n.id)}
              onFocus={() => setOpenId(isItem ? null : n.id)}
            >
              {button}

              {/* Flyout. Rendered only while open so it can animate in each time. */}
              {!isItem && openId === n.id && (
                <div className="app-flyout absolute left-[3.4rem] top-0 z-50 min-w-[13rem] rounded-xl border border-white/[0.09] bg-app-navy-card p-1.5 shadow-2xl shadow-black/50">
                  <p className="px-2.5 pb-1 pt-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-ink-faint">
                    {n.label}
                  </p>
                  {n.items.map((i) => {
                    const ItemIcon = i.icon;
                    const itemOn = activeHref === i.href;
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        onClick={() => setOpenId(null)}
                        className={
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-[0.4rem] text-[0.8125rem] transition-colors duration-100 " +
                          (itemOn ? "bg-app-blue/[0.14] text-ink" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")
                        }
                      >
                        <ItemIcon className={"h-3.5 w-3.5 " + (itemOn ? "text-app-blue" : "")} />
                        <span className="truncate">{i.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Tooltip for the two items with no flyout of their own. */}
              {isItem && (
                <span className="app-rail-tip pointer-events-none absolute left-[3.4rem] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/[0.09] bg-app-navy-card px-2 py-1 text-[0.6875rem] text-ink opacity-0 shadow-lg transition-opacity duration-100">
                  {n.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <AdminSettingsLink className="app-rail-btn mt-1 shrink-0" />

      <button
        type="button"
        onClick={() => logout()}
        title="Sign out"
        aria-label="Sign out"
        className="app-rail-btn mt-1 shrink-0 text-ink-faint hover:text-app-red-text"
      >
        <LogOut className="h-[1.05rem] w-[1.05rem]" />
      </button>
    </nav>
  );
}
