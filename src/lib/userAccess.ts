export const ACCESS_STATUS = {
  payer_hard: { label: "Paid Pro", variant: "success" },
  payer_soft: { label: "Paid Pro", variant: "success" },
  payer_free_code: { label: "Paid Pro + grant", variant: "success" },
  free_code: { label: "Granted Pro", variant: "info" },
  region_free: { label: "Region Pro", variant: "info" },
  freemium: { label: "Freemium", variant: "warning" },
  locked_out: { label: "Locked", variant: "danger" },
} as const;

export type AccessStatus = keyof typeof ACCESS_STATUS;

export function accessStatusLabel(status?: string | null): string {
  return status && status in ACCESS_STATUS
    ? ACCESS_STATUS[status as AccessStatus].label
    : status || "Unknown";
}

export function accessStatusVariant(status?: string | null): "success" | "info" | "warning" | "danger" | "default" {
  return status && status in ACCESS_STATUS
    ? ACCESS_STATUS[status as AccessStatus].variant
    : "default";
}
