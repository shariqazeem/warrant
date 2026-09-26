import {describe, expect, it} from "vitest";
import {TEAM_WALLETS, allTeam, isTeam} from "./team";

describe("Warrant's own wallets", () => {
  it("are whole addresses, written in lower case so a lookup cannot miss on checksum case", () => {
    for (const a of Object.keys(TEAM_WALLETS)) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("are recognised however an address is cased", () => {
    expect(isTeam("0xD5FE7c38AE5b0F93A51b4833c70B4D1cfd05125B")).toBe(true);
    expect(isTeam("0xd5fe7c38ae5b0f93a51b4833c70b4d1cfd05125b")).toBe(true);
  });

  it("never mark someone else's wallet, or nothing, as the team's", () => {
    expect(isTeam("0x0000000000000000000000000000000000000001")).toBe(false);
    expect(isTeam(null)).toBe(false);
    expect(isTeam("")).toBe(false);
  });

  it("call a payment a test only when every wallet in it is the team's", () => {
    const company = "0xD5FE7c38AE5b0F93A51b4833c70B4D1cfd05125B";
    const second = "0x223ED5D8c837dBDF38391147bB054cE7ce599d11";
    expect(allTeam([company, second])).toBe(true);
    expect(allTeam([company, "0x0000000000000000000000000000000000000001"])).toBe(false);
    expect(allTeam([])).toBe(false);
  });
});
