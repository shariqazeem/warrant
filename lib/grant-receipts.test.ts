/**
 * A GRANT PRINTS ONLY WHAT ITS TRANSACTIONS BACK.
 *
 * Decoding is the easy half. The half that matters is refusal: a lookalike event from a
 * contract that is not the escrow, an opening whose route spent nothing, a vest belonging to
 * a grant nobody has confirmed, a cached row pointing at some other grant. Each of those
 * would print a stub anchored to a real transaction that says something untrue.
 *
 * The chain is stubbed at viem's client and the cache is a throwaway SQLite file, so the
 * readers are exercised end to end without touching X Layer.
 */
import {rmSync} from "node:fs";
import {dirname} from "node:path";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  getAddress,
  parseAbiItem,
  toEventSignature,
  type AbiEvent,
} from "viem";
import {afterAll, beforeEach, describe, expect, it, vi} from "vitest";

const rpc = vi.hoisted(() => {
  // Before any import reads them: the cache must never be the repo's own file.
  const base = (process.env.TMPDIR ?? "/tmp").replace(/\/?$/, "/");
  process.env.WARRANT_DB_PATH = `${base}warrant-grant-receipts-${process.pid}-${Date.now()}/test.db`;
  process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS = "0x5a5af2d85e46b56e8f6de73d273eea9e868c71dc";

  type Call = {functionName: string; args?: readonly unknown[]};
  return {
    receipts: new Map<string, unknown>(),
    readContract: (_: Call): Promise<unknown> => Promise.reject(new Error("no contract read expected")),
  };
});

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({
    getTransactionReceipt: async ({hash}: {hash: string}) => {
      const r = rpc.receipts.get(hash.toLowerCase());
      if (!r) throw new Error(`no receipt for ${hash}`);
      return r;
    },
    getBlock: async () => ({timestamp: 1_790_000_123n}),
    readContract: (call: {functionName: string; args?: readonly unknown[]}) => rpc.readContract(call),
  }),
}));

import {ASSETS} from "./assets";
import {STABLE} from "./chain";
import {database} from "./db";
import {
  confirmOpenings,
  decodeGrantMoments,
  grantVests,
  openingClaim,
  openingMatches,
  readGrantMoments,
  readGrantRecord,
  type OpenedMoment,
} from "./grant-receipts";
import type {Grant} from "./grants";
import {GRANT_OPENED_EVENT, VESTED_EVENT, openedClaim} from "./indexer";
import {grantEscrowAbi} from "./payroll-abi";

afterAll(() => rmSync(dirname(process.env.WARRANT_DB_PATH!), {recursive: true, force: true}));

type Hex = `0x${string}`;

const ESCROW = process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS as Hex;
const LOOKALIKE = "0x00000000000000000000000000000000000000e5";
const PAYER = "0x00000000000000000000000000000000000000a1";
const PERSON = "0x00000000000000000000000000000000000000b2";
const KEEPER = "0x00000000000000000000000000000000000000c3";
const ROUTER = "0x00000000000000000000000000000000000000d4";
const SPYX = ASSETS[0]!.address;
const QQQX = ASSETS[2]!.address;
const FAKE = "0x00000000000000000000000000000000000000f4";
const REASON = `0x${"ab".repeat(32)}` as Hex;
const USD = (n: number) => BigInt(Math.round(n * 1e6));
const UNITS = 3n * 10n ** 17n;
const SHARES = UNITS * 1_000_000n;
const START = 1_790_000_000;
const FOUR_YEARS = 4 * 365 * 86_400;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function abiEvent(name: string): AbiEvent {
  const e = grantEscrowAbi.find((i) => i.type === "event" && i.name === name);
  if (!e) throw new Error(`GrantEscrow has no event ${name}`);
  return e as AbiEvent;
}

/** A log exactly as the escrow (or anything else) would emit it. */
function logOf(name: string, args: Record<string, unknown>, logIndex: number, address: string = ESCROW) {
  const event = abiEvent(name);
  const plain = event.inputs.filter((i) => !i.indexed);
  return {
    address,
    topics: encodeEventTopics({abi: [event], eventName: name, args} as never) as Hex[],
    data: encodeAbiParameters(plain, plain.map((i) => args[i.name!]) as never),
    logIndex,
  };
}

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const usdtMove = (from: string, to: string, value: bigint, logIndex: number) => ({
  address: STABLE.address,
  topics: encodeEventTopics({abi: [TRANSFER], eventName: "Transfer", args: {from, to}} as never) as Hex[],
  data: encodeAbiParameters([{type: "uint256"}], [value]),
  logIndex,
});

const openedLog = (id: number, logIndex: number, over: Record<string, unknown> = {}) =>
  logOf(
    "GrantOpened",
    {
      id: BigInt(id),
      payer: PAYER,
      beneficiary: PERSON,
      asset: SPYX,
      units: UNITS,
      shares: SHARES,
      stableCost: USD(250),
      start: BigInt(START),
      cliff: 0n,
      duration: BigInt(FOUR_YEARS),
      tipBps: 100,
      reasonHash: REASON,
      ...over,
    },
    logIndex,
  );

const vestedLog = (id: number, logIndex: number) =>
  logOf(
    "Vested",
    {
      id: BigInt(id),
      beneficiary: PERSON,
      caller: KEEPER,
      asset: SPYX,
      unitsToBeneficiary: 99n,
      unitsToCaller: 1n,
      sharesReleased: 100_000_000n,
      sharesTotal: SHARES,
    },
    logIndex,
  );

/** An honest opening: the payer's USDT reached the escrow and the route spent it. */
const honestOpening = (id: number, cost = USD(250)) => [
  usdtMove(PAYER, ESCROW, cost, 0),
  usdtMove(ESCROW, ROUTER, cost, 1),
  openedLog(id, 2, {stableCost: cost}),
];

const chainReceipt = (hash: Hex, logs: unknown[], status = "success") => {
  rpc.receipts.set(hash.toLowerCase(), {status, blockNumber: 71_400_000n, transactionHash: hash, logs});
};

/** A grants row as the indexer writes one, once the opening has checked out. */
function recordGrant(id: number, txHash: Hex) {
  database()
    .prepare(
      `INSERT INTO grants (id, tx_hash, block_number, block_time, payer, beneficiary, asset, units,
         shares, stable_cost, start_at, cliff_seconds, duration_secs, tip_bps, reason_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, txHash, 71_400_000, START, PAYER, PERSON, SPYX, UNITS.toString(), SHARES.toString(),
      USD(250).toString(), START, 0, FOUR_YEARS, 100, REASON);
}

beforeEach(() => {
  rpc.receipts.clear();
  rpc.readContract = () => Promise.reject(new Error("no contract read expected"));
  database().exec(`DELETE FROM grants; DELETE FROM vests;`);
});

describe("decodeGrantMoments", () => {
  it("reads an opening with every term, typed the way the pages use them", () => {
    const r = decodeGrantMoments([openedLog(7, 4)], ESCROW);
    expect(r.ok && r.value).toEqual([
      {
        kind: "opened",
        id: 7,
        logIndex: 4,
        payer: getAddress(PAYER),
        beneficiary: getAddress(PERSON),
        asset: getAddress(SPYX),
        units: UNITS,
        shares: SHARES,
        stableCost: USD(250),
        start: START,
        cliffSeconds: 0,
        durationSeconds: FOUR_YEARS,
        tipBps: 100,
        reasonHash: REASON,
      },
    ]);
  });

  it("reads the four moments after it", () => {
    const logs = [
      vestedLog(7, 0),
      logOf("GrantSealed", {id: 7n, payer: PAYER}, 1),
      logOf("GrantRevoked", {id: 7n, payer: PAYER, vestedUnits: 40n, returnedUnits: 60n}, 2),
      logOf("GrantClosed", {id: 7n, unused: 0n}, 3),
    ];
    const r = decodeGrantMoments(logs, ESCROW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((m) => m.kind)).toEqual(["vested", "sealed", "revoked", "closed"]);
    expect(r.value[0]).toMatchObject({unitsToBeneficiary: 99n, unitsToCaller: 1n, caller: getAddress(KEEPER)});
    expect(r.value[2]).toMatchObject({vestedUnits: 40n, returnedUnits: 60n, payer: getAddress(PAYER)});
  });

  it("ignores a lookalike event from any contract that is not the escrow", () => {
    const logs = [openedLog(1, 0), {...openedLog(2, 1), address: LOOKALIKE}];
    const r = decodeGrantMoments(logs, ESCROW);
    expect(r.ok && r.value.map((m) => m.id)).toEqual([1]);
  });

  it("ignores the USDT moving around it, and matches the escrow whatever its case", () => {
    const r = decodeGrantMoments(honestOpening(3), ESCROW.toUpperCase().replace("0X", "0x"));
    expect(r.ok && r.value.map((m) => m.kind)).toEqual(["opened"]);
  });

  it("puts moments in the order they happened", () => {
    const r = decodeGrantMoments([vestedLog(2, 9), openedLog(1, 3)], ESCROW);
    expect(r.ok && r.value.map((m) => m.logIndex)).toEqual([3, 9]);
  });

  it("refuses an escrow log it cannot read rather than print a receipt without it", () => {
    const broken = {...openedLog(1, 0), data: "0x1234" as Hex};
    expect(decodeGrantMoments([broken], ESCROW).ok).toBe(false);
  });
});

describe("confirmOpenings", () => {
  const moment = (over: Partial<OpenedMoment> = {}): OpenedMoment => {
    const r = decodeGrantMoments([openedLog(1, 0)], ESCROW);
    if (!r.ok || r.value[0]?.kind !== "opened") throw new Error("fixture");
    return {...r.value[0], ...over};
  };
  const move = (from: string, to: string, value: bigint) => ({from, to, value});

  it("accepts an opening whose USDT left the payer and was spent", () => {
    const moves = [move(PAYER, ESCROW, USD(250)), move(ESCROW, ROUTER, USD(250))];
    expect(confirmOpenings([moment()], moves, ESCROW).ok).toBe(true);
  });

  it("refuses a route that spent nothing, in a grant's words", () => {
    const big = USD(1_000_000);
    const moves = [move(PAYER, ESCROW, big), move(ESCROW, PAYER, big)];
    const r = confirmOpenings([moment({stableCost: big})], moves, ESCROW);
    expect(r.ok ? "" : r.why).toMatch(/more USDT went into it than actually left/);
  });

  it("refuses a token Warrant does not list, and says that is why", () => {
    const moves = [move(PAYER, ESCROW, USD(250))];
    const r = confirmOpenings([moment({asset: FAKE})], moves, ESCROW);
    expect(r.ok ? "" : r.why).toMatch(/not one of the stocks Warrant lists/);
  });

  it("checks two grants from one payer as one pull", () => {
    const two = [moment({id: 1}), moment({id: 2, stableCost: USD(100)})];
    expect(confirmOpenings(two, [move(PAYER, ESCROW, USD(350))], ESCROW).ok).toBe(true);
    expect(confirmOpenings(two, [move(PAYER, ESCROW, USD(250))], ESCROW).ok).toBe(false);
  });

  it("makes the claim the indexer makes before a grant becomes a row", () => {
    expect(openingClaim(moment())).toEqual({
      payer: getAddress(PAYER),
      recipient: getAddress(PERSON),
      asset: getAddress(SPYX),
      stable: USD(250),
      cash: 0n,
    });
    // The indexer makes the same claim from the log it reads. Compare the two outright, so
    // they cannot drift apart.
    const m = moment();
    const asLogged = {
      transactionHash: null,
      logIndex: null,
      blockNumber: null,
      args: {payer: m.payer, beneficiary: m.beneficiary, asset: m.asset, stableCost: m.stableCost},
    };
    expect(openedClaim(asLogged)).toEqual(openingClaim(m));
  });
});

describe("the events the indexer reads", () => {
  it("are the escrow's own, field for field", () => {
    for (const [mine, name] of [
      [GRANT_OPENED_EVENT, "GrantOpened"],
      [VESTED_EVENT, "Vested"],
    ] as const) {
      const abi = abiEvent(name);
      const shape = (e: AbiEvent) => e.inputs.map((i) => `${i.name}:${i.indexed === true}`);
      expect(toEventSignature(mine)).toBe(toEventSignature(abi));
      expect(shape(mine as AbiEvent)).toEqual(shape(abi));
    }
  });
});

const liveGrant = (over: Partial<Grant> = {}): Grant => ({
  id: 3,
  payer: getAddress(PAYER),
  beneficiary: getAddress(PERSON),
  asset: getAddress(SPYX),
  assetSymbol: "SPYx",
  assetDecimals: 18,
  shares: SHARES,
  sharesReleased: 0n,
  stableCost: USD(250),
  start: START,
  cliffSeconds: 0,
  durationSeconds: FOUR_YEARS,
  tipBps: 100,
  isSealed: false,
  revoked: false,
  frozenVestedShares: 0n,
  reasonHash: REASON,
  reason: null,
  state: "open",
  heldUnits: UNITS,
  releasableUnits: 0n,
  ...over,
});

describe("openingMatches", () => {
  const opening = () => {
    const r = decodeGrantMoments([openedLog(3, 0)], ESCROW);
    if (!r.ok || r.value[0]?.kind !== "opened") throw new Error("fixture");
    return r.value[0];
  };

  it("accepts the grant it opened, whatever the case of its addresses", () => {
    const g = liveGrant({payer: PAYER as Hex, asset: SPYX});
    expect(openingMatches(g, opening()).ok).toBe(true);
  });

  it("refuses a record that differs from the escrow in any term that never changes", () => {
    const drifted: Partial<Grant>[] = [
      {id: 4},
      {payer: KEEPER as Hex},
      {beneficiary: KEEPER as Hex},
      {asset: QQQX},
      {stableCost: USD(251)},
      {start: START + 1},
      {cliffSeconds: 86_400},
      {durationSeconds: FOUR_YEARS - 1},
      {tipBps: 0},
      {reasonHash: `0x${"cd".repeat(32)}` as Hex},
    ];
    for (const d of drifted) {
      expect(openingMatches(liveGrant(d), opening()).ok, Object.keys(d).join()).toBe(false);
    }
  });

  it("does not mind what a revoke changes: the shares, and what was released", () => {
    const g = liveGrant({revoked: true, shares: SHARES / 3n, frozenVestedShares: SHARES / 3n});
    expect(openingMatches(g, opening()).ok).toBe(true);
  });
});

describe("readGrantMoments", () => {
  it("prints an opening as soon as it confirms, with no indexer involved", async () => {
    chainReceipt(TX(1), honestOpening(1));
    const r = await readGrantMoments(TX(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]!.moment.kind).toBe("opened");
    expect(r.value[0]!.opening.txHash).toBe(TX(1));
    expect(r.value[0]!.timestamp).toBe(1_790_000_123);
  });

  it("refuses an opening whose route handed the USDT straight back", async () => {
    const big = USD(1_000_000);
    chainReceipt(TX(2), [
      usdtMove(PAYER, ESCROW, big, 0),
      usdtMove(ESCROW, PAYER, big, 1),
      openedLog(1, 2, {stableCost: big}),
    ]);
    const r = await readGrantMoments(TX(2));
    expect(r.ok ? "" : r.why).toMatch(/more USDT went into it/);
  });

  it("says nothing of a transaction that touched no grant, or that reverted", async () => {
    chainReceipt(TX(3), [usdtMove(PAYER, ROUTER, USD(5), 0)]);
    chainReceipt(TX(4), [], "reverted");
    expect(await readGrantMoments(TX(3))).toEqual({ok: true, value: []});
    expect(await readGrantMoments(TX(4))).toEqual({ok: true, value: []});
  });

  it("holds a vest whose grant nobody has confirmed yet", async () => {
    chainReceipt(TX(5), [vestedLog(2, 0)]);
    const r = await readGrantMoments(TX(5));
    expect(r.ok ? "" : r.why).toMatch(/belongs to grant 2\. .*has not yet confirmed/);
  });

  it("prints a vest once its grant's opening checks out on chain", async () => {
    recordGrant(3, TX(30));
    chainReceipt(TX(30), honestOpening(3));
    chainReceipt(TX(6), [vestedLog(3, 0)]);
    const r = await readGrantMoments(TX(6));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]!.moment.kind).toBe("vested");
    expect(r.value[0]!.opening.txHash).toBe(TX(30));
    expect(r.value[0]!.opening.moment.id).toBe(3);
  });

  it("holds a vest whose grant's recorded opening does not check out", async () => {
    recordGrant(8, TX(80));
    const big = USD(1_000_000);
    chainReceipt(TX(80), [usdtMove(PAYER, ESCROW, big, 0), usdtMove(ESCROW, PAYER, big, 1), openedLog(8, 2, {stableCost: big})]);
    chainReceipt(TX(7), [vestedLog(8, 0)]);
    const r = await readGrantMoments(TX(7));
    expect(r.ok ? "" : r.why).toMatch(/belongs to grant 8\. .*more USDT/);
  });

  it("holds when the transaction on record opened some other grant", async () => {
    recordGrant(9, TX(30)); // grant 3's opening, filed under 9
    chainReceipt(TX(30), honestOpening(3));
    chainReceipt(TX(8), [vestedLog(9, 0)]);
    const r = await readGrantMoments(TX(8));
    expect(r.ok ? "" : r.why).toMatch(/did not open it/);
  });
});

describe("readGrantRecord", () => {
  const noSuchGrant = () => {
    const data = encodeErrorResult({abi: grantEscrowAbi, errorName: "NoSuchGrant"});
    const cause = new ContractFunctionRevertedError({abi: grantEscrowAbi, data, functionName: "grant"});
    return new ContractFunctionExecutionError(cause, {
      abi: grantEscrowAbi,
      functionName: "grant",
      args: [99n],
      contractAddress: ESCROW,
    });
  };

  /** The escrow, answering for grant 3 with `grant` as it stands now. */
  const escrowHolds = (g: Grant) => {
    rpc.readContract = async ({functionName, args}) => {
      if (args?.[0] !== BigInt(g.id)) throw noSuchGrant();
      if (functionName === "heldUnits") return g.heldUnits;
      if (functionName === "releasableUnits") return g.releasableUnits;
      return {
        payer: g.payer,
        beneficiary: g.beneficiary,
        asset: g.asset,
        shares: g.shares,
        sharesReleased: g.sharesReleased,
        stableCost: g.stableCost,
        start: BigInt(g.start),
        cliff: BigInt(g.cliffSeconds),
        duration: BigInt(g.durationSeconds),
        tipBps: g.tipBps,
        isSealed: g.isSealed,
        revoked: g.revoked,
        frozenVestedShares: g.frozenVestedShares,
        reasonHash: g.reasonHash,
        state: 1,
      };
    };
  };

  it("is null for an id the escrow has never used, which the page turns into a 404", async () => {
    escrowHolds(liveGrant());
    expect(await readGrantRecord(99)).toEqual({ok: true, value: null});
  });

  it("holds, and does not claim the grant is missing, when the escrow will not answer", async () => {
    rpc.readContract = () => Promise.reject(new Error("HTTP 429: over rate limit"));
    const r = await readGrantRecord(3);
    expect(r.ok ? "" : r.why).toMatch(/refusing reads right now/);
  });

  it("reads a grant whose opening checks out and agrees with the escrow", async () => {
    recordGrant(3, TX(30));
    chainReceipt(TX(30), honestOpening(3));
    escrowHolds(liveGrant());
    const r = await readGrantRecord(3);
    expect(r.ok && r.value !== null).toBe(true);
    if (!r.ok || r.value === null) return;
    expect(r.value.opening.txHash).toBe(TX(30));
    expect(r.value.opening.moment.units).toBe(UNITS);
    expect(r.value.grant.heldUnits).toBe(UNITS);
  });

  it("holds a grant the escrow and its recorded opening disagree about", async () => {
    recordGrant(3, TX(30));
    chainReceipt(TX(30), honestOpening(3));
    escrowHolds(liveGrant({stableCost: USD(1)}));
    const r = await readGrantRecord(3);
    expect(r.ok ? "" : r.why).toMatch(/does not match the transaction on record/);
  });

  it("holds a grant that exists but whose opening has not been confirmed", async () => {
    escrowHolds(liveGrant({id: 12}));
    const r = await readGrantRecord(12);
    expect(r.ok ? "" : r.why).toMatch(/Grant 12 is on X Layer, but this site has not yet confirmed/);
  });
});

describe("grantVests", () => {
  it("lists a grant's releases oldest first, and none naming another asset or person", () => {
    const insert = database().prepare(
      `INSERT INTO vests (tx_hash, log_index, block_number, block_time, grant_id, beneficiary,
         caller, asset, units_to_beneficiary, units_to_caller)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const person = PERSON.toLowerCase();
    insert.run(TX(102), 0, 200, START + 200, 21, person, KEEPER, SPYX, "990", "10");
    insert.run(TX(101), 5, 100, START + 100, 21, person, person, SPYX, "500", "0");
    insert.run(TX(103), 0, 300, null, 21, person, KEEPER, QQQX, "1", "0");
    insert.run(TX(104), 0, 400, null, 21, KEEPER, KEEPER, SPYX, "1", "0");
    insert.run(TX(105), 0, 500, null, 22, person, KEEPER, SPYX, "1", "0");

    const vests = grantVests({id: 21, asset: getAddress(SPYX), beneficiary: getAddress(PERSON)});
    expect(vests.map((v) => [v.txHash, v.unitsToBeneficiary, v.unitsToCaller])).toEqual([
      [TX(101), 500n, 0n],
      [TX(102), 990n, 10n],
    ]);
    expect(vests[0]!.blockTime).toBe(START + 100);
  });
});
