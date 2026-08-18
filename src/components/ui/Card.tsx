import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Surface card matching the navy aesthetic. Optional title header. */
export default function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06] bg-jp-navy-card/60 backdrop-blur-sm",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}
