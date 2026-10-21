"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import StagingBadge from "@/components/StagingBadge";
import { canSeeSection, hasPermission, type AdminSession } from "@/lib/permissions";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { NAV, SECTION_IDS, activeHrefFor, type Section, visibleNav } from "@/lib/nav";
import {
  LogOut,
  LayoutDashboard,
  LayoutGrid,
  Users,
  BookOpen,
  Sparkles,
  Heart,
  Quote,
  Gift,
  Image as ImageIcon,
  Bot,
  Users2,
  Link2,
  Mail,
  MessageSquare,
  UserSearch,
  DollarSign,
  Landmark,
  Receipt,
  Globe,
  Crosshair,
  ShieldCheck,
  BarChart3,
  FileText,
  Star,
  CalendarDays,
  Share2,
  UserMinus,
  BadgeCheck,
  Megaphone,
  Send,
  Bell,
  RectangleHorizontal,
  Smartphone,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";



// Every nav href, used to pick the single best (longest) match for the
// current path so e.g. /referral-codes/analytics highlights Analytics (not
// Codes), while /referral-codes/<id> highlights Codes.

export default function Sidebar({
  collapsed,
  onToggle,
  admin,
}: {
  collapsed: boolean;
  onToggle: () => void;
  admin: AdminSession | null;
}) {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname);
  // Only show sections this role can access (Dashboard home is always shown).
  // No super-admin bypass: the backend does not bypass either, so a section
  // shown on that basis would just 403 when opened.
  const { logout } = useAuth();
  const allowed = (id: string) => canSeeSection(admin, id);
  const shownNav = visibleNav(allowed);
  // collapsed[sectionId] === true means that section is collapsed.
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTION_IDS.map((id) => [id, true])));

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sidebar-sections") || "null");
      if (saved && typeof saved === "object") setSecOpen((prev) => ({ ...prev, ...saved }));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSection = (id: string) =>
    setSecOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("sidebar-sections", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  /**
   * Nav rows.
   *
   * The current page used to be marked with an accent bar down the left edge.
   * That's gone: the icon itself carries the state now, lit in brand blue on a
   * soft tinted plate, which reads faster than a separate mark you have to
   * associate with the row. Hover lifts the whole row a step so nothing feels
   * inert, and idle icons sit close to their labels in weight rather than two
   * steps dimmer, which is what made the rail look switched off.
   */
  const linkClass = (href: string) => {
    const active = activeHref === href;
    return [
      "group relative flex items-center gap-2.5 rounded-lg py-[0.4375rem] text-[0.8125rem] font-medium tracking-[-0.005em]",
      "transition-colors duration-150 ease-out",
      "outline-none focus-visible:ring-2 focus-visible:ring-app-blue-light/50",
      collapsed ? "justify-center px-0" : "px-2.5",
      // No plate, no tinted row — the icon alone carries the state. Anything
      // boxed around the label just competed with it.
      active ? "text-ink" : "text-ink-muted hover:text-ink",
    ].join(" ");
  };

  /** The icon is the only thing that marks the current page. */
  const iconWrapClass = () => "flex h-[1.55rem] w-[1.55rem] shrink-0 items-center justify-center";

  const iconClass = (href: string) =>
    "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors duration-150 " +
    (activeHref === href
      ? "text-app-blue-light drop-shadow-[0_0_7px_rgba(96,165,250,0.75)]"
      : "text-ink-muted group-hover:text-ink");

  return (
    <aside
      className={
        // Its own surface, not a tint of the page. At 40% over the old
        // near-black this was indistinguishable from the content area, so the
        // rail had no edge and the whole screen read as one flat sheet.
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/[0.07] bg-app-navy-light shadow-[1px_0_0_0_rgba(255,255,255,0.02),8px_0_24px_-12px_rgba(0,0,0,0.5)] transition-[width] duration-200 " +
        (collapsed ? "w-[4.25rem]" : "w-64")
      }
    >
      {/* Brand */}
      <div className={"flex items-center gap-2.5 py-5 " + (collapsed ? "justify-center px-0" : "px-5")}>
        <div className="relative">
          <Image src="/icon-200.png" alt={BRAND.name} width={32} height={32} className="rounded-lg" />
          {collapsed && <StagingBadge compact />}
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink">{BRAND.name}</span>
              <StagingBadge />
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">Admin</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {shownNav.map((node, i) => {
          if (node.kind === "item") {
            const Icon = node.icon;
            return (
              <ul key={node.href} className={i === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5"}>
                <li>
                  <Link href={node.href} title={collapsed ? node.label : undefined} className={linkClass(node.href)}>
                    <span className={iconWrapClass()}>
                            <Icon className={iconClass(node.href)} />
                          </span>
                    {!collapsed && <span className="truncate">{node.label}</span>}
                  </Link>
                </li>
              </ul>
            );
          }

          // Section
          const open = secOpen[node.id];
          if (collapsed) {
            // Icon mode: divider + all items as icons (no collapsing).
            return (
              <div key={node.id} className="mt-3">
                <div className="mx-2 mb-2 border-t border-white/[0.06]" />
                <ul className="space-y-0.5">
                  {node.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <li key={it.href}>
                        <Link href={it.href} title={it.label} className={linkClass(it.href)}>
                          <span className={iconWrapClass()}>
                            <Icon className={iconClass(it.href)} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }
          return (
            <div key={node.id} className="mt-4">
              <button
                onClick={() => toggleSection(node.id)}
                className="flex w-full items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink-muted"
              >
                <span className="flex-1 text-left">{node.label}</span>
                <ChevronDown className={"h-3 w-3 transition-transform " + (open ? "" : "-rotate-90")} />
              </button>
              {open && (
                <ul className="space-y-0.5">
                  {node.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <li key={it.href}>
                        <Link href={it.href} className={linkClass(it.href)}>
                          <span className={iconWrapClass()}>
                            <Icon className={iconClass(it.href)} />
                          </span>
                          <span className="truncate">{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer: change own password, Admins (needs admins:read), collapse */}
      <div className="space-y-1 border-t border-white/[0.06] p-3">
        {/* Shared-password sessions (id "local:<email>") have no backend account to change. */}
        {hasPermission(admin, "admins:read") && (
          <Link
            href="/admins"
            title={collapsed ? "Admin Settings" : undefined}
            className={
              "flex w-full items-center gap-2 rounded-lg py-2 text-sm transition-colors " +
              (collapsed ? "justify-center px-0" : "px-2") +
              " " +
              (pathname?.startsWith("/admins") ? "bg-app-blue/15 text-app-blue-light" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")
            }
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Admin Settings</span>}
          </Link>
        )}
        {/* Who you are, and the way out. There was no sign-out control at all
            before, the only way to end a session was to wait 24h or clear
            cookies, which also made "sign in again to pick up new
            permissions" impossible to actually do. */}
        {admin && !collapsed && (
          <div className="truncate px-2 pt-1 text-[11px] text-ink-faint" title={admin.email}>
            {admin.email}
          </div>
        )}
        <button
          onClick={() => logout()}
          title={collapsed ? "Sign out" : undefined}
          className={
            "flex w-full items-center gap-2 rounded-lg py-2 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink " +
            (collapsed ? "justify-center px-0" : "px-2")
          }
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={
            "flex w-full items-center gap-2 rounded-lg py-2 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink " +
            (collapsed ? "justify-center px-0" : "px-2")
          }
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
