"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { AppSettings, AppSettingsUpdate, useAppSettingsApi } from "../api/appSettingsApi";

export type SettingsSection = "chatgpt" | "nudge" | "policies" | "socials";

const chatGptKeys = ["chatGpt.isEnabled", "chatGpt.maxDailyRequests", "chatGpt.promptPrefix", "chatGpt.promptSuffix"];
const nudgeKeys = ["nudge.congratulation.title", "nudge.congratulation.body", "nudge.reminder.title", "nudge.reminder.body"];
const policyKeys = ["privacyPolicy", "termsAndConditions", "contactUs", "faq"];
const socialsKeys = ["socials.instagram", "socials.tiktok", "socials.x", "socials.website"];

const chatGptLabels: Record<string, string> = {
  "chatGpt.isEnabled": "Enable ChatGPT",
  "chatGpt.maxDailyRequests": "Max Daily Requests",
  "chatGpt.promptPrefix": "Prompt Prefix",
  "chatGpt.promptSuffix": "Prompt Suffix",
};
const nudgeLabels: Record<string, string> = {
  "nudge.congratulation.title": "Congratulation Title",
  "nudge.congratulation.body": "Congratulation Body",
  "nudge.reminder.title": "Reminder Title",
  "nudge.reminder.body": "Reminder Body",
};
const policyLabels: Record<string, string> = {
  privacyPolicy: "Privacy Policy URL",
  termsAndConditions: "Terms & Conditions URL",
  contactUs: "Contact Us URL",
  faq: "FAQ URL",
};
const socialsLabels: Record<string, string> = {
  "socials.instagram": "Instagram",
  "socials.tiktok": "TikTok",
  "socials.x": "X (Twitter)",
  "socials.website": "Website",
};

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-ink-muted";

function keysForSections(sections: SettingsSection[]): string[] {
  const out: string[] = [];
  if (sections.includes("chatgpt")) out.push(...chatGptKeys);
  if (sections.includes("nudge")) out.push(...nudgeKeys);
  if (sections.includes("policies")) out.push(...policyKeys);
  if (sections.includes("socials")) out.push(...socialsKeys);
  return out;
}

export default function SettingsForm({ title, sections }: { title: string; sections: SettingsSection[] }) {
  const { getAppSettings, updateAppSettings, loading } = useAppSettingsApi();
  const [original, setOriginal] = useState<AppSettings>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getAppSettings();
      if (data) {
        setOriginal(data);
        const v: Record<string, any> = {};
        keysForSections(sections).forEach((k) => {
          if (socialsKeys.includes(k)) v[k] = data[k] || { name: "", url: "" };
          else v[k] = data[k];
        });
        setValues(v);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const set = (key: string, value: any) => setValues((p) => ({ ...p, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updates: AppSettingsUpdate[] = [];
      keysForSections(sections).forEach((key) => {
        const v = values[key];
        if (socialsKeys.includes(key)) {
          if (JSON.stringify(v) !== JSON.stringify(original[key])) updates.push({ key, value: JSON.stringify(v) });
        } else {
          let out = v;
          if (typeof out === "boolean" || typeof out === "number") out = String(out);
          if (out !== undefined && out !== String(original[key])) updates.push({ key, value: out });
        }
      });
      if (updates.length === 0) {
        toast.info("No changes to update.");
        return;
      }
      const ok = await updateAppSettings(updates);
      if (ok) {
        toast.success("Settings updated successfully.");
        const data = await getAppSettings();
        if (data) setOriginal(data);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </Button>
        }
      />

      {loading && Object.keys(values).length === 0 ? (
        <div className="flex items-center justify-center py-16 text-ink-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…
        </div>
      ) : (
        <div className="space-y-5">
          {sections.includes("chatgpt") && (
            <Card title="ChatGPT Settings">
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => set("chatGpt.isEnabled", !values["chatGpt.isEnabled"])}
                    className={
                      "relative h-6 w-11 rounded-full transition-colors " +
                      (values["chatGpt.isEnabled"] ? "bg-jp-blue" : "bg-white/[0.12]")
                    }
                  >
                    <span
                      className={
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all " +
                        (values["chatGpt.isEnabled"] ? "left-[22px]" : "left-0.5")
                      }
                    />
                  </button>
                  <span className="text-sm text-ink">{chatGptLabels["chatGpt.isEnabled"]}</span>
                </label>
                <div>
                  <label className={labelCls}>{chatGptLabels["chatGpt.maxDailyRequests"]}</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={values["chatGpt.maxDailyRequests"] ?? ""}
                    onChange={(e) => set("chatGpt.maxDailyRequests", e.target.value)}
                  />
                </div>
                {["chatGpt.promptPrefix", "chatGpt.promptSuffix"].map((k) => (
                  <div key={k}>
                    <label className={labelCls}>{chatGptLabels[k]}</label>
                    <textarea rows={12} className={inputCls + " resize-y font-mono text-[13px] leading-relaxed"} value={values[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {sections.includes("nudge") && (
            <Card title="Nudge Messages">
              <div className="mb-4 rounded-lg border border-jp-blue/20 bg-jp-blue/[0.06] p-3 text-xs text-ink-muted">
                Placeholders: <code className="text-jp-blue-light">{"{senderName}"}</code>,{" "}
                <code className="text-jp-blue-light">{"{receiverName}"}</code>,{" "}
                <code className="text-jp-blue-light">{"{prayerName}"}</code> (reminders only)
              </div>
              <div className="space-y-4">
                {nudgeKeys.map((k) => (
                  <div key={k}>
                    <label className={labelCls}>{nudgeLabels[k]}</label>
                    {k.endsWith(".body") ? (
                      <textarea rows={2} className={inputCls} value={values[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                    ) : (
                      <input className={inputCls} value={values[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {sections.includes("policies") && (
            <Card title="Policies & Contact">
              <div className="space-y-4">
                {policyKeys.map((k) => (
                  <div key={k}>
                    <label className={labelCls}>{policyLabels[k]}</label>
                    <input className={inputCls} value={values[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {sections.includes("socials") && (
            <Card title="Social Links">
              <div className="space-y-4">
                {socialsKeys.map((k) => (
                  <div key={k} className="grid grid-cols-[120px_1fr_2fr] items-center gap-3">
                    <span className="text-sm font-medium text-ink">{socialsLabels[k]}</span>
                    <input
                      className={inputCls}
                      placeholder="Name"
                      value={values[k]?.name ?? ""}
                      onChange={(e) => set(k, { ...(values[k] || {}), name: e.target.value })}
                    />
                    <input
                      className={inputCls}
                      placeholder="URL"
                      value={values[k]?.url ?? ""}
                      onChange={(e) => set(k, { ...(values[k] || {}), url: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
