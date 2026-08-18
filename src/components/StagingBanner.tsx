"use client";

import { useEffect, useState } from "react";

/**
 * Slim "this is staging" bar, fixed to the very top. Renders on every host
 * EXCEPT when NEXT_PUBLIC_ENV is set to "production", so the same code can
 * ship to prod and simply stay hidden there. Keeps you from mistaking the
 * test environment for the real thing.
 */
export default function StagingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const staging = process.env.NEXT_PUBLIC_ENV !== "production";
    setShow(staging);
    // Push the fixed sidebar below the 24px bar so nothing sits under it.
    document.documentElement.classList.toggle("staging-env", staging);
    return () => document.documentElement.classList.remove("staging-env");
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex h-6 items-center justify-center border-b border-amber-400/40 bg-amber-500/90 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-950">
      ⚠ Staging — test environment, not production
    </div>
  );
}
