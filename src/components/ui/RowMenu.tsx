"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type RowAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
};

/** Native popovers live above table overflow while retaining the page theme.
 * Keep frequent actions outside; this menu holds secondary row operations. */
export default function RowMenu({ actions, label = "More actions" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      menu.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!actions.length) return null;
  const show = (last = false) => {
    const button = trigger.current, panel = menu.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    panel.showPopover();
    panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, rect.bottom + panel.offsetHeight + 4 > window.innerHeight ? rect.top - panel.offsetHeight - 4 : rect.bottom + 4)}px`;
    const items = panel.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
  };

  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <button ref={trigger} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={(e) => { e.preventDefault(); menu.current?.matches(":popover-open") ? menu.current.hidePopover() : show(); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(e.key === "ArrowUp"); } }}
        className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue-light">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <div ref={menu} id={id} popover="auto" role="menu" aria-label={label}
        onToggle={(e) => setOpen((e.nativeEvent as ToggleEvent).newState === "open")}
        style={{ position: "fixed", margin: 0, right: "auto", bottom: "auto", maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100vh - 16px)" }}
        onKeyDown={(e) => {
          const panel = menu.current;
          if (!panel) return;
          const items = Array.from(panel.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          } else if (e.key === "Escape" || e.key === "Tab") {
            if (e.key === "Escape") e.preventDefault();
            panel.hidePopover(); trigger.current?.focus({ preventScroll: true });
          }
        }}
        className="w-56 overflow-auto rounded-xl border border-white/[0.1] bg-app-navy-card py-1 text-ink shadow-2xl shadow-black/50">
        {actions.map((action) => {
          const Icon = action.icon;
          return <button key={action.label} role="menuitem" tabIndex={-1} type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); action.onClick(); }}
            className={cn("flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors", action.danger ? "text-app-red-text hover:bg-app-red/10 focus:bg-app-red/10" : "text-ink-muted hover:bg-white/[0.06] focus:bg-white/[0.06] focus:text-ink")}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}{action.label}
          </button>;
        })}
      </div>
    </div>
  );
}
