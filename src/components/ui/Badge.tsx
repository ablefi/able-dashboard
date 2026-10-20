import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-app-navy-light text-ink-muted",
  success: "bg-app-green/15 text-app-green",
  warning: "bg-app-orange/15 text-app-orange",
  danger: "bg-app-red/20 text-app-red-text",
  info: "bg-app-blue/15 text-app-blue-light",
  purple: "bg-app-violet/20 text-app-violet-text",
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
        "app-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {variant !== "default" && <span aria-hidden className="mr-1.5 text-[10px]">{variant === "success" ? "✓" : variant === "warning" ? "!" : variant === "danger" ? "×" : "•"}</span>}{children}
    </span>
  );
}
