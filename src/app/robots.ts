import type { MetadataRoute } from "next";

/**
 * Blanket "go away" for all crawlers — this is a private admin dashboard,
 * never meant to appear in search results on any host (staging or the
 * the dashboard domain). Pairs with the `robots: noindex` metadata
 * in layout.tsx.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
