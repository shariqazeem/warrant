/**
 * OLD LINKS KEEP WORKING. A grant's page moved from /grant/[id] to /g/[id]; every link
 * already shared (receipts, messages, share cards) must still land on it. Receipts did not
 * move, and a redirect that caught them would send every stub somewhere it is not.
 */
import {describe, expect, it} from "vitest";
import config from "../next.config";

describe("redirects", () => {
  it("forwards a grant's old address to its new one, temporarily for now", async () => {
    const redirects = (await config.redirects?.()) ?? [];
    expect(redirects).toContainEqual({source: "/grant/:id", destination: "/g/:id", permanent: false});
  });

  it("leaves receipts, and everything else, where they are", async () => {
    const redirects = (await config.redirects?.()) ?? [];
    expect(redirects.map((r) => r.source)).toEqual(["/grant/:id"]);
  });
});
