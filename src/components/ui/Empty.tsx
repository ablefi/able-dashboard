import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Styled empty-state. */
export default function Empty({
  title,
  description,
  icon,
  action,
  compact = false,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** For an empty state INSIDE a card or a chart well. The full block is sized
   *  for a whole page and would force a 280px chart card to twice its height,
   *  which is why these were all hand-rolled one-liners instead. */
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex h-full flex-col items-center justify-center px-6 py-8 text-center"
          : "flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-app-navy-card/40 px-6 py-16 text-center backdrop-blur-sm"
      }
    >
      {(!compact || icon) && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-ink-muted">
          {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
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
