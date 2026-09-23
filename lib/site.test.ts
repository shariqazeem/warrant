import {readFileSync} from "node:fs";
import {afterEach, describe, expect, it} from "vitest";
import {siteUrl} from "./site";

const before = process.env.SITE_URL;
afterEach(() => {
  if (before === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = before;
});

describe("siteUrl", () => {
  it("is the configured domain, without a trailing slash", () => {
    process.env.SITE_URL = " https://warrant.world/ ";
    expect(siteUrl()).toBe("https://warrant.world");
  });

  it("falls back to localhost only when nothing is configured", () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("is the only place the pages read it", () => {
    for (const f of ["app/layout.tsx", "app/robots.ts", "app/sitemap.ts"]) {
      expect(readFileSync(f, "utf8")).not.toContain("process.env.SITE_URL");
    }
  });
});
