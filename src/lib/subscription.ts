/**
 * Subscription-status + cancel-reason catalogs for the backend's
 * `GET /admin/users` API. Client-safe (labels, colors, badge variants — no
 * secrets). The VALUES must match the backend enums exactly — it validates
 * with @IsEnum and 400s anything else, so never invent new strings here.
 *
 * ⚠️ These values are carried over from the original build and must be
 * reconciled with Able's own backend enums before the Users and Revenue pages
 * are relied on.
 */

export type SubscriptionStatus =
  | "ACTIVE"
  | "ACTIVE_WITH_FREE_CODE"
  | "FORMER"
  | "FORMER_WITH_FREE_CODE"
  | "NEVER";

export const SUBSCRIPTION_STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ACTIVE_WITH_FREE_CODE", label: "Active (free code)" },
  { value: "FORMER", label: "Former" },
  { value: "FORMER_WITH_FREE_CODE", label: "Former (free code)" },
  { value: "NEVER", label: "Never" },
];

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  SUBSCRIPTION_STATUS_OPTIONS.map((o) => [o.value, o.label])
);

/** Badge variant per status (Badge component variants). */
export const SUBSCRIPTION_STATUS_BADGE: Record<SubscriptionStatus, "success" | "info" | "warning" | "purple" | "default"> = {
  ACTIVE: "success",
  ACTIVE_WITH_FREE_CODE: "info",
  FORMER: "warning",
  FORMER_WITH_FREE_CODE: "purple",
  NEVER: "default",
};

export type CancelReason =
  | "too_expensive"
  | "not_using_the_app"
  | "reached_my_goals"
  | "too_many_bugs"
  | "missing_features"
  | "other";

/**
 * Fixed catalog: order, label, chart color. Colors are brand-family hues
 * validated as a set for the dark card surface (#15203a) — all-pairs
 * colorblind-safe (worst ΔE 13.4), in the lightness band, ≥3:1 contrast —
 * so the donut can sort slices by count without creating unsafe neighbors.
 * (jp-purple is deliberately absent: vs jp-blue it's deutan ΔE 1.9.)
 */
export const CANCEL_REASONS: { value: CancelReason; label: string; color: string }[] = [
  { value: "too_expensive", label: "Too expensive", color: "#d97706" },
  { value: "not_using_the_app", label: "Not using the app", color: "#3b82f6" },
  { value: "reached_my_goals", label: "Reached my goals", color: "#0d9488" },
  { value: "too_many_bugs", label: "Too many bugs", color: "#f43f5e" },
  { value: "missing_features", label: "Missing features", color: "#d55181" },
  { value: "other", label: "Other", color: "#0891b2" },
];

export const CANCEL_REASON_LABELS: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.label])
);
export const CANCEL_REASON_COLORS: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.color])
);
