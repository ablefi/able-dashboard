import { cn } from "@/lib/utils";

/**
 * A literal value someone types, copies or quotes: a referral code, a currency,
 * a product id.
 *
 * These were rendered with `<Badge variant="info">`, the same component as the
 * Active/Inactive pills. That is right for a status — a small set of known
 * states, where the colour IS the meaning — and wrong for a value, where the
 * characters are the meaning and a coloured pill implies a state that does not
 * exist. Monospace also stops similar codes (test6 / testa / tests) blurring
 * into each other, which a proportional face does at this size.
 */
export default function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-white/[0.05] px-1.5 py-0.5",
        "font-mono text-[0.75rem] tracking-tight text-app-blue-light",
        className
      )}
    >
      {children}
    </span>
  );
}
