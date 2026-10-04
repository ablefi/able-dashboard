"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Users2, Gift, Landmark, Crosshair, MoreHorizontal,
  FileText, CalendarDays, BarChart3, BadgeCheck, Star, Globe, UserSearch, Link2, LayoutGrid,
  type LucideIcon,
} from "lucide-react";

type Page = { href: string; label: string; icon: LucideIcon };
type Section = { id: string; label: string; icon: LucideIcon; pages: Page[] };

// Only existing dashboard routes belong here. Product Ops and compliance live
// in the separate core app, not this marketing dashboard.
const SECTIONS: Section[] = [
  { id: "creators", label: "Creators", icon: Users2, pages: [
    { href: "/creators", label: "Roster", icon: Users2 },
    { href: "/creators/posts", label: "Posts", icon: FileText },
    { href: "/creators/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/creators/performance", label: "Performance", icon: BarChart3 },
    { href: "/creators/performance-all", label: "GCP", icon: BadgeCheck },
    { href: "/creators/outliers", label: "Outliers", icon: Star },
    { href: "/content/own-posts", label: "Our posts", icon: LayoutGrid },
  ] },
  { id: "users", label: "Users", icon: Users, pages: [
    { href: "/users", label: "Users", icon: Users },
    { href: "/user-analysis", label: "User analysis", icon: BarChart3 },
  ] },
  { id: "codes", label: "Codes", icon: Gift, pages: [
    { href: "/referral-codes", label: "Referral codes", icon: Gift },
    { href: "/referral-codes/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { id: "finances", label: "Finances", icon: Landmark, pages: [
    { href: "/revenue", label: "Revenue", icon: BarChart3 },
  ] },
  { id: "growth", label: "Growth", icon: Crosshair, pages: [
    { href: "/website", label: "Website", icon: Globe },
    { href: "/competitors", label: "Competitors", icon: Crosshair },
    { href: "/prospects", label: "Prospects", icon: UserSearch },
  ] },
  { id: "more", label: "More", icon: MoreHorizontal, pages: [
    { href: "/links", label: "Links", icon: Link2 },
  ] },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const page = SECTIONS.flatMap((section) => section.pages)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const activeSection = SECTIONS.find((section) => section.pages.some((item) => item.href === page?.href))?.id;
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = () => { clearTimer(); setOpen(null); };
  const hover = (id: string | null) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    clearTimer();
    timer.current = setTimeout(() => setOpen(id), id ? 110 : 220);
  };
  useEffect(() => { clearTimer(); setOpen(null); }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!bar.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const trigger = bar.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]');
      close();
      trigger?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { clearTimer(); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);

  return (
    <nav ref={bar} className="able-tabbar" aria-label="Main navigation">
      <Link href="/" className={"able-tab " + (pathname === "/" ? "is-on" : "")} aria-current={pathname === "/" ? "page" : undefined} onClick={close}>
        <LayoutDashboard aria-hidden="true" /><span>Overview</span>
      </Link>
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const expanded = open === section.id;
        return (
          <div key={section.id} className="able-nav-group" onPointerEnter={(event) => { if (event.pointerType === "mouse") hover(section.id); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") hover(null); }}>
            {expanded && (
              <div id={"nav-" + section.id} className="able-nav-sheet" onPointerEnter={clearTimer}>
                <p>{section.label}</p>
                <div className="able-nav-grid">
                  {section.pages.map((item) => {
                    const PageIcon = item.icon;
                    return <Link key={item.href} href={item.href} onClick={close} aria-current={page?.href === item.href ? "page" : undefined}>
                      <PageIcon aria-hidden="true" /><span>{item.label}</span>
                    </Link>;
                  })}
                </div>
              </div>
            )}
            <Link href={section.pages[0].href} onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                event.preventDefault(); clearTimer(); setOpen(expanded ? null : section.id);
              } else close();
            }} className={"able-tab " + (activeSection === section.id ? "is-on" : expanded ? "is-open" : "")} aria-current={activeSection === section.id ? "true" : undefined}>
              <Icon aria-hidden="true" /><span>{section.label}</span>
            </Link>
            <button type="button" className="able-nav-disclosure" aria-label={"Show " + section.label + " pages"} aria-expanded={expanded} aria-controls={expanded ? "nav-" + section.id : undefined} onClick={() => { clearTimer(); setOpen(expanded ? null : section.id); }}>⌃</button>
          </div>
        );
      })}
    </nav>
  );
}
