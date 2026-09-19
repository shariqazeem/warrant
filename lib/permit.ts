/**
 * THE ONE SIGNATURE.
 *
 * USDT on X Layer implements EIP-2612, so a payer approves with a signature rather than a
 * transaction: free, instant, and it makes a whole run a single transaction instead of two.
 *
 * THE EIP-712 DOMAIN CANNOT BE GUESSED. If the name or version is wrong, the signature is
 * well-formed, the wallet signs it happily, and the token rejects it on chain — a failure
 * that looks like a contract bug and is not. So the domain built here is CHECKED against
 * the token's own DOMAIN_SEPARATOR before it is ever used, by `verifyDomain` below and by
 * `npm run preflight`.
 */
import {
  createPublicClient,
  encodeAbiParameters,
  erc20Abi,
  http,
  keccak256,
  stringToHex,
  type Address,
  type TypedDataDomain,
} from "viem";
import {STABLE, xLayer} from "./chain";
import {held, ok, type Outcome} from "./outcome";

/** The EIP-2612 type, identical for every compliant token. */
export const PERMIT_TYPES = {
  Permit: [
    {name: "owner", type: "address"},
    {name: "spender", type: "address"},
    {name: "value", type: "uint256"},
    {name: "nonce", type: "uint256"},
    {name: "deadline", type: "uint256"},
  ],
} as const;

export const permitAbi = [
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "owner", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    name: "DOMAIN_SEPARATOR",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "bytes32"}],
  },
] as const;

const DOMAIN_TYPEHASH = keccak256(
  stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

export function buildDomain(name: string, version: string): TypedDataDomain {
  return {name, version, chainId: xLayer.id, verifyingContract: STABLE.address};
}

/** The separator a given (name, version) would produce, for comparison with the chain's. */
export function separatorFor(name: string, version: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{type: "bytes32"}, {type: "bytes32"}, {type: "bytes32"}, {type: "uint256"}, {type: "address"}],
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToHex(name)),
        keccak256(stringToHex(version)),
        BigInt(xLayer.id),
        STABLE.address,
      ],
    ),
  );
}

/** Versions worth trying. Almost every token uses "1"; a few use "2". */
const VERSIONS = ["1", "2"] as const;

/**
 * Ask the token what its domain separator is, then find the (name, version) that produces
 * it. Returns a domain that is KNOWN to match, or holds saying permit cannot be used —
 * in which case the caller falls back to a plain approval transaction, which always works.
 */
export async function resolveDomain(
  rpcUrl?: string,
): Promise<Outcome<{domain: TypedDataDomain; name: string; version: string}>> {
  const rpc = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl ?? xLayer.rpcUrls.default.http[0]),
  });

  let onchain: `0x${string}`;
  let tokenName: string;
  try {
    [onchain, tokenName] = await Promise.all([
      rpc.readContract({address: STABLE.address, abi: permitAbi, functionName: "DOMAIN_SEPARATOR"}),
      rpc.readContract({address: STABLE.address, abi: erc20Abi, functionName: "name"}),
    ]);
  } catch (err) {
    return held(
      `${STABLE.symbol} did not answer DOMAIN_SEPARATOR, so it does not support permit ` +
        `here (${err instanceof Error ? err.message : String(err)}). Approve instead.`,
    );
  }

  // The token's own name first, then the usual stand-ins.
  const candidates = [tokenName, STABLE.symbol, "USD Coin", "Tether USD"];
  for (const name of candidates) {
    for (const version of VERSIONS) {
      if (separatorFor(name, version).toLowerCase() === onchain.toLowerCase()) {
        return ok({domain: buildDomain(name, version), name, version});
      }
    }
  }

  return held(
    `${STABLE.symbol} reports a domain separator that none of the usual (name, version) ` +
      `pairs reproduce, so a permit signed here would be rejected on chain. ` +
      `Approve with a transaction instead.`,
  );
}

/**
 * THE CHAIN'S CLOCK, NOT THE MACHINE'S.
 *
 * A permit deadline is checked against `block.timestamp`. Computing it from `Date.now()`
 * means a browser whose clock is slow signs a permit that is already expired, and the
 * failure surfaces as an opaque contract revert rather than as "your clock is wrong".
 * This asks the chain what time it thinks it is and works from that.
 *
 * Falls back to the local clock if the head cannot be read — a deadline from a working
 * clock is better than no transaction at all.
 */
export async function deadlineIn(minutes: number, rpcUrl?: string): Promise<bigint> {
  const window = BigInt(Math.round(minutes * 60));
  try {
    const rpc = createPublicClient({
      chain: xLayer,
      transport: http(rpcUrl ?? xLayer.rpcUrls.default.http[0]),
    });
    const block = await rpc.getBlock({blockTag: "latest"});
    return block.timestamp + window;
  } catch {
    return BigInt(Math.floor(Date.now() / 1000)) + window;
  }
}

/** The nonce the next permit for this payer must carry. */
export async function permitNonce(owner: Address, rpcUrl?: string): Promise<Outcome<bigint>> {
  const rpc = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl ?? xLayer.rpcUrls.default.http[0]),
  });
  try {
    const n = await rpc.readContract({
      address: STABLE.address,
      abi: permitAbi,
      functionName: "nonces",
      args: [owner],
    });
    return ok(n);
  } catch (err) {
    return held(`Could not read the permit nonce (${err instanceof Error ? err.message : err}).`);
  }
}
