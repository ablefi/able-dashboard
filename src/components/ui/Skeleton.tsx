import React from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder shapes shown while data loads.
 *
 * A spinner says "wait" and nothing else, so the page snaps from empty to full
 * and reads as slower than it is even when the timing is identical. A skeleton
 * commits to the shape first: the columns, the number of rows, where the
 * headline figure sits. Nothing moves when the data lands.
 *
 * Deliberately no shimmer sweep. At this density it draws the eye to the
 * loading state rather than to the page arriving.
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} style={style} />;
}

/** A table's shape: header rule, then rows. `cols` should match the real
 *  column count so nothing shifts sideways when the data replaces it. */
export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/40">
      <div className="flex gap-4 border-b border-white/[0.06] px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-white/[0.04] px-4 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            // Varying widths stop it reading as graph paper. The first column
            // is usually a name, so it gets the wider shape.
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 ? "opacity-90" : "opacity-60")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of stat cards. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 p-6">
          <Skeleton className="mb-3 h-2.5 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A chart well, so the card does not collapse then reflow. */
export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }}>
      {[45, 70, 55, 85, 60, 95, 75, 50, 80, 65, 90, 58].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
