/**
 * THE PUBLIC ADDRESS, FOR EVERY ABSOLUTE URL THE SITE ADVERTISES: share cards, robots.txt,
 * the sitemap. One place, because the three used to read it separately, and a copy that
 * drifts sends a crawler or a share card to the wrong host.
 *
 * Without it Next.js falls back to http://localhost:3000, which is how every share card on
 * the live site once pointed at localhost. Set SITE_URL to the domain the site is served on.
 */
export function siteUrl(): string {
  return (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}
