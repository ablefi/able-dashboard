"use client";

import { ToastContainer } from "react-toastify";
import { AuthProvider } from "@/context/AuthContext";

/**
 * Client provider tree: the JWT AuthProvider + the toast host. (Ant Design
 * is fully removed now — the whole admin is on our Tailwind component system,
 * so there's no ConfigProvider / React-19 patch needed anymore.)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />
    </AuthProvider>
  );
}
