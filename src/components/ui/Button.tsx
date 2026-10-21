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
        data-variant={variant}
        className={cn(
          // `active:scale-[0.97]` is what makes a press feel like a press —
          // without it the only feedback is a colour change, which reads as
          // sluggish. Motion is suppressed for anyone who asks for less of it.
          "inline-flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-xl font-medium tracking-[-0.005em]",
          "transition-[background,border-color,box-shadow,transform,color] duration-150 ease-out",
          "active:scale-[0.97] motion-reduce:active:scale-100",
          "outline-none focus-visible:ring-2 focus-visible:ring-app-blue-light/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app-navy",
          "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none",
          {
            // Filled buttons DEEPEN on hover and throw more glow. The previous
            // pass claimed to do this but the hover gradient actually started
            // LIGHTER than the base (#4b8dfa vs #3b82f6), so the fill washed
            // out at the exact moment you reached for it — the cheap-feeling
            // hover the owner kept catching. Now it saturates instead, and the
            // coloured shadow does the lifting. Both gradient stops go darker
            // on hover, not just the lower one — a top stop that brightens is
            // still read as "washing out" even when the overall fill deepens.
            "bg-gradient-to-b from-app-blue to-[#2b66cf] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.16)_inset,0_2px_10px_-3px_rgba(59,130,246,0.6)] hover:from-[#2f6fe0] hover:to-[#1c4fae] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.2)_inset,0_8px_22px_-6px_rgba(59,130,246,0.85)] active:shadow-[0_1px_3px_0_rgba(0,0,0,0.35)_inset]":
              variant === "primary",
            "border border-white/[0.12] bg-white/[0.05] text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] hover:border-app-blue/35 hover:bg-app-blue/[0.1] hover:text-ink hover:shadow-[0_1px_0_0_rgba(255,255,255,0.09)_inset,0_6px_16px_-8px_rgba(0,0,0,0.7)]":
              variant === "secondary",
            "text-ink-muted hover:bg-white/[0.07] hover:text-ink": variant === "ghost",
            "bg-gradient-to-b from-app-red to-[#a80205] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_2px_8px_-2px_rgba(244,63,94,0.5)] hover:from-app-red hover:to-app-red hover:shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_6px_16px_-4px_rgba(244,63,94,0.6)]":
              variant === "danger",
            "bg-gradient-to-b from-app-orange to-[#c25a12] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_2px_8px_-2px_rgba(245,158,11,0.45)] hover:from-app-orange hover:to-app-orange":
              variant === "warning",
          },
          {
            // A step taller and roomier than before — the old set read as
            // controls squeezed to fit rather than things built to be pressed.
            "h-[2.125rem] px-3.5 text-[0.8125rem]": size === "sm",
            "h-[2.5rem] px-[1.125rem] text-[0.875rem]": size === "md",
            "h-[2.875rem] px-7 text-[0.9375rem]": size === "lg",
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
