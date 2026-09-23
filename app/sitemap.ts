import type {MetadataRoute} from "next";
import {siteUrl} from "@/lib/site";

/**
 * THE DOORS. The records — receipts, runs, grants, companies — are reached from them and
 * from the links people share; there is no list of them to publish, and a list of every
 * wallet ever paid is not something a payroll should hand to a crawler.
 *
 * Absolute, from SITE_URL, as app/layout.tsx and app/robots.ts read it.
 */
const SITE_URL = siteUrl();

const DOORS = ["/", "/pay", "/run", "/grants"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return DOORS.map((path) => ({url: new URL(path, SITE_URL).toString()}));
}
