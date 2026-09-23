/**
 * WHAT A GRANTS PAGE MAY CLAIM.
 *
 * The public endpoint throttles, and every grant is three reads, so a grant that will not
 * read is an ordinary event. The page used to drop it and still head the list "Grants (k)",
 * which is a count the chain does not agree with. These hold the shelf to an honest count,
 * a missing grant to a 404 only when the contract itself says it does not exist, and the
 * words beside a grant to what its terms and the clock actually say.
 */
import {rmSync} from "node:fs";
import {dirname} from "node:path";
import {ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult} from "viem";
import {afterAll, beforeEach, describe, expect, it, vi} from "vitest";

const rpc = vi.hoisted(() => {
  const base = (process.env.TMPDIR ?? "/tmp").replace(/\/?$/, "/");
  process.env.WARRANT_DB_PATH = `${base}warrant-grants-${process.pid}-${Date.now()}/test.db`;
  process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS = "0x5a5af2d85e46b56e8f6de73d273eea9e868c71dc";
  return {
    readContract: (_: {functionName: string; args?: readonly unknown[]}): Promise<unknown> =>
      Promise.reject(new Error("no contract read expected")),
  };
});

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({
    readContract: (call: {functionName: string; args?: readonly unknown[]}) => rpc.readContract(call),
  }),
}));

import {ASSETS} from "./assets";
import {findGrant, grantStanding, parseGrantId, readGrantShelf, readGrants, shelfHeading} from "./grants";
import {grantEscrowAbi} from "./payroll-abi";

afterAll(() => rmSync(dirname(process.env.WARRANT_DB_PATH!), {recursive: true, force: true}));

const DAY = 86_400;
const START = 1_790_000_000;

const noSuchGrant = (id: bigint) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: grantEscrowAbi,
      data: encodeErrorResult({abi: grantEscrowAbi, errorName: "NoSuchGrant"}),
      functionName: "grant",
    }),
    {abi: grantEscrowAbi, functionName: "grant", args: [id], contractAddress: "0x5a5af2d85e46b56e8f6de73d273eea9e868c71dc"},
  );

/** An escrow with `count` grants, where the ids in `refusing` will not read. */
function escrowOf(count: number, refusing: number[] = []) {
  rpc.readContract = async ({functionName, args}) => {
    if (functionName === "grantCount") return BigInt(count);
    const id = args?.[0] as bigint;
    if (id < 1n || id > BigInt(count)) throw noSuchGrant(id);
    if (refusing.includes(Number(id))) throw new Error("HTTP 429: over rate limit");
    if (functionName === "heldUnits") return 5n;
    if (functionName === "releasableUnits") return 1n;
    return {
      payer: "0x00000000000000000000000000000000000000a1",
      beneficiary: "0x00000000000000000000000000000000000000b2",
      asset: ASSETS[0]!.address,
      shares: 10n,
      sharesReleased: 0n,
      stableCost: 25_000_000n,
      start: BigInt(START),
      cliff: 0n,
      duration: BigInt(365 * DAY),
      tipBps: 100,
      isSealed: false,
      revoked: false,
      frozenVestedShares: 0n,
      reasonHash: `0x${"ab".repeat(32)}`,
      state: 1,
    };
  };
}

beforeEach(() => escrowOf(0));

describe("parseGrantId", () => {
  it("takes a grant's id as a link writes it", () => {
    expect(parseGrantId("1")).toBe(1);
    expect(parseGrantId("42")).toBe(42);
    expect(parseGrantId("123456789")).toBe(123_456_789);
  });

  it("refuses anything else, so each grant has one address and junk is a 404", () => {
    for (const raw of ["0", "01", "-1", "1.5", "1e3", " 1", "0x1", "abc", "", "1234567890"]) {
      expect(parseGrantId(raw), raw).toBeNull();
    }
  });
});

describe("findGrant", () => {
  it("is null only when the contract says there is no such grant", async () => {
    escrowOf(2);
    expect(await findGrant(3)).toEqual({ok: true, value: null});
  });

  it("holds, rather than calling the grant missing, when the endpoint refuses", async () => {
    escrowOf(2, [2]);
    const r = await findGrant(2);
    expect(r.ok ? "" : r.why).toMatch(/refusing reads right now, so grant 2 could not be read/);
  });

  it("reads a grant with its live figures", async () => {
    escrowOf(2);
    const r = await findGrant(1);
    expect(r.ok && r.value).toMatchObject({id: 1, heldUnits: 5n, releasableUnits: 1n, state: "open"});
  });
});

describe("readGrantShelf", () => {
  it("keeps every grant it could not read, with the reason, instead of dropping it", async () => {
    escrowOf(4, [3]);
    const r = await readGrantShelf();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.count).toBe(4);
    expect(r.value.asked).toBe(4);
    expect(r.value.grants.map((g) => g.id)).toEqual([4, 2, 1]);
    expect(r.value.unread.map((u) => u.id)).toEqual([3]);
    expect(r.value.unread[0]!.why).toMatch(/refusing reads/);
  });

  it("asks for the newest first, and no more than the limit", async () => {
    escrowOf(5);
    const r = await readGrantShelf(2);
    expect(r.ok && r.value.grants.map((g) => g.id)).toEqual([5, 4]);
    expect(r.ok && r.value.asked).toBe(2);
  });

  it("still gives the keeper the grants that read", async () => {
    escrowOf(3, [1]);
    const r = await readGrants();
    expect(r.ok && r.value.map((g) => g.id)).toEqual([3, 2]);
  });
});

describe("shelfHeading", () => {
  const shelf = (count: number, asked: number, read: number) => ({
    count,
    asked,
    grants: Array.from({length: read}) as never[],
  });

  it("counts them when every one was read", () => {
    expect(shelfHeading(shelf(3, 3, 3))).toBe("Grants (3)");
    expect(shelfHeading(shelf(0, 0, 0))).toBe("Grants (0)");
  });

  it("says when it shows only the newest", () => {
    expect(shelfHeading(shelf(80, 50, 50))).toBe("The newest 50 of 80 grants");
  });

  it("never heads a partial list with a total", () => {
    expect(shelfHeading(shelf(4, 4, 3))).toBe("3 of 4 grants could be read");
    expect(shelfHeading(shelf(80, 50, 47))).toBe("47 of the newest 50 grants could be read");
    expect(shelfHeading(shelf(2, 2, 0))).toBe("0 of 2 grants could be read");
  });
});

describe("grantStanding", () => {
  const terms = {
    state: "open" as const,
    revoked: false,
    isSealed: false,
    start: START,
    cliffSeconds: 365 * DAY,
    durationSeconds: 4 * 365 * DAY,
  };
  const cliffAt = START + 365 * DAY;
  const endsAt = START + 4 * 365 * DAY;

  it("is vesting before the cliff, and names the day it passes", () => {
    const s = grantStanding(terms, START + DAY);
    expect(s.kind).toBe("before-cliff");
    expect(s.label).toBe("Vesting");
    expect(s.words).toContain("cliff on 21 Sep 2027");
    expect(s.words).toContain("The company can still cancel the part that has not vested yet.");
  });

  it("is vesting after the cliff, until the day it ends", () => {
    const s = grantStanding(terms, cliffAt);
    expect(s.kind).toBe("vesting");
    expect(s.words).toContain("fully vested on 20 Sep 2030");
  });

  it("is fully vested from the last second on, and nothing is left to cancel", () => {
    const s = grantStanding(terms, endsAt);
    expect(s.kind).toBe("fully-vested");
    expect(s.label).toBe("Fully vested");
    expect(s.words).not.toContain("cancel");
  });

  it("has not started when its start is still ahead", () => {
    expect(grantStanding(terms, START - 1).kind).toBe("not-started");
  });

  it("says a sealed grant cannot be cancelled by anyone", () => {
    const s = grantStanding({...terms, isSealed: true}, START + DAY);
    expect(s.irrevocable).toBe(true);
    expect(s.words).toContain("nobody can cancel it, including the company");
    expect(s.words).not.toContain("can still cancel");
  });

  it("keeps the promise a cancel makes: what had vested stays theirs", () => {
    const s = grantStanding({...terms, revoked: true}, START + 2 * 365 * DAY);
    expect(s.kind).toBe("cancelled");
    expect(s.words).toMatch(/What had vested by then stays theirs/);
    expect(s.words).toMatch(/Nothing more will vest/);
  });

  it("is closed once closed, whatever the clock says", () => {
    expect(grantStanding({...terms, state: "closed"}, START).kind).toBe("closed");
    const cancelled = grantStanding({...terms, state: "closed", revoked: true}, endsAt);
    expect(cancelled.words).toMatch(/It was cancelled/);
  });
});
