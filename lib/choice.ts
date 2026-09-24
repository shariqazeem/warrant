/**
 * THE PERSON'S CHOICE: how much of each payment becomes stock, and which stock.
 *
 * The person being paid decides, not the company. They sign it once — an EIP-712
 * signature, which is not a transaction, sends nothing and costs no network fee — and every
 * company that pays them through Warrant follows it. This file is the choice and its rules:
 * the typed data the wallet signs and the server checks (one definition, so the two cannot
 * drift), the rules a choice must meet, the arithmetic of the split, and the words a page
 * uses for it.
 *
 * NO DATABASE HERE, ON PURPOSE. The /me form runs this in the browser, and `lib/payment.ts`
 * (which the pay form bundles) may call `splitByChoice`. A module that opened SQLite would
 * drag better-sqlite3 into those bundles and break the build — the same reason
 * MAX_REASON_LENGTH lives in lib/reason.ts and not lib/db.ts. The stored choices are read
 * through lib/person.ts (`choiceFor`, `choiceAt`) and written by lib/db.ts.
 */
import {createPublicClient, hashTypedData, http, type PublicClient} from "viem";
import {assetByAddress} from "./assets";
import {transport, xLayer} from "./chain";
import {bps, short, usdt} from "./format";
import {held, isThrottle, ok, shortReason, type Outcome} from "./outcome";
import {checkAddress, checkListedAsset} from "./payment";

/** Basis points in a whole payment. 2_500 is 25%. */
export const MAX_BPS = 10_000;

/** A choice dated further ahead than this, by the server's clock, is refused. */
export const MAX_AHEAD_SECONDS = 10 * 60;
/** A choice signed longer ago than this cannot be saved; the person signs it again. */
export const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Longer than any real wallet's signature: 65 bytes for an ordinary wallet, a few kilobytes
 * for a smart-contract wallet that has not been deployed yet (ERC-6492). Short enough that a
 * public endpoint cannot be used to make the server hash megabytes.
 */
export const MAX_SIGNATURE_BYTES = 8_192;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * What the person states when they choose any stock at all. xStocks are not offered to US
 * persons or in Canada, the UK or Australia (lib/assets.ts, ELIGIBILITY_NOTE). One copy: the
 * checkbox on /me and the public page both print this sentence.
 */
export const ELIGIBILITY_STATEMENT =
  "I'm not a US person, and I don't live in Canada, the UK or Australia.";

// ── the typed data. ONE definition, signed in the browser and checked on the server. ──

/**
 * No `verifyingContract`: the choice is not addressed to one contract. It belongs to the
 * person, on X Layer, and any contract or server can check it against this domain.
 */
export const CHOICE_DOMAIN = {name: "Warrant", version: "1", chainId: xLayer.id} as const;

export const CHOICE_PRIMARY_TYPE = "PayChoice" as const;

export const CHOICE_TYPES = {
  PayChoice: [
    {name: "person", type: "address"},
    {name: "stockBps", type: "uint16"},
    {name: "asset", type: "address"},
    {name: "eligible", type: "bool"},
    {name: "issuedAt", type: "uint64"},
  ],
} as const;

/**
 * The same two types, as a Solidity contract writes them for its typehashes. lib/choice.test.ts
 * checks that these strings hash to exactly what viem signs with, so a contract that checks
 * choices on chain can copy them from here.
 */
export const PAY_CHOICE_TYPE =
  "PayChoice(address person,uint16 stockBps,address asset,bool eligible,uint64 issuedAt)";
export const CHOICE_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId)";

/** What a person signs, field for field the PayChoice struct. */
export type ChoiceMessage = {
  /** The wallet the choice is for, and the one that must have signed it. */
  person: `0x${string}`;
  /** The share of each payment that becomes stock, in basis points: 2_500 is 25%. */
  stockBps: number;
  /** One of ASSETS when stockBps > 0; the zero address when it is 0. */
  asset: `0x${string}`;
  /** Their statement that they may hold xStocks. Must be true when stockBps > 0. */
  eligible: boolean;
  /** When it was signed, in unix seconds. */
  issuedAt: number;
};

/** A choice whose signature has been checked. Addresses and signature are lowercase. */
export type Choice = ChoiceMessage & {signature: `0x${string}`};

/** A choice as lib/db.ts keeps it: checked when it was saved, and when that was. */
export type StoredChoice = Choice & {savedAt: number};

/** The whole EIP-712 payload for one choice: what the wallet signs and the server checks. */
export function choiceTypedData(m: ChoiceMessage) {
  return {
    domain: CHOICE_DOMAIN,
    types: CHOICE_TYPES,
    primaryType: CHOICE_PRIMARY_TYPE,
    message: {
      person: m.person,
      stockBps: m.stockBps,
      asset: m.asset,
      eligible: m.eligible,
      issuedAt: BigInt(m.issuedAt),
    },
  } as const;
}

/** The EIP-712 digest of a choice: what `ecrecover`, or a contract's ERC-1271 check, is given. */
export function choiceDigest(m: ChoiceMessage): `0x${string}` {
  return hashTypedData(choiceTypedData(m));
}

/**
 * A fixed choice and its digest, pinned. If the domain or the type ever changes, this stops
 * matching — and so will every signature already stored, and any contract that checks them.
 * A Solidity test can assert the same digest for the same fields.
 */
export const CHOICE_FIXTURE = {
  message: {
    person: "0x00000000000000000000000000000000000000a1",
    stockBps: 2_500,
    asset: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    eligible: true,
    issuedAt: 1_790_000_000,
  },
  digest: "0x461f662262fd6b655c295c1e31d440dbbc6e72092d053b66f51541a434d262d4",
} as const satisfies {message: ChoiceMessage; digest: `0x${string}`};

// ── the rules ────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * EVERY RULE A CHOICE MUST MEET THAT NEEDS NO CLOCK AND NO NETWORK.
 *
 * Takes anything, because a server action receives whatever a browser sends, and returns a
 * fresh object with only the five fields, addresses lowercased. The /me form runs the same
 * function before it asks the wallet to sign, so nobody signs a choice the server will refuse.
 */
export function checkChoice(raw: unknown): Outcome<ChoiceMessage> {
  if (!isRecord(raw)) return held("That is not a choice.");
  const {person, stockBps, asset, eligible, issuedAt} = raw;

  if (typeof person !== "string") return held("A choice must name the wallet it is for.");
  const who = checkAddress(person, "a wallet address");
  if (!who.ok) return who;

  if (typeof stockBps !== "number" || !Number.isInteger(stockBps) || stockBps < 0 || stockBps > MAX_BPS) {
    return held("The share of each payment that becomes stock must be between 0% and 100%.");
  }

  if (typeof asset !== "string") return held("A choice must name a stock, or none.");
  const what = checkAddress(asset, "a stock's address");
  if (!what.ok) return what;

  if (typeof eligible !== "boolean") return held("A choice must say whether you may hold stock.");

  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    return held("The time on this choice is not a real time.");
  }

  if (stockBps === 0) {
    // Nothing becomes stock, so there is no stock to name — and a stock named anyway would
    // be a second meaning hiding in a signed message.
    if (asset.toLowerCase() !== ZERO_ADDRESS) {
      return held("With 0% as stock there is no stock to choose, so none may be named.");
    }
  } else {
    const listed = checkListedAsset(asset);
    if (!listed.ok) return listed;
    if (!eligible) {
      return held(
        "Stock can only be chosen by someone who confirms they are not a US person and " +
          "don't live in Canada, the UK or Australia.",
      );
    }
  }

  return ok({
    person: person.toLowerCase() as `0x${string}`,
    stockBps,
    asset: asset.toLowerCase() as `0x${string}`,
    eligible,
    issuedAt,
  });
}

/** THE CLOCK RULE, at the moment of saving: not from the future, and not stale. */
export function checkIssuedAt(issuedAt: number, now: number): Outcome<number> {
  if (issuedAt > now + MAX_AHEAD_SECONDS) {
    const minutes = Math.ceil((issuedAt - now) / 60);
    return held(
      `This choice is dated ${minutes} minutes ahead of Warrant's clock, so it was not saved. ` +
        "Check the time on your device, then sign again.",
    );
  }
  if (issuedAt < now - MAX_AGE_SECONDS) {
    return held(
      "This choice was signed more than a day ago, so it can no longer be saved. Sign it " +
        "again — it is free.",
    );
  }
  return ok(issuedAt);
}

/** A signature is hex, whole bytes, and not absurdly long. Lowercased for storage. */
export function checkSignature(raw: unknown): Outcome<`0x${string}`> {
  if (
    typeof raw !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(raw) ||
    (raw.length - 2) / 2 > MAX_SIGNATURE_BYTES
  ) {
    return held("That is not a signature.");
  }
  return ok(raw.toLowerCase() as `0x${string}`);
}

// ── the signature ────────────────────────────────────────────────────────────────────

/** Anything that can check a typed-data signature the way viem's public client does. */
export type SignatureChecker = Pick<PublicClient, "verifyTypedData" | "getChainId">;

export type VerifyOptions = {
  /** Unix seconds. Defaults to the clock. */
  now?: number;
  /** Defaults to X Layer's public endpoint (lib/chain.ts). Tests pass their own. */
  client?: SignatureChecker;
};

let xLayerClient: SignatureChecker | null = null;
function defaultClient(): SignatureChecker {
  xLayerClient ??= createPublicClient({chain: xLayer, transport: transport()});
  return xLayerClient;
}

const COULD_NOT_CHECK =
  "Your signature could not be checked just now, because X Layer's endpoint is not " +
  "answering. Nothing was saved — try again in a moment.";

/**
 * A CHOICE, CHECKED BEFORE IT IS SAVED: every rule, the clock, and the signature.
 *
 * The signature is checked by viem's public client against X Layer, so a smart-contract
 * wallet answers for itself (ERC-1271, or ERC-6492 before it is deployed). An ordinary
 * wallet is checked first, locally, by recovering the signer (`mode: "eoa"`) — no network,
 * so a busy public endpoint cannot stop most people saving. Only a signature that does not
 * recover to the wallet is taken to the chain.
 *
 * "NOT THIS WALLET'S SIGNATURE" IS ONLY SAID WHEN IT IS TRUE. viem reads a failed on-chain
 * check as an invalid signature, whatever the reason it failed; so when the answer is no,
 * the endpoint is asked one cheap question to be sure it is up. If it is not, the answer
 * is "could not be checked", never "invalid".
 */
export async function verifyChoice(
  message: ChoiceMessage,
  signature: string,
  options: VerifyOptions = {},
): Promise<Outcome<Choice>> {
  const checked = checkChoice(message);
  if (!checked.ok) return checked;
  const m = checked.value;

  const fresh = checkIssuedAt(m.issuedAt, options.now ?? Math.floor(Date.now() / 1000));
  if (!fresh.ok) return fresh;

  const sig = checkSignature(signature);
  if (!sig.ok) return sig;

  const client = options.client ?? defaultClient();
  try {
    const valid = await client.verifyTypedData({
      address: m.person,
      ...choiceTypedData(m),
      signature: sig.value,
      mode: "eoa",
    });
    if (valid) return ok({...m, signature: sig.value});
  } catch (err) {
    return held(isThrottle(err) ? COULD_NOT_CHECK : `Your signature could not be checked (${shortReason(err)}). Nothing was saved.`);
  }

  try {
    await client.getChainId();
  } catch {
    return held(COULD_NOT_CHECK);
  }
  return held(
    "That signature was not made by this wallet for this choice, so it was not saved. " +
      "Sign it again from the wallet you are paid to.",
  );
}

// ── the split ────────────────────────────────────────────────────────────────────────

/**
 * WHAT ONE PAYMENT BECOMES UNDER A CHOICE, in base units.
 *
 * stock = floor(stable × stockBps / 10 000), cash = stable − stock. Rounding only ever moves
 * a unit from stock to cash, and the two always add up to exactly what was paid: nothing is
 * created and nothing is lost.
 *
 * THROWS ONLY ON INPUT NO STORED CHOICE CAN HAVE — a share outside 0–10 000 or not whole, or
 * a negative amount. Every choice is checked before it is saved, so that is a bug upstream,
 * and a split that guessed would move money nobody chose.
 */
export function splitByChoice(stable: bigint, stockBps: number): {stock: bigint; cash: bigint} {
  if (!Number.isInteger(stockBps) || stockBps < 0 || stockBps > MAX_BPS) {
    throw new RangeError(`A share must be a whole number of basis points from 0 to ${MAX_BPS}, not ${stockBps}.`);
  }
  if (stable < 0n) throw new RangeError("A payment cannot be negative.");
  const stock = (stable * BigInt(stockBps)) / BigInt(MAX_BPS);
  return {stock, cash: stable - stock};
}

// ── the words ────────────────────────────────────────────────────────────────────────

/** "25%" and "of each payment into S&P 500 xStock (SPYx), the rest as USDT". */
export function choiceParts(c: {stockBps: number; asset: string}): {share: string; rest: string} {
  const share = bps(c.stockBps);
  if (c.stockBps === 0) {
    return {share, rest: "of each payment becomes stock: all of it arrives as USDT"};
  }
  const stock = assetByAddress(c.asset);
  const named = stock
    ? `${stock.name} (${stock.symbol})`
    : `a stock Warrant no longer pays in (${short(c.asset)})`;
  const rest = c.stockBps === MAX_BPS ? "" : ", the rest as USDT";
  return {share, rest: `of each payment into ${named}${rest}`};
}

/** The choice in one line: "25% of each payment into S&P 500 xStock (SPYx), the rest as USDT". */
export function choiceWords(c: {stockBps: number; asset: string}): string {
  const {share, rest} = choiceParts(c);
  return `${share} ${rest}`;
}

/** The worked example's payment: $100, in USDT's six decimals. */
export const EXAMPLE_PAYMENT = 100_000_000n;

/**
 * ARITHMETIC, NOT A QUOTE: what the split does to a $100 payment. No price appears, because
 * how much stock $25 buys is only known when a payment is made. A page must label it so.
 */
export function exampleWords(c: {stockBps: number; asset: string}): string {
  const {stock, cash} = splitByChoice(EXAMPLE_PAYMENT, c.stockBps);
  const symbol = assetByAddress(c.asset)?.symbol ?? "stock";
  const on = `On a ${usdt(EXAMPLE_PAYMENT)} payment`;
  if (stock === 0n) return `${on}, all ${usdt(cash)} arrives as USDT.`;
  if (cash === 0n) return `${on}, all ${usdt(stock)} becomes ${symbol}.`;
  return `${on}, ${usdt(stock)} becomes ${symbol} and ${usdt(cash)} arrives as USDT.`;
}
