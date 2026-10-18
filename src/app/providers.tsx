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
      {/* 3s was quick enough to miss a message you'd only half-registered.
          Styling lives in globals.css so toast() call sites stay plain. */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        theme="dark"
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        hideProgressBar={false}
      />
    </AuthProvider>
  );
}
