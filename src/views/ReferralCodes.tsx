"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import dayjs from "dayjs";
import { Plus, Loader2 } from "lucide-react";
import { useReferralCodesApi, ReferralCode } from "../api/referralCodesApi";
import ReferralCodeForm from "../components/ReferralCodeForm";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Empty from "@/components/ui/Empty";
import DataTable, { Column, useTablePrefs, ColumnsButton } from "@/components/ui/DataTable";
import BatchBar from "@/components/ui/BatchBar";

const ReferralCodes: React.FC = () => {
  const {
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
  const [showCreate, setShowCreate] = useState(false);
  const [editReferral, setEditReferral] = useState<ReferralCode | null>(null);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<null | "delete" | "recover">(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const loadReferralCodes = React.useCallback(async () => {
    const res = await fetchReferralCodes(activeTab === "deleted");
    if (res) setReferralCodes(res);
  }, [activeTab, fetchReferralCodes]);

  // Drop any selection when switching tabs (active ↔ deleted are different sets).
  useEffect(() => { setSelected(new Set()); }, [activeTab]);

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
  const handleCreate = async (values: Partial<ReferralCode>) => { await createReferralCode(values); setShowCreate(false); loadReferralCodes(); };
  const handleUpdate = async (values: Partial<ReferralCode>) => {
    if (!editReferral) return;
    await updateReferralCode(editReferral.id, values);
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

  const isDeleted = activeTab === "deleted";

  const columns: Column<ReferralCode>[] = [
    { key: "name", header: "Name", width: 160, sortValue: (r) => (r.name || "").toLowerCase(), cell: (r) => <span className="font-semibold text-jp-blue-light">{r.name}</span> },
    { key: "code", header: "Code", width: 130, sortValue: (r) => (r.code || "").toLowerCase(), cell: (r) => <Badge variant="info">{r.code}</Badge> },
    { key: "description", header: "Description", width: 200, sortValue: (r) => (r.description || "").toLowerCase(), cell: (r) => r.description || <span className="text-ink-faint">-</span> },
    { key: "active", header: "Active", width: 100, sortValue: (r) => (r.active ? 1 : 0), cell: (r) => <Badge variant={r.active ? "success" : "danger"}>{r.active ? "Active" : "Inactive"}</Badge> },
    { key: "bypass", header: "Bypass", width: 90, sortValue: (r) => (r.bypassPaywall ? 1 : 0), cell: (r) => <Badge variant={r.bypassPaywall ? "purple" : "default"}>{r.bypassPaywall ? "Yes" : "No"}</Badge> },
    { key: "duration", header: "Duration", width: 110, sortValue: (r) => r.bypassPaywallDurationDays ?? -1, cell: (r) => (r.bypassPaywallDurationDays != null ? `${r.bypassPaywallDurationDays} days` : <span className="text-ink-faint">—</span>) },
    { key: "expiredAt", header: "Expired At", width: 150, sortValue: (r) => (r.expiredAt ? new Date(r.expiredAt).getTime() : 0), cell: (r) => <span className="num">{r.expiredAt ? dayjs(r.expiredAt).format("DD/MM/YYYY HH:mm") : "-"}</span> },
    { key: "users", header: "Users", width: 90, sortValue: (r) => r.usersCount, cell: (r) => <span className="font-semibold text-ink">{r.usersCount}</span> },
    { key: "subscribed", header: "Subscribed", width: 120, sortValue: (r) => r.subscribedUsersCount, cell: (r) => <Badge variant="success">{r.subscribedUsersCount}</Badge> },
    ...(isDeleted
      ? [{ key: "deletedAt", header: "Deleted At", width: 150, sortValue: (r: ReferralCode) => (r.deletedAt ? new Date(r.deletedAt).getTime() : 0), cell: (r: ReferralCode) => <span className="num">{r.deletedAt ? dayjs(r.deletedAt).format("DD/MM/YYYY HH:mm") : "-"}</span> } as Column<ReferralCode>]
      : []),
    {
      key: "actions",
      header: "Actions",
      width: 280,
      align: "right",
      clip: false,
      hideable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          {isDeleted ? (
            <Button size="sm" onClick={() => handleRecover(r.id)}>Recover</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditReferral(r)}>Edit</Button>
              {r.active ? (
                <Button variant="warning" size="sm" onClick={() => handleDeactivate(r.id)}>Deactivate</Button>
              ) : (
                <Button size="sm" onClick={() => handleActivate(r.id)}>Activate</Button>
              )}
              <Button variant="danger" size="sm" onClick={() => handleDelete(r.id)}>Delete</Button>
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
        subtitle={`${referralCodes.length} ${isDeleted ? "deleted" : "active"} code${referralCodes.length === 1 ? "" : "s"}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "active", label: "Active Referral Codes" },
            { key: "deleted", label: "Deleted Referral Codes" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
        <div className="flex items-center gap-2">
          <ColumnsButton columns={columns} hidden={hidden} toggleHidden={toggleHidden} />
          {!isDeleted && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> New Referral Code
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>
      )}

      <div className="mt-4">
        <BatchBar count={selected.size} onClear={() => setSelected(new Set())}>
          {isDeleted ? (
            <Button size="sm" onClick={() => setBatchConfirm("recover")}>Recover selected</Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setBatchConfirm("delete")}>Delete selected</Button>
          )}
        </BatchBar>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40">
        {referralCodes.length > 0 && <DataTable columns={columns} rows={referralCodes} rowKey={(r) => r.id} hidden={hidden} widths={widths} setWidths={setWidths} selection={{ selectedIds: selected, onToggle: toggleSel, onToggleAll: toggleAllSel }} />}

        {loading && referralCodes.length === 0 && (
          <div className="flex items-center justify-center py-16 text-ink-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading referral codes…</div>
        )}
        {!loading && referralCodes.length === 0 && (
          <div className="p-6"><Empty title="No referral codes" description={isDeleted ? "No deleted codes." : 'Click "New Referral Code" to add one.'} /></div>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Referral Code" size="lg">
        <ReferralCodeForm onSubmit={handleCreate} loading={loading} />
      </Modal>

      {/* Edit */}
      <Modal open={!!editReferral} onClose={() => setEditReferral(null)} title="Edit Referral Code" size="lg">
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
