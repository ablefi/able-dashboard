"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AdminSettingsLink({ className, label = false }: { className: string; label?: boolean }) {
  const { can } = useAuth();
  const pathname = usePathname();
  if (!can("admins:read")) return null;
  return <Link href="/admins" title="Admin Settings" aria-label="Admin Settings" className={className + (pathname.startsWith("/admins") ? " is-on" : "")}>
    <ShieldCheck className="h-4 w-4 shrink-0" />
    {label && <span>Admins</span>}
  </Link>;
}
