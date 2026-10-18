import Login from "@/views/Login";

// Client-only page (auth state lives in the browser) — never prerender.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <Login />;
}
