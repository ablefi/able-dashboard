"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canSeeSection } from "@/lib/permissions";
import { activeHrefFor, sectionIdForPath, visibleNav } from "@/lib/nav";

/** Permission-filtered, visible page navigation; hover is never required. */
export default function SectionNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const id = sectionIdForPath(pathname);
  const section = visibleNav((key) => canSeeSection(user, key)).find((n) => n.kind === "section" && n.id === id);
  if (!section || section.kind !== "section" || section.items.length < 2) return null;
  const active = activeHrefFor(pathname);
  return (
    <nav aria-label={`${section.label} pages`} className="app-section-nav">
      <span className="app-section-label">{section.label}</span>
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {section.items.map((item) => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} className="app-section-link">{item.label}</Link>)}
      </div>
    </nav>
  );
}
