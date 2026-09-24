/**
 * APPROVING WITH A SIGNATURE — OR KNOWING, BEFORE ANYTHING IS SENT, THAT IT CANNOT WORK.
 *
 * USDT's permit checks a signature with ecrecover: 65 bytes that recover to the owner. Two
 * kinds of wallet cannot produce that. A smart-contract wallet signs in a form only its own
 * contract can check, and the token never asks it; and some wallets cannot sign typed data
 * at all. Both used to go ahead anyway, fail on chain with PermitFailed on every retry, and
 * show a message promising a fallback that did not exist.
 *
 * So a permit is checked HERE, in the browser, before it is used: the signature must be 65
 * bytes and must recover to the paying address, or the payment takes the approval path
 * instead. If the token still refuses one, `isPermitRefusal` says so and the caller falls
 * back once. The one answer that is not a fallback is the payer saying no.
 *
 * The wallet calls come in as arguments, so the decision can be tested with a real signer
 * and a fake smart wallet. Relative imports for the same reason: the tests resolve no alias.
 */
import {recoverTypedDataAddress, toFunctionSelector, type Address, type Hex, type TypedDataDomain} from "viem";
import {PERMIT_TYPES} from "../../lib/permit";
import type {Outcome} from "../../lib/outcome";

/** What the payment contracts take in place of a prior approval transaction. */
export type Permit = {value: bigint; deadline: bigint; v: number; r: Hex; s: Hex};

export type PermitAttempt =
  | {kind: "signed"; permit: Permit}
  /** The payer dismissed the request. Not a fallback: they said no. */
  | {kind: "dismissed"}
  /** A permit cannot work for this wallet or token; approve with a transaction instead. */
  | {kind: "unusable"; why: string};

/** The typed data a permit signs, in the shape a wallet's signTypedData takes. */
export type PermitTypedData = {
  domain: TypedDataDomain;
  types: typeof PERMIT_TYPES;
  primaryType: "Permit";
  message: {owner: Address; spender: Address; value: bigint; nonce: bigint; deadline: bigint};
};

/**
 * A 65-byte signature split the way EIP-2612 takes it. Null for anything else — a
 * smart-contract wallet's signature, or a compact one — because the token cannot read it.
 */
export function splitPermitSignature(signature: Hex): {v: number; r: Hex; s: Hex} | null {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  // Some wallets still return 0/1 where the token expects 27/28.
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) return null;
  return {v, r, s};
}

/** Each error in a chain of causes, outermost first. Wallet errors nest several deep. */
function* causes(err: unknown): Generator<unknown> {
  let e: unknown = err;
  for (let depth = 0; depth < 8 && e !== undefined && e !== null; depth++) {
    yield e;
    e = (e as {cause?: unknown}).cause;
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The payer dismissed the request in their wallet (EIP-1193 code 4001, or its words). */
export function isUserRejection(err: unknown): boolean {
  for (const e of causes(err)) {
    if ((e as {code?: unknown}).code === 4001) return true;
    if ((e as {name?: unknown}).name === "UserRejectedRequestError") return true;
    if (/User rejected|user denied|denied transaction|rejected the request/i.test(messageOf(e))) {
      return true;
    }
  }
  return false;
}

/** `PermitFailed()`, as its four-byte selector: what a wallet shows when it cannot decode. */
export const PERMIT_FAILED_SELECTOR = toFunctionSelector("PermitFailed()");

/**
 * The contract refused the permit: `PermitFailed`, by name when the error was decoded
 * against the ABI, or by selector when the wallet passed the raw revert data through.
 */
export function isPermitRefusal(err: unknown): boolean {
  const selector = new RegExp(`${PERMIT_FAILED_SELECTOR}(?![0-9a-f])`, "i");
  for (const e of causes(err)) {
    const data = (e as {data?: unknown}).data;
    if (typeof data === "object" && data !== null && (data as {errorName?: unknown}).errorName === "PermitFailed") {
      return true;
    }
    if (typeof data === "string" && selector.test(data)) return true;
    if ((e as {signature?: unknown}).signature === PERMIT_FAILED_SELECTOR) return true;
    const text = messageOf(e);
    if (/PermitFailed/.test(text) || selector.test(text)) return true;
  }
  return false;
}

/**
 * Ask the wallet for a permit and check it can work, without sending anything.
 *
 * `onAsk` runs just before the wallet is asked, so the surface can say "Waiting for your
 * wallet" at the moment it is true.
 */
export async function signPermit(args: {
  owner: Address;
  spender: Address;
  value: bigint;
  domain: () => Promise<Outcome<{domain: TypedDataDomain}>>;
  nonce: () => Promise<bigint>;
  deadline: () => Promise<bigint>;
  sign: (typed: PermitTypedData) => Promise<Hex>;
  onAsk?: () => void;
}): Promise<PermitAttempt> {
  const resolved = await args.domain();
  if (!resolved.ok) return {kind: "unusable", why: resolved.why};

  let nonce: bigint;
  try {
    nonce = await args.nonce();
  } catch {
    return {kind: "unusable", why: "The permit nonce could not be read."};
  }
  // From the chain's clock: a browser running slow would otherwise sign a permit that is
  // already expired, and fail with an opaque revert.
  const deadline = await args.deadline();

  const typed: PermitTypedData = {
    domain: resolved.value.domain,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: {owner: args.owner, spender: args.spender, value: args.value, nonce, deadline},
  };

  args.onAsk?.();
  let signature: Hex;
  try {
    signature = await args.sign(typed);
  } catch (err) {
    if (isUserRejection(err)) return {kind: "dismissed"};
    return {kind: "unusable", why: "This wallet cannot sign an approval."};
  }

  const parts = splitPermitSignature(signature);
  if (!parts) return {kind: "unusable", why: "This wallet signs in a form USD₮0 cannot check."};

  // The token will run ecrecover on this. If it does not come back to the payer — as with a
  // smart-contract wallet — the token would refuse it on chain, so it is not used.
  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({...typed, signature});
  } catch {
    return {kind: "unusable", why: "This wallet signs in a form USD₮0 cannot check."};
  }
  if (signer.toLowerCase() !== args.owner.toLowerCase()) {
    return {kind: "unusable", why: "This wallet signs in a form USD₮0 cannot check."};
  }

  return {kind: "signed", permit: {value: args.value, deadline, ...parts}};
}

/** What the payer is told when it takes two transactions instead of one: "…then once to pay." */
export const approveFirst = (then: string): string =>
  `Your wallet can't approve by signature, so it will ask twice: once to approve the USD₮0, ` +
  `then once to ${then}.`;
