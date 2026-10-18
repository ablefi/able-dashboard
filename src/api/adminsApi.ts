import { useCallback, useState } from "react";
import { useAxios } from "./axiosInstance";

/**
 * Admin accounts and the permission catalog.
 *
 * These are the BACKEND's admins — the real identities operators sign in as —
 * not the dashboard's old local user list. Every call needs the caller's own
 * permissions (`admins:read` / `admins:write` / `admins:delete`); the backend
 * enforces them and returns 403 with the missing key named, so the UI gating
 * around these screens is a courtesy, not the guard.
 */

export interface AdminAccount {
  id: string;
  email: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionRow {
  id: string;
  key: string;
  description: string | null;
  /** Seeded by the backend — cannot be renamed or deleted. */
  isSystem: boolean;
}

/** Unwrap the backend's inconsistent list shapes. */
const rows = <T,>(d: unknown): T[] => (Array.isArray(d) ? d : ((d as { data?: T[] })?.data ?? []));

export const useAdminsApi = () => {
  const axios = useAxios();
  const [error, setError] = useState<string | null>(null);

  /** Surface the backend's own message — it names the missing permission. */
  const fail = (err: unknown): null => {
    const e = err as { response?: { data?: { message?: string | string[] } } };
    const m = e.response?.data?.message;
    setError(Array.isArray(m) ? m.join(", ") : (m ?? "Something went wrong"));
    return null;
  };

  const lastError = () => error;

  const listAdmins = useCallback(async (): Promise<AdminAccount[] | null> => {
    setError(null);
    try {
      return rows<AdminAccount>((await axios.get("/admin/admins")).data);
    } catch (err) {
      return fail(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axios]);

  const createAdmin = useCallback(
    async (body: { email: string; password: string; isActive: boolean; permissions: string[] }): Promise<AdminAccount | null> => {
      setError(null);
      try {
        return (await axios.post("/admin/admins", body)).data as AdminAccount;
      } catch (err) {
        return fail(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  /** Never send a password here — the backend has separate endpoints for that. */
  const updateAdmin = useCallback(
    async (id: string, body: { email?: string; isActive?: boolean; permissions?: string[] }): Promise<AdminAccount | null> => {
      setError(null);
      try {
        return (await axios.patch(`/admin/admins/${id}`, body)).data as AdminAccount;
      } catch (err) {
        return fail(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  const deleteAdmin = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      try {
        await axios.delete(`/admin/admins/${id}`);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  /** Any signed-in admin, no permission key required. */
  const changeOwnPassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<boolean> => {
      setError(null);
      try {
        await axios.post("/admin/admins/me/change-password", { currentPassword, newPassword });
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  /** Super admin only — checked on the backend, not by a permission key. */
  const setPasswordFor = useCallback(
    async (id: string, newPassword: string): Promise<boolean> => {
      setError(null);
      try {
        await axios.post(`/admin/admins/${id}/set-password`, { newPassword });
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  const listPermissions = useCallback(async (): Promise<PermissionRow[] | null> => {
    setError(null);
    try {
      return rows<PermissionRow>((await axios.get("/admin/permissions")).data);
    } catch (err) {
      return fail(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axios]);

  const createPermission = useCallback(
    async (key: string, description: string): Promise<PermissionRow | null> => {
      setError(null);
      try {
        return (await axios.post("/admin/permissions", { key, description })).data as PermissionRow;
      } catch (err) {
        return fail(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  const updatePermission = useCallback(
    async (id: string, body: { key?: string; description?: string }): Promise<PermissionRow | null> => {
      setError(null);
      try {
        return (await axios.patch(`/admin/permissions/${id}`, body)).data as PermissionRow;
      } catch (err) {
        return fail(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  const deletePermission = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      try {
        await axios.delete(`/admin/permissions/${id}`);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axios]
  );

  return {
    lastError,
    listAdmins,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    changeOwnPassword,
    setPasswordFor,
    listPermissions,
    createPermission,
    updatePermission,
    deletePermission,
  };
};

/** Group catalog keys by their `resource:` prefix, for a readable checklist. */
export function groupPermissions(list: PermissionRow[]): { resource: string; rows: PermissionRow[] }[] {
  const map = new Map<string, PermissionRow[]>();
  for (const p of list) {
    const resource = p.key.split(":")[0] ?? p.key;
    if (!map.has(resource)) map.set(resource, []);
    map.get(resource)!.push(p);
  }
  return [...map.entries()]
    .map(([resource, rows]) => ({ resource, rows: rows.sort((a, b) => a.key.localeCompare(b.key)) }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}
