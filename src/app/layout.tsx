import type { Metadata, Viewport } from "next";
import { Inter, Manrope, IBM_Plex_Sans, Figtree } from "next/font/google";
import "react-toastify/dist/ReactToastify.css";
import "@/index.css";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The alternatives offered in the theme picker.
 *
 * `preload: false` on purpose: only Inter is on the critical path. Without it
 * every page load would fetch all four alternates to satisfy a choice almost
 * nobody has made.
 */
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap", preload: false });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: `${BRAND.name} Admin`,
  description: `${BRAND.name} internal admin dashboard`,
  // Private admin tool — never index, anywhere (staging or prod).
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#101A30",
};

/**
 * Force dynamic rendering for the whole app — runtime-auth admin dashboard
 * with no static content (matches roster).
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The font variables sit on <html>, not <body>: applyFont() sets
    // --font-sans on the root, and a var() there cannot see a property that
    // was only declared on body.
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${plex.variable} ${figtree.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
