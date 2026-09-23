/**
 * Helpers for driving a local Anvil fork of X Layer.
 *
 * WHY A FORK. `docs/plan.md` step 1 says prove the route by sending a real transaction on
 * mainnet. That is the right final proof and it spends real money, so it is not the first
 * proof. A fork runs the SAME router, the SAME token contracts and the SAME calldata
 * against real mainnet state, for nothing — and it is the only place a failed payment
 * costs nothing to investigate.
 *
 * Nothing here is used by the app. It exists so the mainnet attempt is the second time
 * this code path has run, not the first.
 */
import {createTestClient, http, publicActions, walletActions, type Address, keccak256, stringToHex} from "viem";
import {xLayer} from "./chain";
import {held, ok, type Outcome} from "./outcome";

/**
 * A generous timeout on purpose. A fork answers a cold storage read by fetching it from
 * mainnet, and a four-hop swap touches a great many slots the fork has never seen — the
 * first estimateGas against a fresh fork can take far longer than a normal RPC call.
 */
export const forkClient = (url = "http://127.0.0.1:8545") =>
  createTestClient({
    chain: xLayer,
    mode: "anvil",
    transport: http(url, {timeout: 180_000, retryCount: 1}),
  })
    .extend(publicActions)
    .extend(walletActions);

export type ForkClient = ReturnType<typeof forkClient>;

/**
 * A FORK'S CLOCK DRIFTS, AND EVERYTHING ELSE BREAKS QUIETLY WHEN IT DOES.
 *
 * `prove-grant` moves the fork years forward to walk a vesting schedule. Anything run
 * after it on the same fork then signs permits and routes whose deadlines are long past,
 * and the failures arrive as `PermitFailed` and `RouterCallFailed` — which look exactly
 * like real bugs in the contract and are not.
 *
 * So anything that depends on a live quote checks first and says what is actually wrong.
 */
export async function checkClock(client: ForkClient, toleranceHours = 24): Promise<Outcome<number>> {
  const block = await client.getBlock({blockTag: "latest"});
  const chain = Number(block.timestamp);
  const real = Math.floor(Date.now() / 1000);
  const driftHours = Math.abs(chain - real) / 3600;

  if (driftHours > toleranceHours) {
    const days = Math.round(driftHours / 24);
    return held(
      `This fork's clock is ${days} days ${chain > real ? "ahead of" : "behind"} real time. ` +
        `A quote from the aggregator carries a deadline, and so does a permit, so both ` +
        `will be refused. Something moved it — prove-grant walks a vesting schedule ` +
        `years forward. Restart the fork:\n\n` +
        `    pkill -f "anvil --fork-url" && anvil --fork-url https://rpc.xlayer.tech --silent &`,
    );
  }
  return ok(chain);
}

/**
 * FIND WHERE AN ERC20 KEEPS ITS BALANCES, by experiment rather than by assumption.
 *
 * Solidity puts `mapping(address => uint256) balances` at some slot N, and an entry at
 * keccak256(abi.encode(holder, N)). Which N differs per token and proxy layout, so this
 * writes a marker into each candidate slot and asks the token what it thinks the balance
 * is. The slot that answers with the marker is the right one.
 *
 * Reverted afterwards, so the fork is left as it was found.
 */
export async function findBalanceSlot(
  client: ForkClient,
  token: Address,
  holder: Address,
  maxSlot = 64,
): Promise<Outcome<number>> {
  const {encodeAbiParameters, keccak256, toHex, erc20Abi} = await import("viem");
  const marker = 0x1234n;

  for (let slot = 0; slot < maxSlot; slot++) {
    const key = keccak256(
      encodeAbiParameters(
        [{type: "address"}, {type: "uint256"}],
        [holder, BigInt(slot)],
      ),
    );
    const before = await client.getStorageAt({address: token, slot: key});
    await client.setStorageAt({address: token, index: key, value: toHex(marker, {size: 32})});

    const seen = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [holder],
    });

    await client.setStorageAt({
      address: token,
      index: key,
      value: before ?? toHex(0n, {size: 32}),
    });

    if (seen === marker) return ok(slot);
  }

  return held(
    `Could not find the balance slot for ${token} in the first ${maxSlot}. It is probably ` +
      `a proxy with an unusual layout; fund the fork by impersonating a holder instead.`,
  );
}

/** Give an address a token balance on the fork, by writing the slot the token actually uses. */
export async function fundToken(
  client: ForkClient,
  token: Address,
  holder: Address,
  amount: bigint,
): Promise<Outcome<number>> {
  const {encodeAbiParameters, keccak256, toHex} = await import("viem");
  const slot = await findBalanceSlot(client, token, holder);
  if (!slot.ok) return slot;

  const key = keccak256(
    encodeAbiParameters([{type: "address"}, {type: "uint256"}], [holder, BigInt(slot.value)]),
  );
  await client.setStorageAt({address: token, index: key, value: toHex(amount, {size: 32})});
  return ok(slot.value);
}

/**
 * THE FORK PROOFS' PAYER. Not Anvil's account #0: that key is public, and on X Layer mainnet
 * someone has attached EIP-7702 code to its address (0xef0100…). A token that checks
 * signatures with SignatureChecker — USD₮0 does — then treats the payer as a contract and
 * rejects a plain permit with "EIP2612: invalid signature", which looks exactly like a broken
 * permit and is not one. A key nobody else knows has no code anywhere; each proof funds its
 * address with OKB on the fork before it pays.
 */
export const FORK_PAYER_KEY = keccak256(stringToHex("warrant fork proof payer"));
