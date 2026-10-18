"use client";

import React, { useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/dates";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import dayjs from "dayjs";
import { Plus, Loader2 } from "lucide-react";
import { useReferralCodesApi, ReferralCode } from "../api/referralCodesApi";
import ReferralCodeForm from "../components/ReferralCodeForm";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import RowMenu from "@/components/ui/RowMenu";
import Badge from "@/components/ui/Badge";
import Code from "@/components/ui/Code";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Empty from "@/components/ui/Empty";
import DataTable, { Column, useTablePrefs, ColumnsButton } from "@/components/ui/DataTable";
import BatchBar from "@/components/ui/BatchBar";

const ReferralCodes: React.FC = () => {
  const {
    clearError,
    fetchReferralCodes,
    activateReferralCode,
    deactivateReferralCode,
    deleteReferralCode,
    recoverReferralCode,
    loading,
    error,
    createReferralCode,
    updateReferralCode,
  } = useReferralCodesApi();

  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const { can } = useAuth();
  const canWrite = can("referral-codes:write");
  const [showCreate, setShowCreate] = useState(false);
  const [editReferral, setEditReferral] = useState<ReferralCode | null>(null);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<null | "delete" | "recover">(null);
  const [batchRunning, setBatchRunning] = useState(false);

  /**
   * Deleted codes are a different request. Active and inactive are the SAME
   * one, split in two: the backend returns every live code with an `active`
   * flag on it, so moving between those two tabs must not refetch.
   */
  const isDeleted = activeTab === "deleted";

  const loadReferralCodes = React.useCallback(async () => {
    const res = await fetchReferralCodes(isDeleted);
    if (res) setReferralCodes(res);
  }, [isDeleted, fetchReferralCodes]);

  // Drop any selection when switching tabs: each one is a different set of rows.
  useEffect(() => { setSelected(new Set()); }, [activeTab, query]);

  /**
   * Empty the table while the other dataset loads.
   *
   * Moving between live and deleted refetches, and for the few hundred
   * milliseconds that takes, the rows still in state are the previous set.
   * Without this you get live codes sitting under the Deleted heading, which
   * reads as "these are deleted" when they are not.
   */
  useEffect(() => { setReferralCodes([]); }, [isDeleted]);

  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllSel = (ids: string[], sel: boolean) => setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (sel ? n.add(id) : n.delete(id))); return n; });

  const runBatch = async (kind: "delete" | "recover") => {
    setBatchRunning(true);
    const ids = [...selected];
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const res = kind === "delete" ? await deleteReferralCode(id) : await recoverReferralCode(id);
        res ? ok++ : fail++;
      } catch { fail++; }
    }
    setBatchRunning(false);
    setBatchConfirm(null);
    setSelected(new Set());
    if (ok) toast.success(`${ok} code${ok === 1 ? "" : "s"} ${kind === "delete" ? "deleted" : "recovered"}.`);
    if (fail) toast.error(`${fail} failed.`);
    loadReferralCodes();
  };

  useEffect(() => {
    loadReferralCodes();
  }, [loadReferralCodes]);

  const handleActivate = async (id: string) => { await activateReferralCode(id); loadReferralCodes(); };
  const handleDeactivate = async (id: string) => { await deactivateReferralCode(id); loadReferralCodes(); };
  const handleCreate = async (values: Partial<ReferralCode>) => { const result = await createReferralCode(values); if (result) { setShowCreate(false); toast.success("Referral code created"); loadReferralCodes(); } };
  const handleUpdate = async (values: Partial<ReferralCode>) => {
    if (!editReferral) return;
    const result = await updateReferralCode(editReferral.id, values);
    if (!result) return;
    toast.success("Referral code updated");
    setEditReferral(null);
    loadReferralCodes();
  };
  const handleDelete = async (id: string) => {
    const success = await deleteReferralCode(id);
    if (success) { toast.success("Referral code deleted successfully!"); loadReferralCodes(); }
    else toast.error("Failed to delete referral code");
  };
  const handleRecover = async (id: string) => {
    const recovered = await recoverReferralCode(id);
    if (recovered) { toast.success("Referral code recovered successfully!"); loadReferralCodes(); }
    else toast.error("Failed to recover referral code");
  };

  const live = referralCodes.filter((r) => r.active);
  const dormant = referralCodes.filter((r) => !r.active);
  const shown = (isDeleted ? referralCodes : activeTab === "inactive" ? dormant : live).filter((r) =>
    [r.name, r.code].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))
  );

  const columns: Column<ReferralCode>[] = [
    { key: "name", header: "Name", width: 160, sortValue: (r) => (r.name || "").toLowerCase(), cell: (r) => <span className="font-semibold text-app-blue-light">{r.name}</span> },
    { key: "code", header: "Code", width: 130, sortValue: (r) => (r.code || "").toLowerCase(), cell: (r) => <Code>{r.code}</Code> },
    { key: "description", header: "Description", width: 200, sortValue: (r) => (r.description || "").toLowerCase(), cell: (r) => r.description || <span className="text-ink-faint">-</span> },
    { key: "active", header: "Active", width: 100, sortValue: (r) => (r.active ? 1 : 0), cell: (r) => <Badge variant={r.active ? "success" : "danger"}>{r.active ? "Active" : "Inactive"}</Badge> },
    { key: "bypass", header: "Bypass", width: 90, sortValue: (r) => (r.bypassPaywall ? 1 : 0), cell: (r) => <Badge variant={r.bypassPaywall ? "purple" : "default"}>{r.bypassPaywall ? "Yes" : "No"}</Badge> },
    { key: "duration", header: "Duration", width: 110, sortValue: (r) => r.bypassPaywallDurationDays ?? -1, cell: (r) => (r.bypassPaywallDurationDays != null ? `${r.bypassPaywallDurationDays} days` : <span className="text-ink-faint">-</span>) },
    { key: "expiredAt", header: "Expired At", width: 150, sortValue: (r) => (r.expiredAt ? new Date(r.expiredAt).getTime() : 0), cell: (r) => <span className="num">{r.expiredAt ? fmtDateTime(r.expiredAt) : "-"}</span> },
    { key: "users", header: "Users", width: 90, sortValue: (r) => r.usersCount, cell: (r) => <span className="font-semibold text-ink">{r.usersCount}</span> },
    { key: "subscribed", header: "Subscribed", width: 120, sortValue: (r) => r.subscribedUsersCount, cell: (r) => <Badge variant="success">{r.subscribedUsersCount}</Badge> },
    ...(isDeleted
      ? [{ key: "deletedAt", header: "Deleted At", width: 150, sortValue: (r: ReferralCode) => (r.deletedAt ? new Date(r.deletedAt).getTime() : 0), cell: (r: ReferralCode) => <span className="num">{r.deletedAt ? fmtDateTime(r.deletedAt) : "-"}</span> } as Column<ReferralCode>]
      : []),
    {
      key: "rowActions", // New width for the compact menu; other saved columns stay intact.
      header: "Actions",
      width: 150,
      align: "right",
      clip: false,
      hideable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          {isDeleted ? (
            canWrite && <Button size="sm" onClick={() => handleRecover(r.id)}>Recover</Button>
          ) : (
            <>
              {canWrite && <Button variant="secondary" size="sm" onClick={() => { clearError(); setEditReferral(r); }}>Edit</Button>}
              {canWrite && <RowMenu label={`More actions for ${r.code}`} actions={[
                { label: r.active ? "Deactivate" : "Activate", onClick: () => r.active ? handleDeactivate(r.id) : handleActivate(r.id) },
                { label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
              ]} />}
            </>
          )}
        </div>
      ),
    },
  ];

  const { widths, setWidths, hidden, toggleHidden } = useTablePrefs("referral-codes", columns);

  return (
    <div>
      <PageHeader
        title="Referral Codes"
        subtitle={`${shown.length} ${isDeleted ? "deleted" : activeTab === "inactive" ? "inactive" : "active"} code${shown.length === 1 ? "" : "s"}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "active", label: isDeleted ? "Active" : `Active (${live.length})` },
            { key: "inactive", label: isDeleted ? "Inactive" : `Inactive (${dormant.length})` },
            { key: "deleted", label: isDeleted ? `Deleted (${referralCodes.length})` : "Deleted" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
        <div className="app-toolbar flex flex-wrap items-center gap-2">
          <input type="search" aria-label="Search referral codes" placeholder="Search name or code…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-60 rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-3 py-2 text-sm text-ink" />
          <ColumnsButton columns={columns} hidden={hidden} toggleHidden={toggleHidden} />
          {!isDeleted && (
            <Button size="sm" onClick={() => { clearError(); setShowCreate(true); }}>
              <Plus className="h-3.5 w-3.5" /> New Referral Code
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>
      )}

      <div className="mt-4">
        <BatchBar count={selected.size} onClear={() => setSelected(new Set())}>
          {isDeleted ? (
            canWrite && <Button size="sm" onClick={() => setBatchConfirm("recover")}>Recover selected</Button>
          ) : (
            canWrite && <Button variant="danger" size="sm" onClick={() => setBatchConfirm("delete")}>Delete selected</Button>
          )}
        </BatchBar>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/40">
        {shown.length > 0 && <DataTable onRowClick={canWrite&&!isDeleted?(r)=>{clearError();setEditReferral(r);}:undefined} columns={columns} rows={shown} rowKey={(r) => r.id} hidden={hidden} widths={widths} setWidths={setWidths} selection={{ selectedIds: selected, onToggle: toggleSel, onToggleAll: toggleAllSel }} />}

        {loading && shown.length === 0 && (
          <div className="flex items-center justify-center py-16 text-ink-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading referral codes…</div>
        )}
        {!loading && shown.length === 0 && (
          <div className="p-6">
            <Empty
              title={query.trim() ? "No matching referral codes" : "No referral codes"}
              description={
                query.trim() ? "Try another name or code, or clear the search." : isDeleted ? "No deleted codes."
                : activeTab === "inactive" ? "Nothing is switched off. Deactivated codes land here."
                : 'Click "New Referral Code" to add one.'
              }
            />
          </div>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => !loading && setShowCreate(false)} title="Create Referral Code" size="lg">
        {error && <p role="alert" className="mb-3 text-sm text-app-red-text">{error}</p>}
        <ReferralCodeForm onSubmit={handleCreate} loading={loading} />
      </Modal>

      {/* Edit */}
      <Modal open={!!editReferral} onClose={() => !loading && setEditReferral(null)} title="Edit Referral Code" size="lg">
        {error && <p role="alert" className="mb-3 text-sm text-app-red-text">{error}</p>}
        {editReferral && <ReferralCodeForm initialValues={editReferral} onSubmit={handleUpdate} loading={loading} />}
      </Modal>

      {/* Batch confirm */}
      <Modal
        open={!!batchConfirm}
        onClose={() => !batchRunning && setBatchConfirm(null)}
        title={batchConfirm === "recover" ? `Recover ${selected.size} referral code${selected.size === 1 ? "" : "s"}?` : `Delete ${selected.size} referral code${selected.size === 1 ? "" : "s"}?`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setBatchConfirm(null)} disabled={batchRunning}>Cancel</Button>
            <Button variant={batchConfirm === "recover" ? "primary" : "danger"} size="sm" onClick={() => runBatch(batchConfirm!)} disabled={batchRunning}>
              {batchRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {batchConfirm === "recover" ? "Recover all" : "Delete all"}
            </Button>
          </>
        }
      >
        {batchConfirm === "recover"
          ? "The selected codes will be restored to the active list."
          : "The selected codes will be moved to Deleted. You can recover them from the Deleted tab."}
      </Modal>
    </div>
  );
};

export default ReferralCodes;
