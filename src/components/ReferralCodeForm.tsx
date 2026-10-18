"use client";

import React, { useState } from "react";
import { ReferralCode } from "../api/referralCodesApi";
import Button from "@/components/ui/Button";
import FormSection from "@/components/ui/FormSection";
import { Loader2 } from "lucide-react";

type ReferralCodeFormProps = {
  initialValues?: Partial<ReferralCode>;
  onSubmit: (values: Partial<ReferralCode>) => void;
  loading?: boolean;
};

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none";
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
      name: name.trim(),
      code: code.trim(),
      description,
      active,
      bypassPaywall,
      offeringId,
      bypassPaywallDurationDays: durationDays === "" ? null : Number(durationDays),
      expiredAt: expiredAt ? new Date(expiredAt).toISOString() : null,
    } as Partial<ReferralCode>);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormSection title="Code details" disabled={loading}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>Name *
            <input required pattern=".*\S.*" title="Enter at least one non-space character" className={inputCls + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" autoFocus />
          </label>
          <label className={labelCls}>Code *
            <input required pattern=".*\S.*" title="Enter at least one non-space character" className={inputCls + " mt-1 font-mono"} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Referral code" />
          </label>
        </div>
        <label className={labelCls}>Description
          <textarea className={inputCls + " mt-1"} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-app-blue" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </FormSection>
      <FormSection title="Access granted" disabled={loading}>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-app-blue" checked={bypassPaywall} onChange={(e) => setBypassPaywall(e.target.checked)} /> Bypass paywall
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>Access duration (days)
            <input type="number" min={1} step={1} disabled={!bypassPaywall} className={inputCls + " mt-1 disabled:opacity-40"} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="Unlimited" />
            <span className="mt-1 block text-xs font-normal text-ink-faint">Leave blank for unlimited access when bypass is enabled.</span>
          </label>
          <label className={labelCls}>Offering ID
            <input className={inputCls + " mt-1"} value={offeringId} onChange={(e) => setOfferingId(e.target.value)} placeholder="Optional" />
          </label>
        </div>
      </FormSection>
      <label className={labelCls}>Code expires at
        <input type="datetime-local" className={inputCls + " mt-1"} value={expiredAt} onChange={(e) => setExpiredAt(e.target.value)} disabled={loading} />
        <span className="mt-1 block text-xs font-normal text-ink-faint">Optional code expiry, in your local time. Separate from access duration.</span>
      </label>
      <div className="pt-1">
        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Saving…" : initialValues.id ? "Save changes" : "Create code"}
        </Button>
      </div>
    </form>
  );
};

export default ReferralCodeForm;
