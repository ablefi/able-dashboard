import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "react-toastify/dist/ReactToastify.css";
import "@/index.css";
import "./globals.css";
import { Providers } from "./providers";
import StagingBanner from "@/components/StagingBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Able Ops",
  description: "Able internal operations dashboard",
  // Private admin tool — never index, anywhere (staging or prod).
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  icons: {
    icon: "/able-mark.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

/**
 * Force dynamic rendering for the whole app — runtime-auth admin dashboard
 * with no static content (matches jp-creators).
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <StagingBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
