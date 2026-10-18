import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon?: LucideIcon;
}

/** Headline stat card — big number, soft border, thin blue gradient hairline. */
export default function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="app-stat relative overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/60 p-6 backdrop-blur-sm transition-colors hover:border-app-blue/20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-app-blue/40 to-transparent" />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-ink-faint" />}
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none tracking-tight text-ink num">
        {value}
      </div>
      {change && (
        <div
          className={cn("mt-3 text-xs font-medium", {
            "text-app-green": changeType === "up",
            "text-app-red-text": changeType === "down",
            "text-ink-faint": changeType === "neutral",
          })}
        >
          {change}
        </div>
      )}
    </div>
  );
}
