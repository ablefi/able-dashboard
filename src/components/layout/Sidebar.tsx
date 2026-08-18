"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
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
  Video,
  UserSearch,
  DollarSign,
  Landmark,
  Receipt,
  Globe,
  Crosshair,
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
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

type Item = { href: string; label: string; icon: typeof Users };
type TopItem = Item & { kind: "item"; exact?: boolean };
type Section = { kind: "section"; id: string; label: string; icon: typeof Users; items: Item[] };
type Node = TopItem | Section;

const NAV: Node[] = [
  { kind: "item", href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    kind: "section",
    id: "users",
    label: "Users",
    icon: Users,
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/user-analysis", label: "User Analysis", icon: BarChart3 },
    ],
  },
  {
    kind: "section",
    id: "financials",
    label: "Revenue",
    icon: DollarSign,
    items: [
      { href: "/revenue", label: "Revenue Analytics", icon: BarChart3 },
    ],
  },
  {
    kind: "section",
    id: "creators",
    label: "Creators",
    icon: Users2,
    items: [
      { href: "/creators", label: "Roster", icon: Users2 },
      { href: "/creators/posts", label: "Posts", icon: FileText },
      { href: "/creators/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/creators/performance", label: "Performance", icon: BarChart3 },
      { href: "/creators/performance-all", label: "GCP", icon: BadgeCheck },
      { href: "/creators/outliers", label: "Outliers", icon: Star },
    ],
  },
  {
    kind: "section",
    id: "referral",
    label: "Referral Codes",
    icon: Gift,
    items: [
      { href: "/referral-codes", label: "Codes", icon: Gift },
      { href: "/referral-codes/analytics", label: "Code Analytics", icon: BarChart3 },
    ],
  },
  {
    kind: "section",
    id: "content",
    label: "Content",
    icon: FileText,
    items: [
      { href: "/content/own-posts", label: "Our Posts", icon: LayoutGrid },
    ],
  },
  {
    kind: "section",
    id: "social",
    label: "Social",
    icon: Share2,
    items: [
      { href: "/links", label: "Links", icon: Link2 },
      { href: "/website", label: "Website Analytics", icon: Globe },
    ],
  },
  {
    kind: "section",
    id: "research",
    label: "Research",
    icon: Crosshair,
    items: [
      { href: "/competitors", label: "Competitors", icon: Crosshair },
      { href: "/prospects", label: "Prospects", icon: UserSearch },
    ],
  },
];

// Every nav href, used to pick the single best (longest) match for the
// current path so e.g. /referral-codes/analytics highlights Analytics (not
// Codes), while /referral-codes/<id> highlights Codes.
const ALL_HREFS = NAV.flatMap((n) => (n.kind === "item" ? [n.href] : n.items.map((i) => i.href)));

function useActiveHref(pathname: string | null): string {
  if (!pathname) return "";
  let best = "";
  for (const href of ALL_HREFS) {
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    if (matches && href.length > best.length) best = href;
  }
  return best;
}

const SECTION_IDS = NAV.filter((n): n is Section => n.kind === "section").map((s) => s.id);

export default function Sidebar({
  collapsed,
  onToggle,
  sections,
  isOwner,
}: {
  collapsed: boolean;
  onToggle: () => void;
  sections: string[];
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const activeHref = useActiveHref(pathname);
  // Only show sections this role can access (Dashboard home is always shown).
  const allowed = (id: string) => isOwner || sections.includes(id);
  const visibleNav = NAV.filter((n) => (n.kind === "item" ? true : allowed(n.id)));
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

  const linkClass = (href: string) =>
    "group flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors " +
    (collapsed ? "justify-center px-0" : "px-3") +
    " " +
    (activeHref === href ? "bg-jp-blue/15 text-jp-blue-light" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink");

  const iconClass = (href: string) =>
    "h-4 w-4 shrink-0 " + (activeHref === href ? "text-jp-blue-light" : "text-ink-faint group-hover:text-ink-muted");

  return (
    <aside
      className={
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/[0.06] bg-jp-navy-light/40 backdrop-blur-sm transition-[width] duration-200 " +
        (collapsed ? "w-[4.25rem]" : "w-64")
      }
    >
      {/* Brand */}
      <div className={"flex items-center gap-2.5 py-5 " + (collapsed ? "justify-center px-0" : "px-5")}>
        <Image src="/icon-200.png" alt="Just Pray" width={32} height={32} className="rounded-lg" />
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">Just Pray</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">Admin</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {visibleNav.map((node, i) => {
          if (node.kind === "item") {
            const Icon = node.icon;
            return (
              <ul key={node.href} className={i === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5"}>
                <li>
                  <Link href={node.href} title={collapsed ? node.label : undefined} className={linkClass(node.href)}>
                    <Icon className={iconClass(node.href)} />
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
                          <Icon className={iconClass(it.href)} />
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
                className="flex w-full items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint/70 transition-colors hover:text-ink-muted"
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
                          <Icon className={iconClass(it.href)} />
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

      {/* Footer: collapse toggle */}
      <div className="space-y-1 border-t border-white/[0.06] p-3">
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
