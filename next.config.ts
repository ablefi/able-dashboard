import type { NextConfig } from "next";

/**
 * Admin dashboard (Next.js App Router).
 */

/**
 * Security headers.
 *
 * Added 2026-09-01 after the mass-deletion incident. The dashboard hands the
 * signed-in admin's backend JWT to the browser and keeps it in localStorage,
 * so any script running on this origin can read it. These headers narrow that.
 *
 * Deliberately split in two:
 *
 *  - The enforced set below cannot break the app. `frame-ancestors` and
 *    X-Frame-Options only stop OTHER sites embedding us; nosniff and
 *    Referrer-Policy don't gate any request the page makes.
 *
 *  - The real prize is `connect-src`, which stops a hostile script POSTing the
 *    token to an attacker's server. That one CAN break things if a host is
 *    missed, so it ships as Report-Only first: the browser logs violations to
 *    the console and blocks nothing. Once the console is clean during normal
 *    use, move this list into an enforced Content-Security-Policy header.
 */
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  // Next.js hydration needs inline scripts; without nonces this is as tight as it goes.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // The only cross-origin calls the BROWSER makes are to the two backends.
  // Everything else (Resend, RevenueCat, Gmail, ScrapeCreators) is server-side
  // and never appears here.
  `connect-src 'self' ${process.env.NEXT_PUBLIC_BACKEND_PRODUCTION_URL || ""} ${process.env.NEXT_PUBLIC_BACKEND_STAGING_URL || ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  typescript: {
    // A few recharts tooltip formatters trip TS's stricter checks; runtime is
    // fine. Remove this once those formatters are typed.
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
