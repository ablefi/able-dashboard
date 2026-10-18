"use client";

import { useState } from "react";
import { toast } from "react-toastify";
import { KeyRound } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAdminsApi } from "@/api/adminsApi";

const inputCls =
  "w-full rounded-lg border border-white/[0.12] bg-app-navy-card/60 px-3 py-2 font-sans text-sm text-ink outline-none focus:border-app-blue/50";

/** Change your own password. Available to every signed-in admin — the backend
 * asks only for a valid token here, not any particular permission. */
export default function ChangePasswordButton({ collapsed }: { collapsed?: boolean }) {
  const { changeOwnPassword, lastError } = useAdminsApi();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async () => {
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("The two new passwords don't match");
    setSaving(true);
    const ok = await changeOwnPassword(current, next);
    setSaving(false);
    if (!ok) return toast.error(lastError() ?? "Couldn't change your password");
    toast.success("Password changed");
    setOpen(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Change my password"
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
      >
        <KeyRound className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Change password</span>}
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Change your password"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              Change password
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-muted">Current password</span>
            <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-muted">New password (at least 8 characters)</span>
            <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-muted">Confirm new password</span>
            <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        </div>
      </Modal>
    </>
  );
}
