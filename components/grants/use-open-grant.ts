"use client";

/**
 * OPENING A GRANT: one signature, like a payment.
 *
 * The stablecoin is approved by an EIP-2612 permit where the token supports it, so the
 * whole thing — approve, buy the asset, lock it in the escrow on a schedule — is a single
 * transaction. Falls back to an approval transaction where permit cannot be used.
 */
import {useCallback, useState} from "react";
import {erc20Abi, type Address, type Hex} from "viem";
import {useAccount, useConfig} from "wagmi";
import {readContract, signTypedData, waitForTransactionReceipt, writeContract} from "wagmi/actions";
import {STABLE, xLayer} from "@/lib/chain";
import {PERMIT_TYPES, permitAbi, resolveDomain} from "@/lib/permit";
import {grantEscrowAbi} from "@/lib/payroll-abi";
import type {BuiltTerms} from "@/app/grants/actions";

export type OpenPhase = "idle" | "building" | "signing" | "confirming" | "done" | "failed";

const PERMIT_MINUTES = 30;

export function useOpenGrant(escrow: Address | undefined) {
  const config = useConfig();
  const {address, chainId} = useAccount();
  const [phase, setPhase] = useState<OpenPhase>("idle");
  const [why, setWhy] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setWhy(null);
  }, []);

  const open = useCallback(
    async (terms: BuiltTerms) => {
      setWhy(null);

      if (!address) {
        setPhase("failed");
        setWhy("No wallet is connected, so there is nothing to sign with.");
        return null;
      }
      if (chainId !== xLayer.id) {
        setPhase("failed");
        setWhy(`This wallet is on chain ${chainId}. Warrant grants on X Layer, chain ${xLayer.id}.`);
        return null;
      }
      if (!escrow) {
        setPhase("failed");
        setWhy("GrantEscrow is not deployed, so there is nowhere to open a grant.");
        return null;
      }

      const asTuple = {
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
      const total = BigInt(terms.stableAmount);

      try {
        setPhase("building");

        const allowance = await readContract(config, {
          address: STABLE.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, escrow],
        });

        let tx: Hex;

        if (allowance >= total) {
          setPhase("signing");
          tx = await writeContract(config, {
            address: escrow,
            abi: grantEscrowAbi,
            functionName: "open",
            args: [asTuple],
          });
        } else {
          const domain = await resolveDomain();
          if (domain.ok) {
            const nonce = await readContract(config, {
              address: STABLE.address,
              abi: permitAbi,
              functionName: "nonces",
              args: [address],
            });
            const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_MINUTES * 60);

            setPhase("signing");
            const signature = await signTypedData(config, {
              domain: domain.value.domain,
              types: PERMIT_TYPES,
              primaryType: "Permit",
              message: {owner: address, spender: escrow, value: total, nonce, deadline},
            });

            const r = `0x${signature.slice(2, 66)}` as Hex;
            const s = `0x${signature.slice(66, 130)}` as Hex;
            let v = parseInt(signature.slice(130, 132), 16);
            if (v < 27) v += 27;

            tx = await writeContract(config, {
              address: escrow,
              abi: grantEscrowAbi,
              functionName: "openWithPermit",
              args: [asTuple, total, deadline, v, r, s],
            });
          } else {
            setPhase("signing");
            const approveHash = await writeContract(config, {
              address: STABLE.address,
              abi: erc20Abi,
              functionName: "approve",
              args: [escrow, total],
            });
            setPhase("confirming");
            const approved = await waitForTransactionReceipt(config, {hash: approveHash});
            if (approved.status !== "success") {
              setPhase("failed");
              setWhy("The approval did not go through, so no grant was opened.");
              return null;
            }

            setPhase("signing");
            tx = await writeContract(config, {
              address: escrow,
              abi: grantEscrowAbi,
              functionName: "open",
              args: [asTuple],
            });
          }
        }

        setPhase("confirming");
        const receipt = await waitForTransactionReceipt(config, {hash: tx});
        if (receipt.status !== "success") {
          setPhase("failed");
          setWhy(
            "The transaction reverted, so no grant was opened. The most likely cause is " +
              "that the route moved: the contract refuses to open below the floor you signed for.",
          );
          return null;
        }

        setPhase("done");
        return tx;
      } catch (err) {
        setPhase("failed");
        setWhy(readable(err));
        return null;
      }
    },
    [address, chainId, config, escrow],
  );

  return {open, phase, why, reset};
}

function readable(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/User rejected|denied transaction|rejected the request/i.test(raw)) {
    return "You dismissed the request in your wallet, so no grant was opened.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "This wallet does not hold enough OKB to pay for the transaction.";
  }
  if (/BelowMinimum/i.test(raw)) {
    return "The route moved while you were signing and would have bought less than the floor. Nothing was opened. Ask for a fresh quote.";
  }
  if (/BeneficiaryIsThePayer/i.test(raw)) {
    return "A grant cannot be made to the wallet opening it.";
  }
  if (/TipTooHigh/i.test(raw)) {
    return "A keeper's share cannot exceed 2% of each release.";
  }
  if (/CliffAfterDuration/i.test(raw)) {
    return "The cliff cannot fall after the grant has fully vested.";
  }
  return raw.split("\n")[0] ?? "The grant was not opened.";
}
