/**
 * Subscription-status + cancel-reason catalogs for the backend's
 * `GET /admin/users` API. Client-safe (labels, colors, badge variants — no
 * secrets). The VALUES must match the backend enums exactly — it validates
 * with @IsEnum and 400s anything else, so never invent new strings here.
 *
 * ⚠️ The 5-value subscription enum ships on the STAGING backend first; keep
 * dashboard changes that send these values off production until the backend team's
 * prod backend has them (old prod expects active/former/never).
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
 * Fixed catalog: order, label, chart colour. The colours are one hue stepping
 * down in lightness, not six separate hues.
 *
 * The previous set was six distinct hues chosen for colourblind safety. This
 * is safer, not looser: lightness is the channel colour vision deficiency
 * leaves intact, so a monotonic ramp separates reliably for everyone, and it
 * stops the chart reading like a legend of unrelated colours.
 *
 * They're CSS variables rather than literals so they follow the accent hue
 * when the theme changes.
 */
export const CANCEL_REASONS: { value: CancelReason; label: string; color: string }[] = [
  { value: "too_expensive", label: "Too expensive", color: "var(--color-cat-6)" },
  { value: "not_using_the_app", label: "Not using the app", color: "var(--color-cat-5)" },
  { value: "reached_my_goals", label: "Reached my goals", color: "var(--color-cat-4)" },
  { value: "too_many_bugs", label: "Too many bugs", color: "var(--color-cat-3)" },
  { value: "missing_features", label: "Missing features", color: "var(--color-cat-2)" },
  { value: "other", label: "Other", color: "var(--color-cat-1)" },
];

export const CANCEL_REASON_LABELS: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.label])
);
export const CANCEL_REASON_COLORS: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.color])
);
