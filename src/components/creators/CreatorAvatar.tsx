"use client";

import { useEffect, useState } from "react";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-16 w-16 text-xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Round creator avatar: image with one cache-busting retry, then initials
 * fallback. Native <img> (creator avatars come from many CDNs we don't
 * allowlist) with referrerPolicy="no-referrer" so IG/TT CDNs serve them.
 */
export function CreatorAvatar({ name, src, size = "md" }: { name: string; src: string | null | undefined; size?: AvatarSize }) {
  const [errorCount, setErrorCount] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setErrorCount(0); setRetry(0); }, [src]);

  const initials = name.split(/\s+/).map((p) => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("");
  const cls = "inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold overflow-hidden ring-1 ring-jp-blue/20 " + SIZES[size];
  const href = src ? (retry > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${retry}` : src) : null;

  if (href && errorCount < 2) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${href}::${retry}`}
        src={href}
        alt=""
        className={cls + " object-cover"}
        referrerPolicy="no-referrer"
        onError={() => { setErrorCount((n) => n + 1); if (errorCount === 0) setTimeout(() => setRetry(Date.now()), 350); }}
      />
    );
  }
  return <span className={cls + " bg-gradient-to-br from-jp-blue to-jp-blue-dark text-white"}>{initials || "?"}</span>;
}
