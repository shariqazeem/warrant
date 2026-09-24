/**
 * WHAT A FAILED GRANT SAYS, AND WHICH GRANT A CONFIRMED ONE OPENED.
 *
 * The errors are built the way viem builds them from a real revert — the contract's own ABI
 * decoding real revert data — so a renamed error in GrantEscrow shows up here as a sentence
 * that no longer matches, not in front of someone who just tried to issue a grant.
 */
import {describe, expect, it} from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  zeroHash,
  type AbiEvent,
} from "viem";
import {grantEscrowAbi} from "../../lib/payroll-abi";
import {grantIdFrom, issueFailureWords, revertOf} from "./use-open-grant";

const SPYX = {symbol: "SPYx", decimals: 18};
const ESCROW = "0xb238d76499616377abd4908e46f29c7ce50908d1";

/** A simulation that reverted with GrantEscrow's `name`, as viem throws it. */
function reverted(name: string, args?: readonly unknown[]) {
  const data = encodeErrorResult({abi: grantEscrowAbi, errorName: name, args} as never);
  const cause = new ContractFunctionRevertedError({abi: grantEscrowAbi, data, functionName: "open"});
  return new ContractFunctionExecutionError(cause, {abi: grantEscrowAbi, functionName: "open", args: []});
}

describe("a failed grant, in words", () => {
  it("names the contract's own error", () => {
    expect(revertOf(reverted("CliffAfterDuration"))?.name).toBe("CliffAfterDuration");
    expect(revertOf(new Error("execution reverted: TipTooHigh()"))?.name).toBe("TipTooHigh");
    expect(revertOf(new Error("something else"))).toBeNull();
  });

  it("says how far under the floor a moved price would have landed, cut, never rounded up", () => {
    const words = issueFailureWords(
      reverted("BelowMinimum", [640_009_999_999_999_999n, 645_084_000_000_000_000n]),
      SPYX,
    );
    expect(words).toBe(
      "The price moved since the quote: the route would now buy 0.6400 SPYx, under the " +
        "guaranteed 0.6450. Nothing was sent. Try again for a fresh quote.",
    );
  });

  it("gives every schedule and fee refusal its own sentence", () => {
    expect(issueFailureWords(reverted("CliffAfterDuration"), SPYX)).toBe("The cliff can't be longer than the vesting.");
    expect(issueFailureWords(reverted("DurationTooLong"), SPYX)).toBe("A grant can vest over at most 3,650 days.");
    expect(issueFailureWords(reverted("TipTooHigh"), SPYX)).toBe("The release fee can be at most 2%.");
    expect(issueFailureWords(reverted("BeneficiaryIsThePayer"), SPYX)).toMatch(/not yours/);
    expect(issueFailureWords(reverted("RouterCallFailed"), SPYX)).toMatch(/fresh quote/);
  });

  it("says what a node said when there is no contract error, never a bare code", () => {
    expect(issueFailureWords(new Error("insufficient funds for gas * price + value"), SPYX)).toMatch(/OKB/);
    expect(issueFailureWords(new Error("Request timed out\nat line 2"), SPYX)).toBe(
      "Request timed out. Nothing was sent unless your wallet shows it.",
    );
  });
});

describe("the grant a confirmed transaction opened", () => {
  const event = grantEscrowAbi.find((x) => x.type === "event" && x.name === "GrantOpened") as AbiEvent;
  const log = (id: bigint, address: string) => ({
    address: address as `0x${string}`,
    topics: encodeEventTopics({
      abi: [event],
      eventName: "GrantOpened",
      args: {id, payer: "0x3fa9000000000000000000000000000000041c0a", beneficiary: "0x7c1e5a2b9d04f3ac61e8b2d7f0c9a4e13b5d9ab2"},
    } as never) as [`0x${string}`, ...`0x${string}`[]],
    data: encodeAbiParameters(event.inputs.filter((i) => !i.indexed), [
      "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
      1n,
      1n,
      1n,
      1n,
      0n,
      7200n,
      50,
      zeroHash,
    ]),
    blockNumber: 1n,
    blockHash: zeroHash,
    logIndex: 0,
    transactionHash: zeroHash,
    transactionIndex: 0,
    removed: false,
  });

  it("reads the id from GrantOpened in this escrow", () => {
    expect(grantIdFrom([log(7n, ESCROW)], ESCROW)).toBe(7);
  });

  it("ignores the same event from any other contract", () => {
    expect(grantIdFrom([log(7n, "0x0000000000000000000000000000000000000def")], ESCROW)).toBeNull();
    expect(grantIdFrom([], ESCROW)).toBeNull();
  });
});
