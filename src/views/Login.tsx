"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Button from "@/components/ui/Button";
import { DEFAULT_PRESENTATION, readPresentation, type Presentation } from "@/lib/presentation";
import { applyFont, readFont } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-app-navy-light/60 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-app-blue/45 focus:outline-none";

/**
 * Sign in with your own backend admin account.
 *
 * These are real per-person credentials checked by the backend, which then
 * says what you may do. This replaced a flow where everyone authenticated
 * locally and was handed one shared admin token, so the
 * backend could not tell operators apart and each held full super-admin.
 */
const Login: React.FC = () => {
  const { login, loading, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success("Welcome back!");
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed. Please try again.");
    }
  };

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
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
            <input
              className={inputCls}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Password</label>
            <input
              className={inputCls}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in…" : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
