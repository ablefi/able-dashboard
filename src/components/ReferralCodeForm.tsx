"use client";

import React, { useState } from "react";
import { ReferralCode } from "../api/referralCodesApi";
import Button from "@/components/ui/Button";
import { Loader2 } from "lucide-react";

type ReferralCodeFormProps = {
  initialValues?: Partial<ReferralCode>;
  onSubmit: (values: Partial<ReferralCode>) => void;
  loading?: boolean;
};

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

// ISO → value for <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ReferralCodeForm: React.FC<ReferralCodeFormProps> = ({ initialValues = {}, onSubmit, loading = false }) => {
  const [name, setName] = useState(initialValues.name || "");
  const [code, setCode] = useState(initialValues.code || "");
  const [description, setDescription] = useState(initialValues.description || "");
  const [active, setActive] = useState(initialValues.active ?? true);
  const [bypassPaywall, setBypassPaywall] = useState(initialValues.bypassPaywall ?? false);
  const [durationDays, setDurationDays] = useState(
    initialValues.bypassPaywallDurationDays != null ? String(initialValues.bypassPaywallDurationDays) : ""
  );
  const [expiredAt, setExpiredAt] = useState(toLocalInput(initialValues.expiredAt));
  const [offeringId, setOfferingId] = useState(initialValues.offeringId || "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onSubmit({
      name,
      code,
      description,
      active,
      bypassPaywall,
      offeringId,
      bypassPaywallDurationDays: durationDays === "" ? null : Number(durationDays),
      expiredAt: expiredAt ? new Date(expiredAt).toISOString() : null,
    } as Partial<ReferralCode>);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={labelCls}>Name <span className="text-rose-400">*</span></label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Code <span className="text-rose-400">*</span></label>
        <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="h-4 w-4 accent-jp-blue" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="h-4 w-4 accent-jp-blue" checked={bypassPaywall} onChange={(e) => setBypassPaywall(e.target.checked)} />
        Bypass Paywall (never-expire subscription)
      </label>
      <div>
        <label className={labelCls}>Bypass Paywall Duration (days)</label>
        <input type="number" min={1} className={inputCls} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="e.g. 30 (empty = never expires)" />
      </div>
      <div>
        <label className={labelCls}>Expired At</label>
        <input type="datetime-local" className={inputCls} value={expiredAt} onChange={(e) => setExpiredAt(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Offering ID</label>
        <input className={inputCls} value={offeringId} onChange={(e) => setOfferingId(e.target.value)} placeholder="Offering ID" />
      </div>
      <div className="pt-1">
        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Saving..." : "Submit"}
        </Button>
      </div>
    </form>
  );
};

export default ReferralCodeForm;
