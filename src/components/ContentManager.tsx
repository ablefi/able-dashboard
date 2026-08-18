"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Plus, Loader2, Check, Minus, Copy, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Empty from "@/components/ui/Empty";
import BatchBar from "@/components/ui/BatchBar";
import { cn } from "@/lib/utils";

function CheckBox({ state, onClick }: { state: "on" | "off" | "some"; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={state === "on" ? true : state === "some" ? "mixed" : false}
      className={cn("flex h-4 w-4 items-center justify-center rounded border transition-colors", state === "off" ? "border-white/25 hover:border-white/40" : "border-jp-blue bg-jp-blue text-white")}
    >
      {state === "on" && <Check className="h-3 w-3" />}
      {state === "some" && <Minus className="h-3 w-3" />}
    </button>
  );
}

/** Click-to-copy ID cell — shows the short prefix, copies the full UUID. */
function IdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { try { navigator.clipboard?.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}
      title={`Copy ${id}`}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-60" />}
      {id.slice(0, 8)}
    </button>
  );
}

/** Click-to-copy text cell — copies the full value, with a hover copy icon. */
function CopyText({ value, className }: { value: string | null | undefined; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-ink-faint">-</span>;
  return (
    <button
      type="button"
      onClick={() => { try { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); toast.success("Copied", { autoClose: 900 }); } catch { /* ignore */ } }}
      title="Click to copy"
      className="group/c inline-flex w-full items-start gap-1.5 text-left transition-colors hover:text-jp-blue-light"
    >
      <span className={cn("min-w-0", className)}>{value}</span>
      {copied
        ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
        : <Copy className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/c:opacity-50" />}
    </button>
  );
}

export type ContentField = {
  name: string;
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
};

type Item = { id: string; active?: boolean; [k: string]: any };

export type ContentApi = {
  fetch: (params: { page: number; limit: number }) => Promise<{ results: Item[]; total: number } | null>;
  create: (values: any) => Promise<any>;
  update: (id: string, values: any) => Promise<any>;
  remove: (id: string) => Promise<any>;
  activate: (id: string) => Promise<any>;
  deactivate?: (id: string) => Promise<any>;
  loading: boolean;
  error: string | null;
};

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

/**
 * Generic CRUD manager for the simple content tables (Inspirational
 * Messages / Supplications / Quotes). One component, configured per page
 * with its fields + API. Replaces three near-identical Antd pages.
 */
export default function ContentManager({
  title,
  singular,
  fields,
  api,
}: {
  title: string;
  singular: string;
  fields: ContentField[];
  api: ContentApi;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Export the WHOLE table (not just the page) to CSV. Pulls everything in one
  // big page, builds an RFC-4180-escaped file, and downloads it.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.fetch({ page: 1, limit: 100000 });
      const all = res?.results ?? [];
      if (!all.length) { toast.info("Nothing to export"); return; }
      const cols: { key: string; label: string }[] = [
        { key: "id", label: "ID" },
        ...fields.map((f) => ({ key: f.name, label: f.label })),
        { key: "active", label: "Active" },
        { key: "createdAt", label: "Created At" },
        { key: "updatedAt", label: "Updated At" },
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const cell = (item: Item, key: string) => key === "active" ? (item.active ? "Active" : "Inactive") : item[key];
      const csv = [
        cols.map((c) => esc(c.label)).join(","),
        ...all.map((item) => cols.map((c) => esc(cell(item, c.key))).join(",")),
      ].join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} ${all.length === 1 ? "row" : "rows"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const load = async (p = page, l = limit) => {
    const res = await api.fetch({ page: p, limit: l });
    if (res) {
      setItems(res.results);
      setTotal(res.total);
    }
  };

  useEffect(() => {
    load(page, limit);
    setSelected(new Set()); // selection is scoped to the current page
    // eslint-disable-next-line
  }, [page, limit]);

  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = items.map((it) => it.id);
  const selectedHere = ids.filter((id) => selected.has(id)).length;
  const headState: "on" | "off" | "some" = ids.length === 0 || selectedHere === 0 ? "off" : selectedHere === ids.length ? "on" : "some";
  const toggleAllSel = () => setSelected((prev) => { const n = new Set(prev); const sel = headState !== "on"; ids.forEach((id) => (sel ? n.add(id) : n.delete(id))); return n; });

  const runBatchDelete = async () => {
    setBatchRunning(true);
    const list = [...selected];
    let ok = 0, fail = 0;
    for (const id of list) {
      try { (await api.remove(id)) ? ok++ : fail++; } catch { fail++; }
    }
    setBatchRunning(false);
    setBatchOpen(false);
    setSelected(new Set());
    if (ok) toast.success(`${ok} ${singular.toLowerCase()}${ok === 1 ? "" : "s"} deleted`);
    if (fail) toast.error(`${fail} failed`);
    load(page, limit);
  };

  const openCreate = () => {
    setEditing(null);
    setValues({});
    setModalOpen(true);
  };
  const openEdit = (item: Item) => {
    setEditing(item);
    const v: Record<string, string> = {};
    fields.forEach((f) => (v[f.name] = item[f.name] ?? ""));
    setValues(v);
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = editing ? await api.update(editing.id, values) : await api.create(values);
      if (res) {
        toast.success(editing ? `${singular} updated` : `${singular} created`);
        setModalOpen(false);
        if (editing) load(page, limit);
        else {
          setPage(1);
          load(1, limit);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const ok = await api.remove(deleteId);
    if (ok) {
      toast.success(`${singular} deleted`);
      load(page, limit);
    }
    setDeleteId(null);
  };

  const toggleActive = async (item: Item) => {
    if (item.active && api.deactivate) {
      const res = await api.deactivate(item.id);
      if (res) {
        toast.success(`${singular} deactivated`);
        load(page, limit);
      }
    } else {
      const res = await api.activate(item.id);
      if (res) {
        toast.success(`${singular} activated`);
        load(page, limit);
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`${total.toLocaleString()} item${total === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              New {singular}
            </Button>
          </div>
        }
      />

      {api.error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
          {api.error}
        </div>
      )}

      <BatchBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="danger" size="sm" onClick={() => setBatchOpen(true)}>Delete selected</Button>
      </BatchBar>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                <th className="w-11 px-4 py-3"><CheckBox state={headState} onClick={toggleAllSel} /></th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">ID</th>
                {fields.map((f) => (
                  <th key={f.name} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Active</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={cn("border-b border-white/[0.04] align-top text-ink-muted transition-colors hover:bg-white/[0.02]", selected.has(item.id) && "bg-jp-blue/[0.06]")}>
                  <td className="px-4 py-3"><CheckBox state={selected.has(item.id) ? "on" : "off"} onClick={() => toggleSel(item.id)} /></td>
                  <td className="px-4 py-3"><IdCell id={item.id} /></td>
                  {fields.map((f) => (
                    <td key={f.name} className={"px-4 py-3 " + (f.type === "textarea" ? "max-w-md" : "")}>
                      <CopyText value={item[f.name]} className={cn(f.name === fields[0].name && "font-medium text-ink", f.type === "textarea" && "whitespace-pre-line")} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <Badge variant={item.active ? "success" : "danger"}>{item.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                      <Button variant={item.active && api.deactivate ? "warning" : "primary"} size="sm" onClick={() => toggleActive(item)}>
                        {item.active && api.deactivate ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteId(item.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {api.loading && items.length === 0 && (
          <div className="flex items-center justify-center py-16 text-ink-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        )}
        {!api.loading && items.length === 0 && (
          <div className="p-6">
            <Empty title={`No ${title.toLowerCase()} yet`} description={`Click "New ${singular}" to add one.`} />
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-sm">
            <div className="text-ink-faint">Page {page} of {totalPages} · {total.toLocaleString()} total</div>
            <div className="flex items-center gap-2">
              <label className="text-ink-faint">Per page</label>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-white/[0.08] bg-jp-navy-card/50 px-2 py-1 text-xs text-ink focus:border-jp-blue/45 focus:outline-none"
              >
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${editing ? "Edit" : "New"} ${singular}`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={(e) => submit(e as any)} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className={labelCls}>
                {f.label}
                {f.required && <span className="text-rose-400"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  className={inputCls}
                  rows={4}
                  value={values[f.name] || ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              ) : (
                <input
                  className={inputCls}
                  value={values[f.name] || ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              )}
            </div>
          ))}
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={`Delete this ${singular.toLowerCase()}?`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        This action cannot be undone.
      </Modal>

      {/* Batch delete confirm */}
      <Modal
        open={batchOpen}
        onClose={() => !batchRunning && setBatchOpen(false)}
        title={`Delete ${selected.size} ${singular.toLowerCase()}${selected.size === 1 ? "" : "s"}?`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setBatchOpen(false)} disabled={batchRunning}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={runBatchDelete} disabled={batchRunning}>
              {batchRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete all
            </Button>
          </>
        }
      >
        This permanently deletes the selected items. This action cannot be undone.
      </Modal>
    </div>
  );
}
