import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionFromCookie } from "@/lib/auth";
import { authSettings } from "@/lib/google-auth";
import AuthedShell from "@/components/layout/AuthedShell";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  let name: string;
  try { name = authSettings().sessionCookie; }
  catch { redirect("/login"); }
  const session = await sessionFromCookie((await cookies()).get(name)?.value);
  if (!session) redirect("/login");
  return <AuthedShell>{children}</AuthedShell>;
}
