import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-white/[0.04] text-ink-muted",
  success: "bg-emerald-500/15 text-emerald-300",
  warning: "bg-amber-500/15 text-amber-300",
  danger: "bg-rose-500/15 text-rose-300",
  info: "bg-jp-blue/15 text-jp-blue-light",
  purple: "bg-jp-purple/15 text-jp-purple",
};

export default function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
