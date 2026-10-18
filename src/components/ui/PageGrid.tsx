import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Two-region page composition.
 *
 * This is the thing the dashboard did not have. 22 of 33 views are a single
 * `space-y-*` vertical stack, and only two compose anything side by side — so
 * a wider window did not give us more information on screen, it just made the
 * same column wider. That is why removing the sidebar felt unadapted rather
 * than roomy: there was nothing structural to spend the width on.
 *
 * `main` takes the thing the page is actually about; `aside` takes the context
 * that used to be stacked underneath it and pushed below the fold. Below `lg`
 * it collapses back to a stack, so narrow windows are unaffected.
 *
 * `aside` is a fixed rem width rather than a fraction on purpose: a percentage
 * aside grows with the window and ends up a second main column, which is how
 * side-by-side layouts stop reading as primary-and-supporting.
 */
export default function PageGrid({
  children,
  aside,
  asideWidth = "22rem",
  asideFirst = false,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** Fixed track for the context column. */
  asideWidth?: string;
  /** Put the context column on the left, for pages where it is a filter rail. */
  asideFirst?: boolean;
  className?: string;
}) {
  if (!aside) return <div className={cn("min-w-0", className)}>{children}</div>;

  return (
    <div
      className={cn("grid min-w-0 items-start gap-4 lg:grid-cols-[var(--app-main)_var(--app-aside)]", className)}
      style={
        {
          "--app-main": "minmax(0,1fr)",
          "--app-aside": asideWidth,
        } as React.CSSProperties
      }
    >
      <div className={cn("min-w-0", asideFirst && "lg:order-2")}>{children}</div>
      <div className={cn("min-w-0 lg:sticky lg:top-4", asideFirst && "lg:order-1")}>{aside}</div>
    </div>
  );
}
