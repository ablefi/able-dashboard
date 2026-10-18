import type { ReactNode } from "react";

/** Light grouping for operational forms; no extra card or nested modal. */
export default function FormSection({ title, children, disabled }: { title: string; children: ReactNode; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <legend className="mb-3 w-full p-0 text-sm font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}
