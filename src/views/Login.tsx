"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import Button from "@/components/ui/Button";
import { DEFAULT_PRESENTATION, readPresentation, type Presentation } from "@/lib/presentation";
import { applyFont, readFont } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";

const Login: React.FC = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(new URLSearchParams(window.location.search).has("error")); }, []);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  /**
   * The sign-in screen sits outside the authed shell, so it never picked up
   * the presentation or the font and was the one screen still wearing the old
   * chrome. It reads the same two preferences rather than hard-coding a look,
   * so switching modes changes the front door with everything else.
   */
  const [presentation, setPresentation] = useState<Presentation>(DEFAULT_PRESENTATION);
  useEffect(() => {
    setPresentation(readPresentation());
    applyFont(readFont());
  }, []);

  return (
    <div
      className="app-shell flex min-h-screen items-center justify-center bg-app-navy px-4 text-ink"
      data-presentation={presentation}
    >
      <div className="app-card w-full max-w-sm rounded-2xl border border-white/[0.08] bg-app-navy-card/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/icon-200.png" alt={BRAND.name} width={48} height={48} className="rounded-xl" />
          <div>
            <div className="text-lg font-semibold text-ink">{BRAND.name} Admin</div>
            <div className="text-xs text-ink-faint">Sign in to continue</div>
          </div>
        </div>
        <div className="space-y-4">
          <p className="text-center text-sm text-ink-muted">Use your @able.finance Google Workspace account.</p>
          {failed && <p role="alert" className="text-sm text-ink-muted">Sign-in was unsuccessful. Choose your Able Google account and try again. If it still fails, contact your dashboard administrator.</p>}
          <Button type="button" size="lg" className="w-full" onClick={() => window.location.assign("/api/auth/google")}>
            Sign in with Google
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Login;
