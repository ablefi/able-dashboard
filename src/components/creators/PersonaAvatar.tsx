"use client";

import { CreatorAvatar, type AvatarSize } from "./CreatorAvatar";

const SIZES: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-16 w-16 text-xl",
};
const OVERLAP: Record<AvatarSize, string> = { xs: "-ml-1.5", sm: "-ml-2", md: "-ml-2.5", lg: "-ml-3", xl: "-ml-4" };

interface AccountLite { id?: string; name: string; profile_image_url: string | null }

/**
 * Persona avatar: composites up to 3 child-account avatars (overlapping)
 * with a +N pill when there are more. Purple initials fallback when the
 * persona has no accounts. Ported from jp-creators' PersonaAvatar.
 */
export function PersonaAvatar({ name, size = "md", accounts }: { name: string; size?: AvatarSize; accounts: AccountLite[] }) {
  if (accounts.length === 0) {
    const initials = name.split(/\s+/).map((p) => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("");
    return (
      <span className={"inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-jp-purple/30 bg-gradient-to-br from-jp-purple to-jp-purple/60 " + SIZES[size]}>
        {initials || "?"}
      </span>
    );
  }
  if (accounts.length === 1) {
    return <CreatorAvatar name={accounts[0].name} src={accounts[0].profile_image_url} size={size} />;
  }
  const visible = accounts.slice(0, Math.min(3, accounts.length));
  const extra = accounts.length - visible.length;
  return (
    <div className="inline-flex flex-shrink-0 items-center">
      {visible.map((a, i) => (
        <div key={a.id ?? i} className={"relative rounded-full ring-2 ring-jp-navy " + (i === 0 ? "" : OVERLAP[size])} style={{ zIndex: visible.length - i }}>
          <CreatorAvatar name={a.name} src={a.profile_image_url} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <span className={"inline-flex items-center justify-center rounded-full bg-jp-purple/20 font-semibold text-jp-purple ring-2 ring-jp-navy " + SIZES[size] + " " + OVERLAP[size]} style={{ zIndex: 0 }}>
          +{extra}
        </span>
      )}
    </div>
  );
}
