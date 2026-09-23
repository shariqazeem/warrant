import type {MetadataRoute} from "next";

/**
 * EVERY PAGE MAY BE READ. A receipt is public on purpose: the point of a stub is that a
 * stranger can open it. Without this file, /robots.txt fell through to the company page and
 * rendered as a company called "robots.txt".
 *
 * The sitemap's address must be absolute, so it is built from SITE_URL exactly as
 * app/layout.tsx builds metadataBase; without it every absolute URL points at localhost.
 */
const SITE_URL = process.env.SITE_URL?.trim() || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: "*", allow: "/"},
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
