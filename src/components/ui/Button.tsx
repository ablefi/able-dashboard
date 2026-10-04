import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "warning";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // `active:scale-[0.97]` is what makes a press feel like a press —
          // without it the only feedback is a colour change, which reads as
          // sluggish. Motion is suppressed for anyone who asks for less of it.
          "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          {
            "bg-jp-blue text-white shadow-md shadow-jp-blue/30 hover:bg-jp-blue-light":
              variant === "primary",
            "border border-slate-200 bg-white text-ink shadow-sm hover:border-slate-300 hover:bg-slate-50":
              variant === "secondary",
            "text-ink-muted hover:bg-slate-100 hover:text-ink": variant === "ghost",
            "bg-rose-500/90 text-white shadow-md shadow-rose-500/20 hover:bg-rose-500":
              variant === "danger",
            "bg-amber-600/80 text-amber-50 hover:bg-amber-600/95": variant === "warning",
          },
          {
            "h-8 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-11 px-6 text-sm": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export default Button;
