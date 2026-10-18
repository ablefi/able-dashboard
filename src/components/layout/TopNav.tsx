"use client";

import Link from "next/link";
import AdminSettingsLink from "@/components/admins/AdminSettingsLink";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import StagingBadge from "@/components/StagingBadge";
import { canSeeSection, type AdminSession } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { NAV, activeHrefFor, sectionIdForPath, type Section, visibleNav } from "@/lib/nav";

/**
 * Two rows across the top: sections, then the pages inside the current one.
 *
 * Costs no horizontal space at all, and it is the only mode where you can see
 * both the full section list AND your position inside a section without
 * hovering or opening anything. The second row only appears for a section that
 * has pages, so the Dashboard does not sit under an empty strip.
 */
export default function TopNav({ admin }: { admin: AdminSession | null }) {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname);
  const activeId = sectionIdForPath(pathname);
  const { logout } = useAuth();

  const nodes = visibleNav((s) => canSeeSection(admin, s));
  const sections = nodes.filter((n): n is Section => n.kind === "section");
  const current = sections.find((s) => s.id === activeId) ?? null;

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-app-navy-card/70 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <Link href="/" className="mr-1 flex shrink-0 items-center gap-2" aria-label="Dashboard">
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-lg" />
        </Link>
        <StagingBadge />

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections">
          <Link href="/" className={"app-toptab " + (activeHref === "/" ? "is-on" : "")}>
            Dashboard
          </Link>
          {sections.map((s) => (
            <Link
              key={s.id}
              href={s.items[0]?.href ?? "/"}
              className={"app-toptab " + (activeId === s.id ? "is-on" : "")}
            >
              {s.label.replace("User ", "")}
            </Link>
          ))}
        </nav>

        <AdminSettingsLink className="app-topaction shrink-0" />

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("app-open-palette"))}
          className="app-topaction shrink-0 gap-2"
          title="Jump to a page  (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="hidden rounded border border-white/[0.12] px-1 py-px text-[10px] text-ink-faint sm:inline">⌘K</kbd>
        </button>
        <button type="button" onClick={() => logout()} className="app-topaction shrink-0 hover:text-app-red-text" title="Sign out">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sub-row: the pages inside the current section. Reserved height even
          when empty would leave a dead strip, so it is simply not rendered. */}
      {current ? (
        <nav
          className="flex items-center gap-0.5 overflow-x-auto px-4 pb-1.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={current.label}
        >
          {current.items.map((i) => {
            const Icon = i.icon;
            const on = activeHref === i.href;
            return (
              <Link key={i.href} href={i.href} className={"app-subtab " + (on ? "is-on" : "")}>
                <Icon className="h-3.5 w-3.5" />
                <span>{i.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : (
        <div className="h-2.5" />
      )}
    </header>
  );
}
