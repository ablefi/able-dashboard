"use client";

import { useMemo, useState } from "react";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { Check, Search, X } from "lucide-react";
import { groupPermissions, type PermissionRow } from "@/api/adminsApi";

/**
 * Picking an admin's permissions.
 *
 * The old version was a 288px scroll box of native checkboxes inside a 576px
 * modal, holding 42 permissions across 23 resource groups. You could see about
 * six at a time, a granted one was a 14px browser checkbox, and finding a
 * specific key meant scrolling and reading.
 *
 * What changes here:
 *  - the catalogue is laid out three columns wide in a much bigger modal, so
 *    scanning replaces scrolling;
 *  - a granted permission is a filled, outlined card with a check, legible at
 *    a glance rather than a tick box you have to look for;
 *  - every group header carries "n of m" and toggles the whole group, because
 *    that is how access is actually granted: someone gets creators, or they
 *    do not;
 *  - search, because with 42 keys the fastest route to one is typing it.
 */
export function PermissionPicker({
  catalog,
  selected,
  onToggle,
  onSetMany,
}: {
  catalog: PermissionRow[];
  selected: string[];
  onToggle: (key: string) => void;
  /** Grant or revoke a whole group at once. */
  onSetMany: (keys: string[], grant: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = groupPermissions(catalog);
    if (!q) return all;
    return all
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (p) => p.key.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) ||
            Object.values(PERMISSION_GROUPS[g.resource] ?? {}).some((label) => label.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.rows.length > 0);
  }, [catalog, query]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions"
            className="w-full rounded-lg border border-white/[0.1] bg-app-navy-light/40 py-1.5 pl-8 pr-7 text-[13px] text-ink placeholder:text-ink-faint focus:border-app-blue/40 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-ink-muted">
            <span className="num font-semibold text-app-blue-light">{selected.length}</span> granted
            {query && <span className="text-ink-faint"> · {shown} shown</span>}
          </span>
          {selected.length > 0 && (
            <button
              onClick={() => onSetMany(selected, false)}
              className="rounded-md border border-white/[0.1] px-2 py-0.5 font-medium text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">Nothing matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const keys = g.rows.map((p) => p.key);
            const on = keys.filter((k) => chosen.has(k)).length;
            const allOn = on === keys.length;
            return (
              <div key={g.resource}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    {PERMISSION_GROUPS[g.resource]?.label ?? g.resource.replace(/-/g, " ")}
                  </span>
                  <button
                    onClick={() => onSetMany(keys, !allOn)}
                    className="shrink-0 text-[11px] font-medium text-ink-faint transition-colors hover:text-app-blue-light"
                  >
                    <span className={on > 0 ? "num text-app-blue-light" : "num"}>{on}</span>
                    <span className="num"> of {keys.length}</span>
                    <span className="ml-1.5 opacity-70">{allOn ? "Clear" : "All"}</span>
                  </button>
                </div>
                {PERMISSION_GROUPS[g.resource] && <p className="mb-2 text-xs text-ink-faint">{PERMISSION_GROUPS[g.resource].pages}</p>}
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.rows.map((p) => {
                    const isOn = chosen.has(p.key);
                    // The action verb is the useful half of the key; the
                    // resource is already the heading above this grid.
                    const action = p.key.includes(":") ? p.key.split(":").slice(1).join(":") : p.key;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onToggle(p.key)}
                        aria-pressed={isOn}
                        title={p.key}
                        className={
                          "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors " +
                          (isOn
                            ? "border-app-blue/45 bg-app-blue/[0.12]"
                            : "border-white/[0.07] bg-app-navy-card/30 hover:border-white/[0.16] hover:bg-white/[0.03]")
                        }
                      >
                        <span
                          className={
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                            (isOn ? "border-app-blue bg-app-blue text-white" : "border-white/25")
                          }
                        >
                          {isOn && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className={"block truncate font-mono text-[12px] " + (isOn ? "text-ink" : "text-ink-muted")}>
                            {({ read: "View", write: "Edit", delete: "Delete", send: "Send" } as Record<string, string>)[action] ?? action}
                          </span>
                          {p.description && (
                            <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{p.description}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
