"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, Columns3, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selection wiring for DataTable's optional checkbox column. */
export type TableSelection = {
  selectedIds: Set<string>;
  /** Toggle a single row. */
  onToggle: (id: string) => void;
  /** Bulk set every id in `ids` to selected (true) or unselected (false). */
  onToggleAll: (ids: string[], selected: boolean) => void;
};

/** Small square checkbox matching the Columns picker style. */
function CheckBox({ state, onClick }: { state: "on" | "off" | "some"; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={state === "on" ? true : state === "some" ? "mixed" : false}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
        state === "off" ? "border-white/25 hover:border-white/40" : "border-jp-blue bg-jp-blue text-white",
      )}
    >
      {state === "on" && <Check className="h-3 w-3" />}
      {state === "some" && <Minus className="h-3 w-3" />}
    </button>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  /** Initial column width (px). Default 150. */
  width?: number;
  align?: "left" | "right";
  /** false = don't clip/truncate cell content (e.g. an actions column). */
  clip?: boolean;
  /** false = column can't be hidden from the column picker. */
  hideable?: boolean;
};

const loadLS = (k: string) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
};
const saveLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

/**
 * Per-table preferences (hidden columns + column widths), persisted to
 * localStorage under `storageKey`. Lives in the page so the Columns picker
 * can be placed in the page toolbar (next to Filters / Export) while the
 * DataTable consumes the same state.
 */
export function useTablePrefs<T>(storageKey: string, columns: Column<T>[]) {
  const wKey = `dt:${storageKey}:widths`;
  const hKey = `dt:${storageKey}:hidden`;
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const base = Object.fromEntries(columns.map((c) => [c.key, c.width ?? 150]));
    if (typeof window !== "undefined") {
      const saved = loadLS(wKey);
      if (saved && typeof saved === "object") return { ...base, ...saved };
    }
    return base;
  });
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = loadLS(hKey);
      if (Array.isArray(saved)) return new Set(saved);
    }
    return new Set();
  });
  useEffect(() => {
    saveLS(wKey, widths);
  }, [widths, wKey]);
  useEffect(() => {
    saveLS(hKey, [...hidden]);
  }, [hidden, hKey]);
  const toggleHidden = (key: string) =>
    setHidden((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  return { widths, setWidths, hidden, toggleHidden };
}

/** Columns show/hide dropdown — render in the page toolbar. */
export function ColumnsButton<T>({
  columns,
  hidden,
  toggleHidden,
}: {
  columns: Column<T>[];
  hidden: Set<string>;
  toggleHidden: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleCount = columns.filter((c) => c.hideable !== false && !hidden.has(c.key)).length;
  const total = columns.filter((c) => c.hideable !== false).length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-ink transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
        {hidden.size > 0 && <span className="rounded-full bg-jp-blue/20 px-1.5 text-[10px] text-jp-blue-light">{visibleCount}/{total}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border border-white/[0.1] bg-jp-navy-card p-1.5 shadow-2xl shadow-black/50">
            {columns.map((c) => {
              if (c.hideable === false) return null;
              const visible = !hidden.has(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => toggleHidden(c.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
                >
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded border", visible ? "border-jp-blue bg-jp-blue text-white" : "border-white/20")}>
                    {visible && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{c.header || c.key}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Reusable table: click-to-sort + drag-to-resize. Visibility + widths are
 * controlled via useTablePrefs (passed in) so the Columns picker can live in
 * the page toolbar.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  hidden,
  widths,
  setWidths,
  defaultSort,
  onRowClick,
  className,
  selection,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  hidden: Set<string>;
  widths: Record<string, number>;
  setWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  className?: string;
  /** Pass to render a leading checkbox column with select-all. */
  selection?: TableSelection;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);
  const widthOf = (c: Column<T>) => widths[c.key] ?? c.width ?? 150;

  const onResizeStart = (e: React.MouseEvent, key: string, current: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key, startX: e.clientX, startW: current };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.max(60, resizing.current.startW + (ev.clientX - resizing.current.startX));
      setWidths((prev) => ({ ...prev, [resizing.current!.key]: w }));
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  };

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, columns]);

  const SEL_W = 44;
  const totalWidth = visibleColumns.reduce((s, c) => s + widthOf(c), 0) + (selection ? SEL_W : 0);

  // Select-all state is scoped to the currently-rendered (sorted) rows.
  const rowIds = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const selectedHere = selection ? rowIds.filter((id) => selection.selectedIds.has(id)).length : 0;
  const headState: "on" | "off" | "some" =
    !selection || rowIds.length === 0 || selectedHere === 0 ? "off" : selectedHere === rowIds.length ? "on" : "some";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
        <colgroup>
          {selection && <col style={{ width: SEL_W }} />}
          {visibleColumns.map((c) => (
            <col key={c.key} style={{ width: widthOf(c) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-white/[0.06] text-left">
            {selection && (
              <th className="px-4 py-3">
                <CheckBox state={headState} onClick={() => selection.onToggleAll(rowIds, headState !== "on")} />
              </th>
            )}
            {visibleColumns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className="relative select-none px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <div
                    className={cn("flex items-center gap-1", c.align === "right" && "justify-end", c.sortValue && "cursor-pointer hover:text-ink-muted")}
                    onClick={() => toggleSort(c)}
                  >
                    <span className="truncate">{c.header}</span>
                    {c.sortValue &&
                      (active ? (
                        sort!.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                      ))}
                  </div>
                  <div onMouseDown={(e) => onResizeStart(e, c.key, widthOf(c))} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-jp-blue/40" />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* No row dividers and no hover highlight — Adam wants the rows clean. */}
          {sorted.map((row, i) => {
            const id = rowKey(row);
            return (
            <tr
              key={id}
              className={cn("text-ink-muted", onRowClick && "cursor-pointer", selection?.selectedIds.has(id) && "bg-jp-blue/[0.06]")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {selection && (
                <td className="px-4 py-3 align-middle">
                  <CheckBox state={selection.selectedIds.has(id) ? "on" : "off"} onClick={(e) => { e.stopPropagation(); selection.onToggle(id); }} />
                </td>
              )}
              {visibleColumns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "right" && "text-right", c.clip === false ? "whitespace-nowrap" : "truncate")}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
