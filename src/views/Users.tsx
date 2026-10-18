"use client";

import React, { useEffect, useState, useRef } from "react";
import { fmtDateTime, fmtFileStamp } from "@/lib/dates";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import dayjs from "dayjs";
import { Filter, Download, X, Loader2 } from "lucide-react";
import MultiSelect from "@/components/ui/MultiSelect";
import { regionOptions } from "@/lib/countries";
import { fetchUsersAcrossRegions, clearRegionTotalsCache } from "@/lib/usersFanout";
import { lookupUsers } from "@/lib/usersLookup";
import { CANCEL_REASONS } from "@/lib/subscription";
import { User, useUsersApi } from "../api/usersApi";
import { SUBSCRIPTION_STATUS_OPTIONS, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_BADGE, CANCEL_REASON_LABELS } from "@/lib/subscription";
import { ACCESS_STATUS, accessStatusLabel, accessStatusVariant } from "@/lib/userAccess";
import { normalizeRegion, prettyPlace, regionFlag, regionName, toAlpha2, toRegionQueryCode } from "@/lib/countries";
import { PLATFORM_OPTIONS, PLATFORM_BADGE, platformLabel, platformsText } from "@/lib/platform";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import RowMenu from "@/components/ui/RowMenu";
import Pagination from "@/components/ui/Pagination";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Empty from "@/components/ui/Empty";
import DataTable, { Column, useTablePrefs, ColumnsButton } from "@/components/ui/DataTable";
import UserSettingsDrawer from "@/components/users/UserSettingsDrawer";
import BatchBar from "@/components/ui/BatchBar";
import { useAxios } from "@/api/axiosInstance";


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
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-app-blue/20 text-xs font-medium text-app-blue-light">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const genderMap: Record<string, string> = { male: "Male", female: "Female" };
const heardMap: Record<string, string> = {
  app_store: "App Store",
  word_of_mouth: "Word of Mouth",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

/**
 * `heard` used to be an enum, so a lookup table covered every possible value
 * and anything missing meant "not answered". It is free text now — the app asks
 * who you heard about us from and sends whatever the user types — so an unknown
 * value is the most interesting answer there is, not an absent one. Showing it
 * through the old table rendered every creator's name as a dash.
 *
 * Known codes still get their label; everything else shows exactly as typed,
 * because a person's name is not ours to reformat. Only genuinely empty is "-".
 */
function heardLabel(v: string | null | undefined): string {
  if (!v || !String(v).trim()) return "-";
  return heardMap[v] ?? String(v);
}

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
  accessStatus: Object.entries(ACCESS_STATUS).map(([value, { label }]) => ({ value, label: `${label} (${value})` })),
  // Device platform (active sessions ∪ active devices). Sent as `platforms`.
  platforms: PLATFORM_OPTIONS,
  cancelReason: CANCEL_REASONS.map((r) => ({ label: r.label, value: r.value })),
};

// NOTE: only offer filters the backend actually supports. If `/admin/users`
// silently ignores an unknown parameter, a filter that quietly matches
// everyone is worse than none (this happened with `country`, `city` and
// `timezone`).

/** Store regions are alpha-2 ("US") since the backend region migration. The
 * backend filter still matches users stored with older alpha-3 values. */
const REGION_OPTIONS = regionOptions().map((r) => ({ value: r.alpha2, label: `${r.flag} ${r.name}`, hint: r.alpha2 }));

/** Older selections may hold alpha-3 codes ("USA"); map them to alpha-2 so
 * they still match an option and are not sent twice. */
function normalizeRegionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((code) => toAlpha2(String(code)) ?? normalizeRegion(String(code))).filter((code): code is string => !!code))];
}

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-faint";

const PAGE_SIZES = [10, 20, 50, 100];

const Users: React.FC = () => {
  const {
    fetchUsers,
    clearError,
    loading,
    error,
    toggleUserStatus,
    restoreUser,
    softDeleteUser,
    permanentDeleteUser,
  } = useUsersApi();

  const [lookupDraft, setLookupDraft] = useState("");
  const [lookup, setLookup] = useState("");
  const [listLoading, setListLoading] = useState(true);
  /** Rows fetched so far by a name/email search, so a long search shows movement. */
  const [lookupProgress, setLookupProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupCache = useRef<{ key: string; rows: Promise<User[]> } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<User | null>(null);
  // 100 is the backend max per request and what the owner works at by default.
  const [pageSize, setPageSize] = useState(100);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { can } = useAuth();
  const canWrite = can("users:write");
  const canDelete = can("users:delete");
  const axios = useAxios();
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
    // The backend computes access status under one platform's country rules
    // and falls back to Android when none is given. Every user is on iOS
    // today, so ask for iOS. Revisit when the Android app has users.
    const params: any = { accessPlatform: "ios", ...rest };
    if (activeTab === "deleted") params.deleted = true;
    else params.isActive = activeTab === "active";
    if (params.createdAtStart) params.createdAtStart = new Date(params.createdAtStart).toISOString();
    if (params.createdAtEnd) params.createdAtEnd = new Date(params.createdAtEnd).toISOString();
    return params;
  };

  // Selections are alpha-2; the backend query wants alpha-3 (see toRegionQueryCode).
  const selectedRegions = normalizeRegionList(filters.appStoreRegions).map(toRegionQueryCode);

  const loadPage = async (pageArg: number, limitArg: number, options?: { silent?: boolean }) => {
    if (!lookup) return fetchUsersAcrossRegions(fetchUsers, buildBase(), selectedRegions, pageArg, limitArg, options);
    const base = buildBase();
    const key = JSON.stringify([lookup, base, selectedRegions]);
    if (lookupCache.current?.key !== key) {
      setLookupProgress(null);
      lookupCache.current = { key, rows: lookupUsers(fetchUsers, base, selectedRegions, lookup, (loaded, total) => setLookupProgress({ loaded, total })) };
    }
    try {
      const rows = await lookupCache.current.rows;
      return { data: rows.slice((pageArg - 1) * limitArg, pageArg * limitArg), meta: { total: rows.length, page: pageArg, totalPages: Math.ceil(rows.length / limitArg) } };
    } catch (error) {
      if (lookupCache.current?.key === key) lookupCache.current = null;
      throw error;
    }
  };

  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setListLoading(true);
    setLookupError(null);
    clearError();
    setUsers([]);
    setTotal(0);
    setSelected(new Set());
    loadPage(page, pageSize).then((res) => {
      if (!res) throw new Error("Could not load users. Please try again.");
      if (current) { setUsers(res.data); setTotal(res.meta.total); }
    }).catch((error) => {
      if (current) setLookupError(error.message || "Lookup failed. Please try again.");
    }).finally(() => { if (current) setListLoading(false); });
    return () => { current = false; };
    // eslint-disable-next-line
  }, [page, pageSize, filters, activeTab, lookup, refresh]);

  const refetchUsers = () => {
    lookupCache.current = null;
    clearRegionTotalsCache();
    setRefresh((value) => value + 1);
  };

  const applyFilters = () => {
    const clean: Record<string, any> = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v === "" || v == null) return;
      if (k === "isActive") clean[k] = v === "true";
      else if (k === "appStoreRegions") { const regions = normalizeRegionList(v); if (regions.length) clean[k] = regions; }
      else clean[k] = v;
    });
    setPage(1);
    clearRegionTotalsCache();
    setFilters(clean);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setLookupDraft("");
    setLookup("");
    lookupCache.current = null;
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
        "City", "Country", "Store Region", "Gender", "Age", "Heard About", "Total Spent",
        "Status", "Legacy Subscription", "Cancel Reason", "Device", "Auth Type", "Active", "Created At",
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
        heardLabel(user.userProfile?.heard),
        `$${user.totalSpent?.toFixed(2) || "0.00"}`,
        user.accessStatus ? accessStatusLabel(user.accessStatus) : "-",
        user.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[user.subscriptionStatus] || user.subscriptionStatus : "-",
        user.cancelReason ? CANCEL_REASON_LABELS[user.cancelReason] || user.cancelReason : "-",
        platformsText(user.platforms),
        user.googleId ? "Google" : user.appleId ? "Apple" : "Email",
        user.isActive ? "Active" : "Inactive",
        fmtDateTime(user.createdAt),
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
      link.setAttribute("download", `users_export_${fmtFileStamp()}.csv`);
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
    { key: "subscription", header: "Status", width: 150, sortValue: (u) => u.accessStatus || u.subscriptionStatus || "", cell: (u) => u.accessStatus ? <Badge variant={accessStatusVariant(u.accessStatus)}>{accessStatusLabel(u.accessStatus)}</Badge> : u.subscriptionStatus ? <Badge variant={SUBSCRIPTION_STATUS_BADGE[u.subscriptionStatus]}>{SUBSCRIPTION_STATUS_LABELS[u.subscriptionStatus] || u.subscriptionStatus}</Badge> : <span className="text-ink-faint">-</span> },
    { key: "email", header: "Email", width: 230, sortValue: (u) => (u.email || "").toLowerCase(), cell: (u) => u.email },
    { key: "profileName", header: "Profile Name", width: 140, sortValue: (u) => (u.userProfile?.name || "").toLowerCase(), cell: (u) => u.userProfile?.name || "-" },
    { key: "timezone", header: "Timezone", width: 120, sortValue: (u) => u.timezone || "", cell: (u) => u.timezone || "-" },
    { key: "city", header: "City", width: 130, sortValue: (u) => (u.city || "").toLowerCase(), cell: (u) => <PlaceCell value={u.city} user={u} /> },
    { key: "country", header: "Country", width: 150, sortValue: (u) => (u.country || "").toLowerCase(), cell: (u) => { const p = prettyPlace(u.country); return p.label ? <span title={coordsTitle(u)}>{p.flag ? `${p.flag} ` : ""}{p.label}</span> : <span className="text-ink-faint">-</span>; } },
    { key: "appStoreRegion", header: "Store Region", width: 160, sortValue: (u) => regionName(u.appStoreRegion).toLowerCase(), cell: (u) => { const code = normalizeRegion(u.appStoreRegion); if (!code) return <span className="text-ink-faint">-</span>; const f = regionFlag(code); return <span title={`${regionName(code)} (${code})`}>{f ? `${f} ` : ""}{regionName(code)}</span>; } },
    { key: "gender", header: "Gender", width: 90, sortValue: (u) => u.userProfile?.gender || "", cell: (u) => genderMap[u.userProfile?.gender] || "N/A" },
    { key: "age", header: "Age", width: 70, sortValue: (u) => u.userProfile?.age || 0, cell: (u) => u.userProfile?.age ?? "-" },
    { key: "heard", header: "Heard About", width: 130, sortValue: (u) => u.userProfile?.heard || "", cell: (u) => heardLabel(u.userProfile?.heard) },
    { key: "totalSpent", header: "Total Spent", width: 120, sortValue: (u) => u.totalSpent || 0, cell: (u) => <span className="font-semibold text-app-green num">${u.totalSpent?.toFixed(2) || "0.00"}</span> },
    {
      key: "appSettings",
      header: "App Settings",
      width: 120,
      sortValue: (u) => (u.settings || u.userProfile?.settings ? 1 : 0),
      cell: (u) => u.settings || u.userProfile?.settings ? <Badge variant="success">Yes</Badge> : <span className="text-ink-faint">-</span>,
    },
    { key: "platforms", header: "Device", width: 140, sortValue: (u) => (u.platforms ?? []).join(","), cell: (u) => { const list = (u.platforms ?? []).filter(Boolean); if (!list.length) return <span className="text-ink-faint" title="No active session or device on record">-</span>; return <span className="flex flex-wrap gap-1">{list.map((p) => <Badge key={p} variant={PLATFORM_BADGE[p] ?? "default"}>{platformLabel(p)}</Badge>)}</span>; } },
    { key: "authType", header: "Auth Type", width: 110, sortValue: (u) => (u.googleId ? "Google" : u.appleId ? "Apple" : "Email"), cell: (u) => <Badge variant={u.googleId ? "info" : "default"}>{u.googleId ? "Google" : u.appleId ? "Apple" : "Email"}</Badge> },
    { key: "active", header: "Active", width: 100, sortValue: (u) => (u.isActive ? 1 : 0), cell: (u) => <Badge variant={u.isActive ? "success" : "danger"}>{u.isActive ? "Active" : "Inactive"}</Badge> },
    { key: "createdAt", header: "Created At", width: 150, sortValue: (u) => new Date(u.createdAt).getTime(), cell: (u) => <span className="num">{fmtDateTime(u.createdAt)}</span> },
    ...(activeTab === "deleted"
      ? [{ key: "deletedAt", header: "Deleted At", width: 150, sortValue: (u: User) => (u.deletedAt ? new Date(u.deletedAt).getTime() : 0), cell: (u: User) => <span className="num">{u.deletedAt ? fmtDateTime(u.deletedAt) : "-"}</span> } as Column<User>]
      : []),
    {
      key: "rowActions", // New width for the compact menu; other saved columns stay intact.
      header: "Actions",
      width: 190,
      minWidth: 190,
      align: "right",
      clip: false,
      hideable: false,
      cell: (u) => (
        // Gated on the same keys the backend checks, so an operator without
        // them sees no button rather than a 403 after clicking.
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {activeTab === "deleted" ? (
            <>
              {canWrite && (
                <Button size="sm" onClick={async () => { const success = await restoreUser(u.id); if (success) { toast.success("User account restored successfully!"); refetchUsers(); } else toast.error("Failed to restore user account"); }}>Recover</Button>
              )}
              {canDelete && (
                <RowMenu label={`More actions for ${u.email}`} actions={[{ label: "Delete permanently", danger: true, onClick: () => setDeleteConfirm({ type: "permanent", user: u }) }]} />
              )}
            </>
          ) : (
            <>
              {canWrite && (
                <Button variant={u.isActive ? "warning" : "primary"} size="sm" onClick={async () => { const updated = await toggleUserStatus(u.id); if (updated) { toast.success(`User ${updated.isActive ? "activated" : "deactivated"} successfully!`); refetchUsers(); } else toast.error("Failed to toggle user status"); }}>{u.isActive ? "Deactivate" : "Activate"}</Button>
              )}
              <RowMenu label={`More actions for ${u.email}`} actions={[
                ...(canDelete ? [{ label: "Delete", danger: true, onClick: () => setDeleteConfirm({ type: "soft", user: u }) }] : []),
              ]} />
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
        subtitle={listLoading ? (lookup && lookupProgress ? `Searching… ${lookupProgress.loaded.toLocaleString()} of ${lookupProgress.total.toLocaleString()} matches` : lookup ? "Searching…" : "Loading users…") : lookupError ? "Users unavailable" : `${total.toLocaleString()} ${activeTab === "deleted" ? "deleted" : activeTab === "deactivated" ? "deactivated" : "active"} user${total === 1 ? "" : "s"}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "active", label: "Active Users" },
            { key: "deactivated", label: "Deactivated Users" },
            { key: "deleted", label: "Deleted Users" },
          ]}
          active={activeTab}
          onChange={(k) => {
            setActiveTab(k);
            setPage(1);
          }}
        />
        <div className="app-toolbar flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setLookup(lookupDraft.trim()); setPage(1); refetchUsers(); }}>
            <input type="search" aria-label="Search users by name or email" placeholder="Name or email…" className={inputCls + " w-60"} value={lookupDraft} onChange={(e) => setLookupDraft(e.target.value)} />
            <Button type="submit" size="sm" variant="secondary" disabled={listLoading}>Search</Button>
          </form>
          {(lookup || Object.keys(filters).length > 0) && <Button variant="ghost" size="sm" onClick={resetFilters}>Clear all</Button>}
          <Button variant="secondary" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
            <Filter className="h-3.5 w-3.5" />
            Filters
            {Object.keys(filters).length > 0 && (
              <span className="ml-1 rounded-full bg-app-blue/20 px-1.5 text-[10px] text-app-blue-light">{Object.keys(filters).length}</span>
            )}
          </Button>
          <ColumnsButton columns={columns} hidden={hidden} toggleHidden={toggleHidden} />
          <Button size="sm" onClick={exportToCSV} disabled={!!csvExportProgress || listLoading || !!lookupError}>
            {csvExportProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Inline collapsible filter panel (replaces the right drawer) */}
      {filtersOpen && (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-app-navy-card/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Filters</h3>
            <button onClick={() => setFiltersOpen(false)} className="text-ink-faint hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
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
                value={normalizeRegionList(draft.appStoreRegions)}
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
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={draft.accessStatus || ""} onChange={(e) => setDraft({ ...draft, accessStatus: e.target.value })}>
                <option value="">Any</option>
                {SELECTS.accessStatus.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Legacy subscription</label>
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

      {(error || lookupError) && (
        <div className="mt-4 rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">
          {lookupError || error}
        </div>
      )}

      {/* CSV export progress */}
      {csvExportProgress && (
        <div className="mt-4 rounded-xl border border-app-blue/20 bg-app-blue/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-app-blue-light">
            <Loader2 className="h-4 w-4 animate-spin" />
            Exporting users to CSV
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-app-blue transition-all duration-300" style={{ width: `${csvPercent}%` }} />
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
            <>
              <Button variant="danger" size="sm" onClick={() => setBatchConfirm("soft")}>Delete selected</Button>
            </>
          )}
        </BatchBar>
      </div>

      {/* Table */}
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/40">
        {users.length > 0 && <DataTable columns={columns} rows={users} rowKey={(u) => u.id} hidden={hidden} widths={widths} setWidths={setWidths} onRowClick={(u) => setInspecting(u)} selection={{ selectedIds: selected, onToggle: toggleSel, onToggleAll: toggleAllSel }} />}
        <UserSettingsDrawer user={inspecting} onClose={() => setInspecting(null)} />

        {listLoading && users.length === 0 && (
          <div className="flex items-center justify-center py-16 text-ink-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {lookup ? (lookupProgress ? `Searching… ${lookupProgress.loaded.toLocaleString()} of ${lookupProgress.total.toLocaleString()} matches` : "Searching…") : "Loading users…"}
          </div>
        )}
        {!listLoading && !error && !lookupError && users.length === 0 && (
          <div className="p-6">
            <Empty title="No users found" description="Try adjusting or clearing the filters." />
          </div>
        )}

        {/* Pagination */}
        {users.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-sm">
            <div className="text-ink-faint">
              {total.toLocaleString()} total
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-2 py-1.5 text-xs text-ink focus:border-app-blue/45 focus:outline-none"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
              </select>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
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
          ? "This will permanently remove the user and all their data (subscriptions, activity, etc.). This action cannot be undone."
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
          ? "This permanently removes the selected users and all their data (subscriptions, activity, etc.). This cannot be undone."
          : batchConfirm === "recover"
            ? "The selected accounts will be restored to active."
            : "The selected accounts will be deactivated and moved to Deleted Users. You can restore them later."}
      </Modal>
    </div>
  );
};

export default Users;
