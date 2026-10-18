"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, KeyRound, Loader2, Lock, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { PermissionPicker } from "@/components/admins/PermissionPicker";
import Tabs from "@/components/ui/Tabs";
import Empty from "@/components/ui/Empty";
import { useAuth } from "@/context/AuthContext";
import { useAdminsApi, groupPermissions, type AdminAccount, type PermissionRow } from "@/api/adminsApi";
import { REQUIRED_DASHBOARD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";

const inputCls =
  "w-full rounded-lg border border-white/[0.12] bg-app-navy-card/60 px-3 py-2 font-sans text-sm text-ink outline-none placeholder:text-ink-faint focus:border-app-blue/50";

/**
 * Admins and the permission catalog.
 *
 * These are the backend's real admin accounts. Everything here mirrors rules
 * the backend already enforces — the super admin row can't be edited or
 * deleted, system permissions can't be renamed or removed, and passwords are
 * never sent on a PATCH. The UI blocks them so you get an explanation instead
 * of a 403, but the backend is what actually holds the line.
 */
export default function Admins() {
  const { user, can, refresh } = useAuth();
  const api = useAdminsApi();
  const { listAdmins, listPermissions, lastError } = api;

  const [tab, setTab] = useState("admins");
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [catalog, setCatalog] = useState<PermissionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const canWrite = can("admins:write");
  const canDelete = can("admins:delete");
  const isSuper = !!user?.isSuperAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    const [a, p] = await Promise.all([listAdmins(), listPermissions()]);
    setAdmins(a);
    setCatalog(p);
    setLoading(false);
  }, [listAdmins, listPermissions]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- admin create / edit -------------------------------------------------
  const [editing, setEditing] = useState<
    | { mode: "create"; email: string; password: string; isActive: boolean; permissions: string[] }
    | { mode: "edit"; id: string; email: string; isActive: boolean; permissions: string[] }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminAccount | null>(null);
  const [resetting, setResetting] = useState<{ admin: AdminAccount; password: string } | null>(null);

  const grouped = useMemo(() => groupPermissions(catalog ?? []), [catalog]);

  /**
   * Permission keys used by dashboard pages that this backend does not have yet.
   *
   * Each environment has its own catalog, so keys created on staging do not
   * exist on production. A section gated on a missing key is invisible to
   * everyone, including a super admin — which is exactly how Financials went
   * missing from production. Surfacing it here beats retyping ten keys.
   */
  const missingPermissions = useMemo(() => {
    if (!catalog) return [];
    const have = new Set(catalog.map((p) => p.key));
    return REQUIRED_DASHBOARD_PERMISSIONS.filter((p) => !have.has(p.key));
  }, [catalog]);
  const [creatingMissing, setCreatingMissing] = useState(false);

  const createMissing = async () => {
    setCreatingMissing(true);
    let made = 0;
    for (const p of missingPermissions) {
      const res = await api.createPermission(p.key, p.description);
      if (res) made++;
    }
    setCreatingMissing(false);
    if (!made) {
      toast.error(lastError() ?? "Couldn't create the permissions");
      return;
    }
    // Grants land on the backend immediately, but our session cached the old
    // list at sign-in — without this the new sections stay hidden and it looks
    // like nothing happened.
    await refresh();
    toast.success(`Created ${made} permission${made === 1 ? "" : "s"}. Your access has been refreshed.`);
    load();
  };


  /** Grant or revoke a whole resource group in one go. */
  const setManyPermissions = (keys: string[], grant: boolean) => {
    if (!editing) return;
    const next = new Set(editing.permissions);
    for (const k of keys) grant ? next.add(k) : next.delete(k);
    setEditing({ ...editing, permissions: [...next] });
  };

  const togglePermission = (key: string) => {
    if (!editing) return;
    const has = editing.permissions.includes(key);
    setEditing({
      ...editing,
      permissions: has ? editing.permissions.filter((k) => k !== key) : [...editing.permissions, key],
    });
  };

  const saveAdmin = async () => {
    if (!editing) return;
    if (!editing.email.trim()) return toast.error("Email is required");
    if (editing.mode === "create" && editing.password.length < 8) {
      return toast.error("Password must be at least 8 characters");
    }
    setSaving(true);
    const res =
      editing.mode === "create"
        ? await api.createAdmin({
            email: editing.email.trim(),
            password: editing.password,
            isActive: editing.isActive,
            permissions: editing.permissions,
          })
        : // Never send a password on PATCH, separate endpoints handle that.
          await api.updateAdmin(editing.id, {
            email: editing.email.trim(),
            isActive: editing.isActive,
            permissions: editing.permissions,
          });
    setSaving(false);
    if (!res) return toast.error(lastError() ?? "Couldn't save");
    toast.success(editing.mode === "create" ? "Admin created" : "Admin updated");
    setEditing(null);
    load();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const ok = await api.deleteAdmin(confirmDelete.id);
    if (!ok) return toast.error(lastError() ?? "Couldn't delete");
    toast.success("Admin deleted");
    setConfirmDelete(null);
    load();
  };

  const doReset = async () => {
    if (!resetting) return;
    if (resetting.password.length < 8) return toast.error("Password must be at least 8 characters");
    const ok = await api.setPasswordFor(resetting.admin.id, resetting.password);
    if (!ok) return toast.error(lastError() ?? "Couldn't set the password");
    toast.success(`Password set for ${resetting.admin.email}`);
    setResetting(null);
  };

  // ---- permission catalog --------------------------------------------------
  const [permEditing, setPermEditing] = useState<{ id?: string; key: string; description: string; isSystem: boolean } | null>(null);
  const [confirmPermDelete, setConfirmPermDelete] = useState<PermissionRow | null>(null);

  const savePermission = async () => {
    if (!permEditing) return;
    const key = permEditing.key.trim();
    if (!/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(key)) {
      return toast.error("Key must look like resource:action");
    }
    const res = permEditing.id
      ? await api.updatePermission(permEditing.id,
          // A system key can't be renamed; only its description is editable.
          permEditing.isSystem ? { description: permEditing.description } : { key, description: permEditing.description })
      : await api.createPermission(key, permEditing.description);
    if (!res) return toast.error(lastError() ?? "Couldn't save");
    toast.success(permEditing.id ? "Permission updated" : "Permission created");
    setPermEditing(null);
    load();
  };

  const doPermDelete = async () => {
    if (!confirmPermDelete) return;
    const ok = await api.deletePermission(confirmPermDelete.id);
    if (!ok) return toast.error(lastError() ?? "Couldn't delete");
    toast.success("Permission deleted");
    setConfirmPermDelete(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-faint">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!admins) {
    return <Empty title="Couldn't load admins" description={lastError() ?? undefined} />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Admin Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">Who can sign in, and what each of them is allowed to do.</p>
        </div>
        {tab === "admins" && canWrite && (
          <Button
            size="sm"
            onClick={() => setEditing({ mode: "create", email: "", password: "", isActive: true, permissions: [] })}
          >
            <Plus className="h-3.5 w-3.5" /> New admin
          </Button>
        )}
        {tab === "permissions" && canWrite && (
          <Button size="sm" onClick={() => setPermEditing({ key: "", description: "", isSystem: false })}>
            <Plus className="h-3.5 w-3.5" /> New permission
          </Button>
        )}
      </div>

      {missingPermissions.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-orange/25 bg-app-orange/[0.07] p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-app-orange">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingPermissions.length} permission{missingPermissions.length === 1 ? " this dashboard needs is" : "s this dashboard needs are"} missing here
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              Add these permissions so you can assign access to every dashboard page:{" "}
              <span className="text-ink">{missingPermissions.map((p) => p.key).join(", ")}</span>
            </p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={createMissing} disabled={creatingMissing}>
              {creatingMissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create {missingPermissions.length} missing
            </Button>
          )}
        </div>
      )}
      <div className="mb-5">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "admins", label: "Admin Accounts" },
            { key: "permissions", label: "Permissions" },
          ]}
        />
      </div>

      {tab === "admins" && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-app-navy-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Permissions</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-ink">{a.email}</span>
                      {a.isSuperAdmin && (
                        <Badge variant="purple">
                          <ShieldCheck className="mr-1 inline h-3 w-3" />
                          Super admin
                        </Badge>
                      )}
                      {a.id === user?.id && <Badge variant="info">You</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={a.isActive ? "success" : "default"}>{a.isActive ? "Active" : "Disabled"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {a.permissions.length} {a.permissions.length === 1 ? "permission" : "permissions"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* The backend refuses to modify the super admin row, so
                          offering it here would only produce a 403. */}
                      {canWrite && !a.isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit"
                          onClick={() =>
                            setEditing({ mode: "edit", id: a.id, email: a.email, isActive: a.isActive, permissions: [...a.permissions] })
                          }
                        >
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isSuper && (
                        <Button variant="ghost" size="sm" title="Set password" onClick={() => setResetting({ admin: a, password: "" })}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && !a.isSuperAdmin && (
                        <Button variant="ghost" size="sm" title="Delete" onClick={() => setConfirmDelete(a)}>
                          <Trash2 className="h-3.5 w-3.5 text-app-red-text/70" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "permissions" && catalog && (
        <div className="space-y-5">
          <p className="text-[13px] text-ink-muted">
            Permissions use the same page names as the dashboard. System keys are managed by the backend.
          </p>

          {groupPermissions(catalog).map((g) => (
            <div key={g.resource} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-app-navy-card/40">
              <div className="border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {PERMISSION_GROUPS[g.resource]?.label ?? g.resource}
              </div>
              {g.rows.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0">
                  <code className="font-mono text-[13px] text-ink">{p.key}</code>
                  {p.isSystem ? <Badge variant="default">System</Badge> : <Badge variant="info">Custom</Badge>}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-faint">{p.description}</span>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title={p.isSystem ? "Edit description" : "Edit"}
                      onClick={() => setPermEditing({ id: p.id, key: p.key, description: p.description ?? "", isSystem: p.isSystem })}
                    >
                      <UserCog className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canWrite && !p.isSystem && (
                    <Button variant="ghost" size="sm" title="Delete" onClick={() => setConfirmPermDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5 text-app-red-text/70" />
                    </Button>
                  )}
                  {p.isSystem && <Lock className="h-3.5 w-3.5 text-ink-faint/50" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------- create / edit admin */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.mode === "create" ? "New admin" : "Edit admin"}
        subtitle={editing?.mode === "create" ? "They'll sign in with these details." : undefined}
        /* 3xl, not lg. The catalogue is 42 permissions across 23 resource
           groups; in a 576px sheet that was a 288px scroll box showing about
           six at a time. */
        size="3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdmin} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-muted">Email</span>
                <input className={inputCls} type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </label>

              {editing.mode === "create" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-ink-muted">Password (at least 8 characters)</span>
                  <input
                    className={inputCls}
                    type="text"
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    placeholder="They can change it once they're in"
                  />
                </label>
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-transparent"
              />
              <span className="text-[13px] text-ink">Active, a disabled admin can&apos;t sign in</span>
            </label>

            <div className="border-t border-white/[0.06] pt-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-ink-muted">Permissions</span>
                <span className="text-[11px] text-ink-faint">Nothing granted = no access beyond changing their own password</span>
              </div>
              <PermissionPicker
                catalog={catalog ?? []}
                selected={editing.permissions}
                onToggle={togglePermission}
                onSetMany={setManyPermissions}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------ set password */}
      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title="Set a new password"
        subtitle={resetting ? resetting.admin.email : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button onClick={doReset}>Set password</Button>
          </>
        }
      >
        {resetting && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">New password (at least 8 characters)</span>
              <input
                className={inputCls}
                type="text"
                value={resetting.password}
                onChange={(e) => setResetting({ ...resetting, password: e.target.value })}
                autoFocus
              />
            </label>
            <p className="text-[11px] text-ink-faint">
              You&apos;ll need to tell them the new password yourself, it isn&apos;t emailed to them.
            </p>
          </div>
        )}
      </Modal>

      {/* --------------------------------------------------- delete confirms */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this admin?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{confirmDelete?.email}</span> will lose access immediately. To stop them
          signing in without losing the record, set them to inactive instead.
        </p>
      </Modal>

      <Modal
        open={!!confirmPermDelete}
        onClose={() => setConfirmPermDelete(null)}
        title="Delete this permission?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPermDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doPermDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          <code className="font-mono text-ink">{confirmPermDelete?.key}</code> will be removed and unassigned from every
          admin who has it. Any page gated on it becomes unreachable until you assign something else.
        </p>
      </Modal>

      {/* --------------------------------------------- create/edit permission */}
      <Modal
        open={!!permEditing}
        onClose={() => setPermEditing(null)}
        title={permEditing?.id ? "Edit permission" : "New permission"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPermEditing(null)}>
              Cancel
            </Button>
            <Button onClick={savePermission}>Save</Button>
          </>
        }
      >
        {permEditing && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">Key</span>
              <input
                className={inputCls}
                value={permEditing.key}
                disabled={permEditing.isSystem}
                onChange={(e) => setPermEditing({ ...permEditing, key: e.target.value })}
                placeholder="billing-tool:view"
              />
              {permEditing.isSystem && (
                <span className="mt-1 block text-[11px] text-ink-faint">System keys can&apos;t be renamed, description only.</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">Description</span>
              <input
                className={inputCls}
                value={permEditing.description}
                onChange={(e) => setPermEditing({ ...permEditing, description: e.target.value })}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
