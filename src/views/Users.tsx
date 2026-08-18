"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import dayjs from "dayjs";
import { Filter, Download, X, Loader2 } from "lucide-react";
import MultiSelect from "@/components/ui/MultiSelect";
import { regionOptions } from "@/lib/countries";
import { fetchUsersAcrossRegions, clearRegionTotalsCache } from "@/lib/usersFanout";
import { CANCEL_REASONS } from "@/lib/subscription";
import { User, useUsersApi } from "../api/usersApi";
import { SUBSCRIPTION_STATUS_OPTIONS, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_BADGE, CANCEL_REASON_LABELS } from "@/lib/subscription";
import { normalizeRegion, prettyPlace, regionFlag, regionName } from "@/lib/countries";
import { PLATFORM_OPTIONS, PLATFORM_BADGE, platformLabel, platformsText } from "@/lib/platform";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Empty from "@/components/ui/Empty";
import DataTable, { Column, useTablePrefs, ColumnsButton } from "@/components/ui/DataTable";
import BatchBar from "@/components/ui/BatchBar";

/** Hover tooltip with the raw GPS coordinates (when the app sent any). */
function coordsTitle(user: User): string | undefined {
  return user.latitude != null && user.longitude != null
    ? `Coordinates: ${user.latitude}, ${user.longitude}`
    : undefined;
}

/** City / Country cell — plain stored value from the backend (the app sends
 * these directly now; no geocoding anywhere). */
function PlaceCell({ value, user }: { value: string | null | undefined; user: User }) {
  if (!value) return <span className="text-ink-faint">-</span>;
  return <span title={coordsTitle(user)}>{value}</span>;
}

function UserAvatar({ user }: { user: User }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "?";
  if (user.profilePicture) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.profilePicture}
        alt=""
        className="h-7 w-7 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-jp-blue/20 text-xs font-medium text-jp-blue-light">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const genderMap: Record<string, string> = { male: "Male", female: "Female" };
const personalJourneyMap: Record<string, string> = {
  born_muslim: "Born Muslim",
  reverted_in_my_youth: "Reverted in My Youth",
  recently_embraced_islam: "Recently Embraced Islam",
  revert: "Revert",
};
const heardMap: Record<string, string> = {
  app_store: "App Store",
  word_of_mouth: "Word of Mouth",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};
const donationCountryMap: Record<string, string> = {
  SUDAN: "🇸🇩 SUDAN",
  PALASTINE: "🇵🇸 PALASTINE",
  YEMEN: "🇾🇪 YEMEN",
};

// Filter field options (mirror the old drawer).
const SELECTS = {
  isActive: [
    { label: "Active", value: "true" },
    { label: "Inactive", value: "false" },
  ],
  gender: [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ],
  personalJourney: [
    { label: "Born Muslim", value: "born_muslim" },
    { label: "Reverted in My Youth", value: "reverted_in_my_youth" },
    { label: "Recently Embraced Islam", value: "recently_embraced_islam" },
    { label: "Revert", value: "revert" },
  ],
  heard: [
    { label: "App Store", value: "app_store" },
    { label: "Word of Mouth", value: "word_of_mouth" },
    { label: "TikTok", value: "tiktok" },
    { label: "Instagram", value: "instagram" },
    { label: "Facebook", value: "facebook" },
    { label: "YouTube", value: "youtube" },
  ],
  // Backend enum (uppercase) — the old lowercase active/former/never now 400s.
  // "…WITH_FREE_CODE" splits out users whose access comes from a referral
  // free-code bypass rather than a paid subscription.
  subscriptionFilter: SUBSCRIPTION_STATUS_OPTIONS,
  // Device platform (active sessions ∪ active devices). Sent as `platforms`.
  platforms: PLATFORM_OPTIONS,
  cancelReason: CANCEL_REASONS.map((r) => ({ label: r.label, value: r.value })),
};

// NOTE: there is deliberately no "Donation Country" filter. `/admin/users`
// does not support that parameter — passing it is silently ignored and you
// get the entire database back (verified: donationCountry=SUDAN returned all
// 228,632 users). A filter that quietly matches everyone is worse than none.
// Same story for `country`, `city` and `timezone` — the workflow audience
// endpoint supports them, this one doesn't. On Hamdy's list.

/** Storefront codes are alpha-3 ("USA"), which is what the backend stores. */
const REGION_OPTIONS = regionOptions().map((r) => ({ value: r.alpha3, label: `${r.flag} ${r.name}`, hint: r.alpha3 }));

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-jp-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-faint";

const PAGE_SIZES = [10, 20, 50, 100];

const Users: React.FC = () => {
  const {
    fetchUsers,
    loading,
    error,
    toggleUserStatus,
    generateFakePrayerLogs,
    restoreUser,
    softDeleteUser,
    permanentDeleteUser,
  } = useUsersApi();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "soft" | "permanent"; user: User } | null>(null);
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<null | "soft" | "permanent" | "recover">(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [csvExportProgress, setCsvExportProgress] = useState<{
    phase: "fetch" | "build";
    fetched: number;
    total: number | null;
    page: number | null;
    totalPages: number | null;
  } | null>(null);

  // Build query params from current filters + tab (dates → ISO).
  /** Everything EXCEPT region/page/limit — the fan-out supplies those, since
   * several regions become several backend queries stitched together. */
  const buildBase = () => {
    const { appStoreRegions: _regions, ...rest } = filters;
    const params: any = { ...rest };
    if (activeTab === "deleted") params.deleted = true;
    if (params.createdAtStart) params.createdAtStart = new Date(params.createdAtStart).toISOString();
    if (params.createdAtEnd) params.createdAtEnd = new Date(params.createdAtEnd).toISOString();
    return params;
  };

  const selectedRegions: string[] = Array.isArray(filters.appStoreRegions) ? filters.appStoreRegions : [];

  const loadPage = (pageArg: number, limitArg: number, options?: { silent?: boolean }) =>
    fetchUsersAcrossRegions(fetchUsers, buildBase(), selectedRegions, pageArg, limitArg, options);

  useEffect(() => {
    const load = async () => {
      const res = await loadPage(page, pageSize);
      if (res) {
        setUsers(res.data);
        setTotal(res.meta.total);
      }
    };
    load();
    // eslint-disable-next-line
  }, [page, pageSize, filters, activeTab]);

  const refetchUsers = () => {
    loadPage(page, pageSize).then((res) => {
      if (res) {
        setUsers(res.data);
        setTotal(res.meta.total);
      }
    });
  };

  const applyFilters = () => {
    const clean: Record<string, any> = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v === "" || v == null) return;
      if (k === "isActive") clean[k] = v === "true";
      else clean[k] = v;
    });
    setPage(1);
    clearRegionTotalsCache();
    setFilters(clean);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraft({});
    setFilters({});
    setPage(1);
  };

  // ---- CSV export (logic preserved verbatim; only the progress UI is restyled) ----
  const exportToCSV = async () => {
    setCsvExportProgress({ phase: "fetch", fetched: 0, total: null, page: null, totalPages: null });
    try {
      let allUsers: User[] = [];
      let currentPage = 1;
      const limit = 500;
      let hasMoreData = true;

      while (hasMoreData) {
        const res = await loadPage(currentPage, limit, { silent: true });
        if (!res) {
          hasMoreData = false;
          break;
        }
        if (res.data.length > 0) {
          allUsers = [...allUsers, ...res.data];
          const m = res.meta;
          setCsvExportProgress({
            phase: "fetch",
            fetched: allUsers.length,
            total: m && typeof m.total === "number" ? m.total : null,
            page: m && typeof m.page === "number" ? m.page : null,
            totalPages: m && typeof m.totalPages === "number" ? m.totalPages : null,
          });
          currentPage++;
          hasMoreData = res.data.length === limit;
        } else {
          hasMoreData = false;
        }
      }

      setCsvExportProgress((prev) => (prev ? { ...prev, phase: "build" } : null));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const csvHeaders = [
        "ID", "Name", "Profile Name", "Email", "Timezone", "Latitude", "Longitude",
        "City", "Country", "Store Region", "Gender", "Age", "Personal Journey", "Heard About",
        "Current Daily Prayer", "Target Daily Prayer", "Donation Country", "Total Spent",
        "Subscription", "Cancel Reason", "Device", "Auth Type", "Active", "Created At",
      ];
      const csvRows = allUsers.map((user) => [
        user.id,
        [user.firstName, user.lastName].filter(Boolean).join(" ") || "-",
        user?.userProfile?.name || "",
        user.email,
        user.timezone ?? "-",
        user.latitude != null ? String(user.latitude) : "-",
        user.longitude != null ? String(user.longitude) : "-",
        user.city ?? "-",
        user.country ?? "-",
        normalizeRegion(user.appStoreRegion) ? `${regionName(user.appStoreRegion)} (${normalizeRegion(user.appStoreRegion)})` : "-",
        genderMap[user.userProfile?.gender] || "N/A",
        user.userProfile?.age || "",
        personalJourneyMap[user.userProfile?.personalJourney] || "-",
        heardMap[user.userProfile?.heard] || "-",
        user.userProfile?.currentDailyPrayer || "-",
        user.userProfile?.targetDailyPrayers || "-",
        user.userProfile?.donationCountry
          ? donationCountryMap[user.userProfile.donationCountry] || user.userProfile.donationCountry
          : "-",
        `$${user.totalSpent?.toFixed(2) || "0.00"}`,
        user.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[user.subscriptionStatus] || user.subscriptionStatus : "-",
        user.cancelReason ? CANCEL_REASON_LABELS[user.cancelReason] || user.cancelReason : "-",
        platformsText(user.platforms),
        user.googleId ? "Google" : user.appleId ? "Apple" : "Email",
        user.isActive ? "Active" : "Inactive",
        dayjs(user.createdAt).format("DD/MM/YYYY HH:mm A"),
      ]);
      const escapeCsvField = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
      const csvContent = [
        csvHeaders.map(escapeCsvField).join(","),
        ...csvRows.map((row) => row.map(escapeCsvField).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `users_export_${dayjs().format("YYYY-MM-DD_HH-mm")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setCsvExportProgress(null);
      toast.success(`Successfully exported ${allUsers.length} users to CSV!`);
    } catch (err) {
      console.error("Export error:", err);
      setCsvExportProgress(null);
      toast.error("Failed to export users to CSV");
    }
  };

  const csvPercent = (() => {
    if (!csvExportProgress) return 0;
    if (csvExportProgress.phase === "build") return 100;
    if (csvExportProgress.total && csvExportProgress.total > 0)
      return Math.min(100, Math.round((csvExportProgress.fetched / csvExportProgress.total) * 100));
    if (csvExportProgress.totalPages && csvExportProgress.page)
      return Math.min(100, Math.round((csvExportProgress.page / csvExportProgress.totalPages) * 100));
    return 0;
  })();

  const handleDeleteConfirmOk = async () => {
    if (!deleteConfirm) return;
    const { type, user } = deleteConfirm;
    setDeleteConfirmLoading(true);
    try {
      const result = type === "soft" ? await softDeleteUser(user.id) : await permanentDeleteUser(user.id);
      if (result.success) {
        toast.success(type === "soft" ? "User has been deleted." : "User permanently deleted.");
        setDeleteConfirm(null);
        refetchUsers();
      } else {
        toast.error(result.message);
      }
    } finally {
      setDeleteConfirmLoading(false);
    }
  };

  // Selection is scoped to the current page of loaded rows — clear it when
  // the page or tab changes so a bulk action never touches off-screen users.
  useEffect(() => { setSelected(new Set()); }, [page, activeTab]);
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllSel = (ids: string[], sel: boolean) => setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (sel ? n.add(id) : n.delete(id))); return n; });

  const runBatch = async (kind: "soft" | "permanent" | "recover") => {
    setBatchRunning(true);
    const ids = [...selected];
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const success =
          kind === "soft" ? (await softDeleteUser(id)).success
          : kind === "permanent" ? (await permanentDeleteUser(id)).success
          : await restoreUser(id);
        success ? ok++ : fail++;
      } catch { fail++; }
    }
    setBatchRunning(false);
    setBatchConfirm(null);
    setSelected(new Set());
    const verb = kind === "recover" ? "recovered" : kind === "permanent" ? "permanently deleted" : "deleted";
    if (ok) toast.success(`${ok} user${ok === 1 ? "" : "s"} ${verb}.`);
    if (fail) toast.error(`${fail} failed.`);
    refetchUsers();
  };

  // Column definitions — sortable (sortValue) + resizable (width) via DataTable.
  const columns: Column<User>[] = [
    // Full UUID by default (key changed from "id" so it picks up the wider
    // default width instead of any cached 120px). select-all → one click copies it.
    { key: "uuid", header: "User ID", width: 320, sortValue: (u) => u.id, cell: (u) => <span className="select-all font-mono text-xs text-ink-muted" title={u.id}>{u.id}</span> },
    { key: "avatar", header: "Avatar", width: 80, cell: (u) => <UserAvatar user={u} /> },
    { key: "name", header: "Name", width: 160, sortValue: (u) => [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase(), cell: (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || "-" },
    { key: "profileName", header: "Profile Name", width: 140, sortValue: (u) => (u.userProfile?.name || "").toLowerCase(), cell: (u) => u.userProfile?.name || "-" },
    { key: "email", header: "Email", width: 230, sortValue: (u) => (u.email || "").toLowerCase(), cell: (u) => u.email },
    { key: "timezone", header: "Timezone", width: 120, sortValue: (u) => u.timezone || "", cell: (u) => u.timezone || "-" },
    { key: "city", header: "City", width: 130, sortValue: (u) => (u.city || "").toLowerCase(), cell: (u) => <PlaceCell value={u.city} user={u} /> },
    { key: "country", header: "Country", width: 150, sortValue: (u) => (u.country || "").toLowerCase(), cell: (u) => { const p = prettyPlace(u.country); return p.label ? <span title={coordsTitle(u)}>{p.flag ? `${p.flag} ` : ""}{p.label}</span> : <span className="text-ink-faint">-</span>; } },
    { key: "appStoreRegion", header: "Store Region", width: 160, sortValue: (u) => regionName(u.appStoreRegion).toLowerCase(), cell: (u) => { const code = normalizeRegion(u.appStoreRegion); if (!code) return <span className="text-ink-faint">-</span>; const f = regionFlag(code); return <span title={`${regionName(code)} (${code})`}>{f ? `${f} ` : ""}{regionName(code)}</span>; } },
    { key: "gender", header: "Gender", width: 90, sortValue: (u) => u.userProfile?.gender || "", cell: (u) => genderMap[u.userProfile?.gender] || "N/A" },
    { key: "age", header: "Age", width: 70, sortValue: (u) => u.userProfile?.age || 0, cell: (u) => u.userProfile?.age ?? "-" },
    { key: "journey", header: "Personal Journey", width: 170, sortValue: (u) => u.userProfile?.personalJourney || "", cell: (u) => personalJourneyMap[u.userProfile?.personalJourney] || "-" },
    { key: "heard", header: "Heard About", width: 130, sortValue: (u) => u.userProfile?.heard || "", cell: (u) => heardMap[u.userProfile?.heard] || "-" },
    { key: "currentPrayer", header: "Current Prayer", width: 130, sortValue: (u) => Number(u.userProfile?.currentDailyPrayer) || 0, cell: (u) => u.userProfile?.currentDailyPrayer || "-" },
    { key: "targetPrayer", header: "Target Prayer", width: 130, sortValue: (u) => Number(u.userProfile?.targetDailyPrayers) || 0, cell: (u) => u.userProfile?.targetDailyPrayers || "-" },
    { key: "donation", header: "Donation Country", width: 160, sortValue: (u) => u.userProfile?.donationCountry || "", cell: (u) => { const c = u.userProfile?.donationCountry; return c ? <Badge variant="info">{donationCountryMap[c] || c}</Badge> : <span className="text-ink-faint">-</span>; } },
    { key: "totalSpent", header: "Total Spent", width: 120, sortValue: (u) => u.totalSpent || 0, cell: (u) => <span className="font-semibold text-emerald-400 num">${u.totalSpent?.toFixed(2) || "0.00"}</span> },
    { key: "subscription", header: "Subscription", width: 150, sortValue: (u) => u.subscriptionStatus || "", cell: (u) => u.subscriptionStatus ? <Badge variant={SUBSCRIPTION_STATUS_BADGE[u.subscriptionStatus]}>{SUBSCRIPTION_STATUS_LABELS[u.subscriptionStatus] || u.subscriptionStatus}</Badge> : <span className="text-ink-faint">-</span> },
    { key: "platforms", header: "Device", width: 140, sortValue: (u) => (u.platforms ?? []).join(","), cell: (u) => { const list = (u.platforms ?? []).filter(Boolean); if (!list.length) return <span className="text-ink-faint" title="No active session or device on record">-</span>; return <span className="flex flex-wrap gap-1">{list.map((p) => <Badge key={p} variant={PLATFORM_BADGE[p] ?? "default"}>{platformLabel(p)}</Badge>)}</span>; } },
    { key: "authType", header: "Auth Type", width: 110, sortValue: (u) => (u.googleId ? "Google" : u.appleId ? "Apple" : "Email"), cell: (u) => <Badge variant={u.googleId ? "info" : "default"}>{u.googleId ? "Google" : u.appleId ? "Apple" : "Email"}</Badge> },
    { key: "active", header: "Active", width: 100, sortValue: (u) => (u.isActive ? 1 : 0), cell: (u) => <Badge variant={u.isActive ? "success" : "danger"}>{u.isActive ? "Active" : "Inactive"}</Badge> },
    { key: "createdAt", header: "Created At", width: 150, sortValue: (u) => new Date(u.createdAt).getTime(), cell: (u) => <span className="num">{dayjs(u.createdAt).format("DD/MM/YYYY HH:mm")}</span> },
    ...(activeTab === "deleted"
      ? [{ key: "deletedAt", header: "Deleted At", width: 150, sortValue: (u: User) => (u.deletedAt ? new Date(u.deletedAt).getTime() : 0), cell: (u: User) => <span className="num">{u.deletedAt ? dayjs(u.deletedAt).format("DD/MM/YYYY HH:mm") : "-"}</span> } as Column<User>]
      : []),
    {
      key: "actions",
      header: "Actions",
      width: 320,
      align: "right",
      clip: false,
      hideable: false,
      cell: (u) => (
        <div className="flex justify-end gap-1.5">
          {activeTab === "deleted" ? (
            <>
              <Button size="sm" onClick={async () => { const success = await restoreUser(u.id); if (success) { toast.success("User account restored successfully!"); refetchUsers(); } else toast.error("Failed to restore user account"); }}>Recover</Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteConfirm({ type: "permanent", user: u })}>Delete permanently</Button>
            </>
          ) : (
            <>
              <Button variant={u.isActive ? "warning" : "primary"} size="sm" onClick={async () => { const updated = await toggleUserStatus(u.id); if (updated) { toast.success(`User ${updated.isActive ? "activated" : "deactivated"} successfully!`); refetchUsers(); } else toast.error("Failed to toggle user status"); }}>{u.isActive ? "Deactivate" : "Activate"}</Button>
              <Button variant="secondary" size="sm" onClick={async () => { const success = await generateFakePrayerLogs(u.id); if (success) toast.success("Fake prayer logs generated successfully!"); else toast.error("Failed to generate fake prayer logs"); }}>Prayer Logs</Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteConfirm({ type: "soft", user: u })}>Delete</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const { widths, setWidths, hidden, toggleHidden } = useTablePrefs("users", columns);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${total.toLocaleString()} ${activeTab === "deleted" ? "deleted" : "active"} user${total === 1 ? "" : "s"}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "active", label: "Active Users" },
            { key: "deleted", label: "Deleted Users" },
          ]}
          active={activeTab}
          onChange={(k) => {
            setActiveTab(k);
            setPage(1);
          }}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
            <Filter className="h-3.5 w-3.5" />
            Filters
            {Object.keys(filters).length > 0 && (
              <span className="ml-1 rounded-full bg-jp-blue/20 px-1.5 text-[10px] text-jp-blue-light">{Object.keys(filters).length}</span>
            )}
          </Button>
          <ColumnsButton columns={columns} hidden={hidden} toggleHidden={toggleHidden} />
          <Button size="sm" onClick={exportToCSV} disabled={!!csvExportProgress}>
            {csvExportProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Inline collapsible filter panel (replaces the right drawer) */}
      {filtersOpen && (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-jp-navy-card/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Filters</h3>
            <button onClick={() => setFiltersOpen(false)} className="text-ink-faint hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Search name" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Search email" />
            </div>
            <div>
              <label className={labelCls}>Active Status</label>
              <select className={inputCls} value={draft.isActive ?? ""} onChange={(e) => setDraft({ ...draft, isActive: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.isActive.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select className={inputCls} value={draft.gender || ""} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.gender.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Personal Journey</label>
              <select className={inputCls} value={draft.personalJourney || ""} onChange={(e) => setDraft({ ...draft, personalJourney: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.personalJourney.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Heard About</label>
              <select className={inputCls} value={draft.heard || ""} onChange={(e) => setDraft({ ...draft, heard: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.heard.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>App Store region</label>
              <MultiSelect
                options={REGION_OPTIONS}
                value={draft.appStoreRegions || []}
                onChange={(v) => setDraft({ ...draft, appStoreRegions: v })}
                placeholder="Any region"
                searchPlaceholder="Search countries…"
              />
            </div>
            <div>
              <label className={labelCls}>Cancel reason</label>
              <select className={inputCls} value={draft.cancelReason || ""} onChange={(e) => setDraft({ ...draft, cancelReason: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.cancelReason.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Subscription</label>
              <select className={inputCls} value={draft.subscriptionFilter || ""} onChange={(e) => setDraft({ ...draft, subscriptionFilter: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.subscriptionFilter.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Device platform</label>
              <select className={inputCls} value={draft.platforms || ""} onChange={(e) => setDraft({ ...draft, platforms: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.platforms.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Min Age</label>
              <input type="number" min={0} max={120} className={inputCls} value={draft.minAge || ""} onChange={(e) => setDraft({ ...draft, minAge: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Max Age</label>
              <input type="number" min={0} max={120} className={inputCls} value={draft.maxAge || ""} onChange={(e) => setDraft({ ...draft, maxAge: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Min Current Prayer</label>
              <input type="number" min={0} max={5} className={inputCls} value={draft.minCurrentDailyPrayer || ""} onChange={(e) => setDraft({ ...draft, minCurrentDailyPrayer: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Max Current Prayer</label>
              <input type="number" min={0} max={5} className={inputCls} value={draft.maxCurrentDailyPrayer || ""} onChange={(e) => setDraft({ ...draft, maxCurrentDailyPrayer: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Min Target</label>
              <input type="number" min={0} max={5} className={inputCls} value={draft.minTargetDailyPrayer || ""} onChange={(e) => setDraft({ ...draft, minTargetDailyPrayer: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Max Target</label>
              <input type="number" min={0} max={5} className={inputCls} value={draft.maxTargetDailyPrayer || ""} onChange={(e) => setDraft({ ...draft, maxTargetDailyPrayer: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Created After</label>
              <input type="date" className={inputCls} value={draft.createdAtStart || ""} onChange={(e) => setDraft({ ...draft, createdAtStart: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Created Before</label>
              <input type="date" className={inputCls} value={draft.createdAtEnd || ""} onChange={(e) => setDraft({ ...draft, createdAtEnd: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={applyFilters} disabled={loading}>Apply filters</Button>
            <Button variant="ghost" size="sm" onClick={resetFilters} disabled={loading}>Reset</Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* CSV export progress */}
      {csvExportProgress && (
        <div className="mt-4 rounded-xl border border-jp-blue/20 bg-jp-blue/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-jp-blue-light">
            <Loader2 className="h-4 w-4 animate-spin" />
            Exporting users to CSV
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-jp-blue transition-all duration-300" style={{ width: `${csvPercent}%` }} />
          </div>
          <div className="mt-2 text-xs text-ink-muted">
            {csvExportProgress.phase === "build" ? (
              <span>Building CSV file…</span>
            ) : csvExportProgress.total != null ? (
              <span>
                {csvExportProgress.fetched.toLocaleString()} of {csvExportProgress.total.toLocaleString()} users
                {csvExportProgress.page != null && csvExportProgress.totalPages != null
                  ? ` · page ${csvExportProgress.page} of ${csvExportProgress.totalPages}`
                  : ""}
              </span>
            ) : (
              <span>{csvExportProgress.fetched.toLocaleString()} users fetched…</span>
            )}
          </div>
        </div>
      )}

      {/* Bulk-selection action bar (scoped to this page) */}
      <div className="mt-4">
        <BatchBar count={selected.size} onClear={() => setSelected(new Set())}>
          {activeTab === "deleted" ? (
            <>
              <Button size="sm" onClick={() => setBatchConfirm("recover")}>Recover selected</Button>
              <Button variant="danger" size="sm" onClick={() => setBatchConfirm("permanent")}>Delete permanently</Button>
            </>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setBatchConfirm("soft")}>Delete selected</Button>
          )}
        </BatchBar>
      </div>

      {/* Table */}
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06] bg-jp-navy-card/40">
        {users.length > 0 && <DataTable columns={columns} rows={users} rowKey={(u) => u.id} hidden={hidden} widths={widths} setWidths={setWidths} selection={{ selectedIds: selected, onToggle: toggleSel, onToggleAll: toggleAllSel }} />}

        {loading && users.length === 0 && (
          <div className="flex items-center justify-center py-16 text-ink-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading users…
          </div>
        )}
        {!loading && users.length === 0 && (
          <div className="p-6">
            <Empty title="No users found" description="Try adjusting or clearing the filters." />
          </div>
        )}

        {/* Pagination */}
        {users.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-sm">
            <div className="text-ink-faint">
              Page {page} of {totalPages} · {total.toLocaleString()} total
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-white/[0.08] bg-jp-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-jp-blue/45 focus:outline-none"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
              </select>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === "permanent" ? "Permanently delete this user?" : "Delete this user?"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)} disabled={deleteConfirmLoading}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirmOk} disabled={deleteConfirmLoading}>
              {deleteConfirmLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deleteConfirm?.type === "permanent" ? "Delete permanently" : "Delete"}
            </Button>
          </>
        }
      >
        {deleteConfirm?.type === "permanent"
          ? "This will permanently remove the user and all their data (rooms, prayer logs, subscriptions, etc.). This action cannot be undone."
          : "The user account will be deactivated and excluded from normal use. You can restore them later from the Deleted Users tab."}
      </Modal>

      {/* Batch confirm modal */}
      <Modal
        open={!!batchConfirm}
        onClose={() => !batchRunning && setBatchConfirm(null)}
        title={
          batchConfirm === "recover" ? `Recover ${selected.size} user${selected.size === 1 ? "" : "s"}?`
          : batchConfirm === "permanent" ? `Permanently delete ${selected.size} user${selected.size === 1 ? "" : "s"}?`
          : `Delete ${selected.size} user${selected.size === 1 ? "" : "s"}?`
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setBatchConfirm(null)} disabled={batchRunning}>Cancel</Button>
            <Button variant={batchConfirm === "recover" ? "primary" : "danger"} size="sm" onClick={() => runBatch(batchConfirm!)} disabled={batchRunning}>
              {batchRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {batchConfirm === "recover" ? "Recover all" : batchConfirm === "permanent" ? "Delete permanently" : "Delete all"}
            </Button>
          </>
        }
      >
        {batchConfirm === "permanent"
          ? "This permanently removes the selected users and all their data (rooms, prayer logs, subscriptions, etc.). This cannot be undone."
          : batchConfirm === "recover"
            ? "The selected accounts will be restored to active."
            : "The selected accounts will be deactivated and moved to Deleted Users. You can restore them later."}
      </Modal>
    </div>
  );
};

export default Users;
