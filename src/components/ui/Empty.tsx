import type { ReactNode } from "react";

/** Styled empty-state. */
export default function Empty({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-jp-navy-card/40 px-6 py-16 text-center backdrop-blur-sm">
      {icon && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-ink-muted">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-xs text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
