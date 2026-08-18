/**
 * Device platform catalog for the backend's `platforms` field/filter on
 * `GET /admin/users`.
 *
 * A user's `platforms` is an ARRAY — distinct platforms across their active
 * sessions ∪ active devices — so someone with an iPhone and an Android phone
 * shows both. Empty array = no active session/device on record.
 *
 * NOT the same as auth type (Google/Apple/Email): plenty of iPhone users
 * sign in with Google, so `appleId` says nothing about the device.
 *
 * ⚠️ The `platforms` filter + field exist on the STAGING backend only. On
 * production the query param is silently IGNORED (returns everyone
 * unfiltered), so this UI must not ship to prod until it's promoted.
 */

export type Platform = "ios" | "android" | "web";

/** Static options — the doc is explicit that there's no endpoint for these. */
export const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "web", label: "Web" },
];

export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map((o) => [o.value, o.label])
);

/** Badge variant per platform (matches the Badge component's variants). */
export const PLATFORM_BADGE: Record<string, "info" | "success" | "default"> = {
  ios: "info",
  android: "success",
  web: "default",
};

export function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}

/** "iOS + Android" — for CSV/plain-text contexts. */
export function platformsText(platforms: string[] | null | undefined): string {
  const list = (platforms ?? []).filter(Boolean);
  return list.length ? list.map(platformLabel).join(" + ") : "-";
}
