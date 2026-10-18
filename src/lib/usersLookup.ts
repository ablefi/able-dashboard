import type { User } from "@/api/usersApi";
import type { FetchUsers } from "./usersFanout";

const PAGE = 100;
/** Pages fetched at once. Each backend page takes about 1.5s; one at a time,
 * a common first name (about 3,000 matches) kept the spinner up ~30s. */
const PARALLEL = 8;
/** A backend page that never answers must end the search, not spin forever. */
const REQUEST_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("The search took too long. Please try again, or enter more of the name or email.")), REQUEST_TIMEOUT_MS)),
  ]);
}
const MAX_MATCHES = 5000;

/**
 * Search users by name or email.
 *
 * The backend has two separate filters: `name` matches first name OR last
 * name against the whole string, `email` matches the email. Neither takes a
 * full name, so "Jane Doe" used to find nobody. For a multi-word query we
 * ask the backend for the most specific word (the longest) and keep only
 * people whose name or email contains every word. Never send `search`: the
 * backend ignores it and returns everyone.
 */
export async function lookupUsers(
  fetchUsers: FetchUsers,
  base: Record<string, unknown>,
  regions: string[],
  query: string,
  onProgress?: (loaded: number, total: number) => void,
) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const multiWord = words.length > 1;
  const term = multiWord ? [...words].sort((a, b) => b.length - a.length)[0] : words[0] ?? "";
  const branches = (regions.length ? regions : [undefined]).flatMap((region) =>
    ["name", "email"].map((field) => ({ ...base, ...(region ? { appStoreRegion: region } : {}), [field]: term }))
  );
  const first = await withTimeout(Promise.all(branches.map((params) => fetchUsers({ ...params, page: 1, limit: PAGE }, { silent: true }))));
  if (first.some((result) => !result)) throw new Error("Could not complete the lookup. Please try again.");
  const expected = first.reduce((sum, result) => sum + result!.meta.total, 0);
  if (expected > MAX_MATCHES) {
    throw new Error("Too many matches. Enter more of the name or email, or narrow the filters.");
  }
  const rows = new Map<string, User>();
  const pending: { params: Record<string, unknown>; page: number }[] = [];
  for (let branch = 0; branch < branches.length; branch++) {
    const result = first[branch]!;
    result.data.forEach((row) => rows.set(row.id, row));
    for (let page = 2; page <= Math.ceil(result.meta.total / PAGE); page++) pending.push({ params: branches[branch], page });
  }
  // Name and email branches overlap, so "loaded" counts rows fetched, not
  // distinct users; it still reaches the total the header promised.
  let loaded = first.reduce((sum, result) => sum + result!.data.length, 0);
  onProgress?.(loaded, expected);
  for (let i = 0; i < pending.length; i += PARALLEL) {
    const batch = await withTimeout(Promise.all(pending.slice(i, i + PARALLEL).map(({ params, page }) => fetchUsers({ ...params, page, limit: PAGE }, { silent: true }))));
    if (batch.some((result) => !result)) throw new Error("Could not complete the lookup. Please try again.");
    batch.forEach((result) => result!.data.forEach((row) => rows.set(row.id, row)));
    loaded += batch.reduce((sum, result) => sum + result!.data.length, 0);
    onProgress?.(loaded, expected);
  }
  let found = [...rows.values()];
  if (multiWord) {
    const needles = words.map((word) => word.toLowerCase());
    found = found.filter((user) => {
      const hay = [user.firstName, user.lastName, user.email, user.userProfile?.name].filter(Boolean).join(" ").toLowerCase();
      return needles.every((needle) => hay.includes(needle));
    });
  }
  const dateKey = base.deleted ? "deletedAt" : "createdAt";
  return found.sort((a, b) => String(b[dateKey]).localeCompare(String(a[dateKey])) || a.id.localeCompare(b.id));
}
