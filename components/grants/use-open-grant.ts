"use client";

/**
 * ISSUING A GRANT: the wallet side.
 *
 * The stablecoin is approved by an EIP-2612 permit where the wallet can sign one, so the
 * whole thing — approve, buy the stock, lock it in the escrow on a schedule — is one
 * transaction after one free signature. Where a permit cannot work (a wallet that cannot sign
 * typed data, a smart-contract or delegated account, or a permit the escrow refuses) it falls
 * back to an approval transaction, once, and remembers that wallet for the session.
 *
 * EVERY TRANSACTION IS SIMULATED BEFORE THE WALLET IS ASKED. A grant the contract would
 * refuse — the price moved under the floor, a cliff after the end — is said in words before
 * anyone signs anything, rather than as a revert that cost them the network fee.
 *
 * A WALLET SAYING NO IS NOT AN ERROR. The person closed a request; the form goes back to
 * where it was and says nothing was sent.
 *
 * Relative imports, so the words below can be tested without the app's alias.
 */
import {useCallback, useState} from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  WaitForTransactionReceiptTimeoutError,
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {useAccount, useBytecode, useConfig} from "wagmi";
import {
  readContract,
  signTypedData,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {STABLE, xLayer} from "../../lib/chain";
import {
  MAX_DURATION_DAYS,
  MAX_TIP_BPS,
  STABLE_NAME,
  feeText,
  floorUnits,
} from "../../lib/grant-terms";
import {deadlineIn, permitAbi, resolveDomain} from "../../lib/permit";
import {grantEscrowAbi} from "../../lib/payroll-abi";
import {isPermitRefusal, isUserRejection, signPermit, type Permit} from "../wallet/permit";
import type {BuiltTerms} from "../../app/grants/actions";

export type IssuePhase =
  | {kind: "idle"}
  /** Reading the allowance or simulating: nothing is being asked of the wallet yet. */
  | {kind: "checking"}
  /** The wallet has a request open: a permit signature, an approval, or the grant itself. */
  | {kind: "waiting"; step: "permit" | "approve" | "issue"}
  /** The approval was sent and is confirming. */
  | {kind: "approving"; hash: Hex}
  /** The grant was sent and is confirming: "Engraving…". */
  | {kind: "submitted"; hash: Hex}
  | {kind: "issued"; hash: Hex; id: number | null}
  /** The person closed the request in their wallet. Normal, and nothing was sent. */
  | {kind: "rejected"}
  /** X Layer has not confirmed it yet. Never issue again while this is true. */
  | {kind: "unconfirmed"; hash: Hex}
  | {kind: "failed"; why: string; hash?: Hex};

const PERMIT_MINUTES = 30;
/** After an approval confirms, a node behind the wallet's may not have seen it yet. */
const RESIMULATE_TRIES = 3;
const RESIMULATE_GAP_MS = 1_500;

/** The stock a failure is said in, for the one error that carries amounts. */
export type IssueStock = {symbol: string; decimals: number};

function* causes(err: unknown): Generator<unknown> {
  let e: unknown = err;
  for (let depth = 0; depth < 8 && e !== undefined && e !== null; depth++) {
    yield e;
    e = (e as {cause?: unknown}).cause;
  }
}

/** The contract's own error, by name, when the failure carries one. */
export function revertOf(err: unknown): {name: string; args: readonly unknown[]} | null {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return {name: reverted.data.errorName, args: reverted.data.args ?? []};
    }
  }
  // A wallet that passed the revert through as text still names it.
  const names = grantEscrowAbi.filter((x) => x.type === "error").map((x) => x.name);
  for (const e of causes(err)) {
    const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    const found = names.find((n) => new RegExp(`\\b${n}\\b`).test(text));
    if (found) return {name: found, args: []};
  }
  return null;
}

const FRESH_QUOTE = "Nothing was sent. Try again for a fresh quote.";

/**
 * WHAT WENT WRONG, AS ONE SENTENCE THAT SAYS WHAT TO DO NEXT. Every GrantEscrow error the
 * issue path can raise has its own words; anything else says what the wallet or node said.
 * Never an apology, never a code on its own.
 */
export function issueFailureWords(err: unknown, stock: IssueStock): string {
  const revert = revertOf(err);
  if (revert) {
    switch (revert.name) {
      case "BelowMinimum": {
        const [delivered, minOut] = revert.args as [bigint | undefined, bigint | undefined];
        if (typeof delivered === "bigint" && typeof minOut === "bigint") {
          return (
            `The price moved since the quote: the route would now buy ` +
            `${floorUnits(delivered, stock.decimals)} ${stock.symbol}, under the guaranteed ` +
            `${floorUnits(minOut, stock.decimals)}. ${FRESH_QUOTE}`
          );
        }
        return `The price moved since the quote, below the guaranteed minimum. ${FRESH_QUOTE}`;
      }
      case "RouterCallFailed":
        return `OKX DEX's route failed when it ran, usually because the price moved. ${FRESH_QUOTE}`;
      case "MinOutRequired":
        return `The quote carried no minimum, so the contract refused it. ${FRESH_QUOTE}`;
      case "BeneficiaryIsThePayer":
        return "A grant can't go to the wallet issuing it. Enter their address, not yours.";
      case "ZeroBeneficiary":
        return "Add their wallet address.";
      case "BeneficiaryIsThisContract":
        return "That is the escrow's own address. A grant goes to a person's wallet.";
      case "ZeroAsset":
      case "AssetIsStable":
        return "Pick a stock.";
      case "ZeroAmount":
        return "Enter a grant value.";
      case "TipTooHigh":
        return `The release fee can be at most ${feeText(MAX_TIP_BPS)}.`;
      case "ZeroDuration":
        return "Vesting needs a length.";
      case "DurationTooLong":
        return `A grant can vest over at most ${MAX_DURATION_DAYS.toLocaleString("en-US")} days.`;
      case "CliffAfterDuration":
        return "The cliff can't be longer than the vesting.";
      case "NoShares":
        return "This grant value is too small to hold any stock. Try a larger amount.";
      case "PermitFailed":
        return (
          "Your wallet's approval signature wasn't accepted, so nothing was sent. Try again: " +
          `it will ask you to approve the ${STABLE_NAME} with a transaction first.`
        );
      case "TransferFromFailed":
        return `The escrow couldn't take the ${STABLE_NAME}. Check this wallet holds enough, then try again.`;
      default:
        return `X Layer refused the grant (${revert.name}). Nothing was sent.`;
    }
  }
  for (const e of causes(err)) {
    if (e instanceof InsufficientFundsError) {
      return "This wallet doesn't hold enough OKB for the network fee. Add a little OKB on X Layer, then try again.";
    }
  }
  const said =
    err instanceof BaseError ? err.shortMessage : err instanceof Error ? err.message : String(err ?? "");
  if (/insufficient funds/i.test(said)) {
    return "This wallet doesn't hold enough OKB for the network fee. Add a little OKB on X Layer, then try again.";
  }
  if (/chain|network/i.test(said) && /mismatch|does not match|wrong/i.test(said)) {
    return "Your wallet is on another network. Switch it to X Layer, then try again.";
  }
  const first = said.split("\n")[0]?.trim();
  return first ? `${first.replace(/\.?$/, ".")} Nothing was sent unless your wallet shows it.` : "The grant was not issued.";
}

/**
 * The simulation right after an approval confirms, asked again a few times: the node that
 * answers it can be a block behind the one that confirmed the approval, and would report an
 * allowance that is already there as missing.
 */
async function simulateAfterApproval<T>(simulate: () => Promise<T>): Promise<T> {
  for (let tryNo = 1; ; tryNo++) {
    try {
      return await simulate();
    } catch (err) {
      if (tryNo >= RESIMULATE_TRIES) throw err;
      await new Promise((r) => setTimeout(r, RESIMULATE_GAP_MS));
    }
  }
}

/** The id of the grant a confirmed transaction opened in this escrow, or null. */
export function grantIdFrom(logs: Parameters<typeof parseEventLogs>[0]["logs"], escrow: Address): number | null {
  const opened = parseEventLogs({abi: grantEscrowAbi, eventName: "GrantOpened", logs}).find(
    (l) => l.address.toLowerCase() === escrow.toLowerCase(),
  );
  return opened ? Number(opened.args.id) : null;
}

export function useOpenGrant(escrow: Address | undefined, stock: IssueStock) {
  const config = useConfig();
  const {address, chainId} = useAccount();
  const [phase, setPhase] = useState<IssuePhase>({kind: "idle"});
  /** Wallets, lower-cased, whose permit could not work here; they approve first. */
  const [noPermit, setNoPermit] = useState<ReadonlySet<string>>(() => new Set());

  // An account with code — a smart-contract wallet, or one delegated under EIP-7702 — has its
  // permit checked by that code, and USD₮0 will not take an ordinary signature from it.
  const code = useBytecode({address, chainId: xLayer.id, query: {enabled: Boolean(address)}});
  const hasCode = typeof code.data === "string" && code.data !== "0x";

  /** Whether one signature can approve the USDT and issue, or the wallet will ask twice. */
  const oneSignature = !(address && (noPermit.has(address.toLowerCase()) || hasCode));

  const refuse = useCallback((wallet: string) => {
    setNoPermit((prev) => new Set(prev).add(wallet));
  }, []);

  const reset = useCallback(() => setPhase({kind: "idle"}), []);

  const issue = useCallback(
    async (terms: BuiltTerms): Promise<{hash: Hex; id: number | null} | null> => {
      if (!address) {
        setPhase({kind: "failed", why: "Connect a wallet to issue."});
        return null;
      }
      if (chainId !== xLayer.id) {
        setPhase({kind: "failed", why: "Your wallet is on another network. Switch it to X Layer, then try again."});
        return null;
      }
      if (!escrow) {
        setPhase({kind: "failed", why: "Grants are not switched on for this site yet."});
        return null;
      }

      const tuple = {
        beneficiary: terms.beneficiary,
        asset: terms.asset,
        stableAmount: BigInt(terms.stableAmount),
        minOut: BigInt(terms.minOut),
        start: BigInt(terms.start),
        cliff: BigInt(terms.cliff),
        duration: BigInt(terms.duration),
        tipBps: terms.tipBps,
        reasonHash: terms.reasonHash,
        routerCalldata: terms.routerCalldata,
      };
      const total = tuple.stableAmount;
      const wallet = address.toLowerCase();
      const base = {account: address, chainId: xLayer.id} as const;
      let sent: Hex | null = null;

      const simulateOpen = () =>
        simulateContract(config, {...base, address: escrow, abi: grantEscrowAbi, functionName: "open", args: [tuple]});

      try {
        setPhase({kind: "checking"});
        const allowance = await readContract(config, {
          address: STABLE.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, escrow],
          chainId: xLayer.id,
        });

        if (allowance >= total) {
          const {request} = await simulateOpen();
          setPhase({kind: "waiting", step: "issue"});
          sent = await writeContract(config, request);
        } else {
          let permit: Permit | null = null;
          if (oneSignature) {
            const attempt = await signPermit({
              owner: address,
              spender: escrow,
              value: total,
              domain: () => resolveDomain(),
              nonce: () =>
                readContract(config, {
                  address: STABLE.address,
                  abi: permitAbi,
                  functionName: "nonces",
                  args: [address],
                  chainId: xLayer.id,
                }),
              deadline: () => deadlineIn(PERMIT_MINUTES),
              sign: (typed) => signTypedData(config, typed),
              onAsk: () => setPhase({kind: "waiting", step: "permit"}),
            });
            if (attempt.kind === "dismissed") {
              setPhase({kind: "rejected"});
              return null;
            }
            if (attempt.kind === "signed") permit = attempt.permit;
            else refuse(wallet);
          }

          if (permit) {
            setPhase({kind: "checking"});
            try {
              const {request} = await simulateContract(config, {
                ...base,
                address: escrow,
                abi: grantEscrowAbi,
                functionName: "openWithPermit",
                args: [tuple, permit.value, permit.deadline, permit.v, permit.r, permit.s],
              });
              setPhase({kind: "waiting", step: "issue"});
              sent = await writeContract(config, request);
            } catch (err) {
              // Refused after all: approve instead, once, now, and remember the wallet.
              if (!isPermitRefusal(err)) throw err;
              refuse(wallet);
            }
          }

          if (sent === null) {
            setPhase({kind: "checking"});
            const approve = await simulateContract(config, {
              ...base,
              address: STABLE.address,
              abi: erc20Abi,
              functionName: "approve",
              // The exact amount, never unlimited.
              args: [escrow, total],
            });
            setPhase({kind: "waiting", step: "approve"});
            const approveHash = await writeContract(config, approve.request);
            setPhase({kind: "approving", hash: approveHash});
            const approved = await waitForTransactionReceipt(config, {hash: approveHash, chainId: xLayer.id});
            if (approved.status !== "success") {
              setPhase({
                kind: "failed",
                why: `The approval did not go through, so no grant was issued and no ${STABLE_NAME} moved.`,
                hash: approveHash,
              });
              return null;
            }

            setPhase({kind: "checking"});
            const simulated = await simulateAfterApproval(simulateOpen);
            setPhase({kind: "waiting", step: "issue"});
            sent = await writeContract(config, simulated.request);
          }
        }

        setPhase({kind: "submitted", hash: sent});
        const receipt = await waitForTransactionReceipt(config, {hash: sent, chainId: xLayer.id});
        if (receipt.status !== "success") {
          setPhase({
            kind: "failed",
            why: `The transaction reverted on X Layer, so no grant was issued and no ${STABLE_NAME} left your wallet.`,
            hash: sent,
          });
          return null;
        }
        const id = grantIdFrom(receipt.logs, escrow);
        setPhase({kind: "issued", hash: sent, id});
        return {hash: sent, id};
      } catch (err) {
        if (isUserRejection(err)) {
          setPhase({kind: "rejected"});
          return null;
        }
        if (sent && err instanceof WaitForTransactionReceiptTimeoutError) {
          setPhase({kind: "unconfirmed", hash: sent});
          return null;
        }
        // The next press approves first, which is what the message says.
        if (isPermitRefusal(err)) refuse(wallet);
        setPhase({kind: "failed", why: issueFailureWords(err, stock), hash: sent ?? undefined});
        return null;
      }
    },
    [address, chainId, config, escrow, oneSignature, refuse, stock],
  );

  /** After "unconfirmed": wait on the same transaction again, never send another. */
  const recheck = useCallback(
    async (hash: Hex): Promise<{hash: Hex; id: number | null} | null> => {
      if (!escrow) return null;
      setPhase({kind: "submitted", hash});
      try {
        const receipt = await waitForTransactionReceipt(config, {hash, chainId: xLayer.id});
        if (receipt.status !== "success") {
          setPhase({
            kind: "failed",
            why: `The transaction reverted on X Layer, so no grant was issued and no ${STABLE_NAME} left your wallet.`,
            hash,
          });
          return null;
        }
        const id = grantIdFrom(receipt.logs, escrow);
        setPhase({kind: "issued", hash, id});
        return {hash, id};
      } catch {
        setPhase({kind: "unconfirmed", hash});
        return null;
      }
    },
    [config, escrow],
  );

  return {phase, issue, recheck, reset, oneSignature};
}
