"use client";

/**
 * THE FOUR THINGS THAT CAN HAPPEN TO A GRANT AFTER IT IS OPEN.
 *
 * vest is permissionless and anyone may call it. seal and revoke are the payer's alone,
 * and seal is the one that cannot be undone. Each returns its transaction so the surface
 * can say what happened rather than merely that something did.
 *
 * Like a payment, nothing is sent from a wallet that is not connected or not on X Layer:
 * the list's buttons say so first, and this refuses again in words if one is pressed.
 */
import {useCallback, useState} from "react";
import type {Address, Hex} from "viem";
import {useAccount, useConfig} from "wagmi";
import {waitForTransactionReceipt, writeContract} from "wagmi/actions";
import {xLayer} from "@/lib/chain";
import {grantEscrowAbi} from "@/lib/payroll-abi";

export type GrantAction = "vest" | "seal" | "revoke" | "close";
export type ActionPhase = "idle" | "signing" | "confirming" | "done" | "failed";

export function useGrantAction(escrow: Address | undefined) {
  const config = useConfig();
  const {address, chainId} = useAccount();
  const [phase, setPhase] = useState<ActionPhase>("idle");
  /** The grant the current phase is about. Kept after it finishes, so a failure shows on
   *  the grant it belongs to — clearing it when the call ended hid every refusal. */
  const [targetId, setTargetId] = useState<number | null>(null);
  const [action, setAction] = useState<GrantAction | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setTargetId(null);
    setAction(null);
    setWhy(null);
    setHash(null);
  }, []);

  const run = useCallback(
    async (id: number, which: GrantAction) => {
      setTargetId(id);
      setAction(which);
      setWhy(null);
      setHash(null);

      const refuse = (reason: string) => {
        setPhase("failed");
        setWhy(reason);
        return null;
      };
      if (!address) return refuse("No wallet is connected, so there is nothing to sign with.");
      if (chainId !== xLayer.id) {
        return refuse(`This wallet is on chain ${chainId}. Warrant runs on X Layer, chain ${xLayer.id}.`);
      }
      if (!escrow) return refuse("GrantEscrow is not deployed, so there is nothing to act on.");

      try {
        setPhase("signing");
        const tx = await writeContract(config, {
          address: escrow,
          abi: grantEscrowAbi,
          functionName: which,
          args: [BigInt(id)],
        });
        setHash(tx);

        setPhase("confirming");
        const receipt = await waitForTransactionReceipt(config, {hash: tx});
        if (receipt.status !== "success") return refuse(`The ${which} reverted, so nothing changed.`);

        setPhase("done");
        return tx;
      } catch (err) {
        return refuse(readable(which, err));
      }
    },
    [address, chainId, config, escrow],
  );

  return {run, phase, targetId, action, why, hash, reset};
}

/** The contract's own refusals, said in the words the buttons use. */
function readable(which: GrantAction, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/User rejected|denied transaction|rejected the request/i.test(raw)) {
    return "You dismissed the request in your wallet, so nothing changed.";
  }
  if (/NothingDue/i.test(raw)) {
    return "Nothing is ready to release yet — either the cliff has not passed, or everything vested so far has already been paid out.";
  }
  if (/SealedGrantCannotBeRevoked/i.test(raw)) {
    return "This grant is irrevocable, so it cannot be cancelled.";
  }
  if (/AlreadySealed/i.test(raw)) {
    return "This grant is already irrevocable.";
  }
  if (/AlreadyRevoked/i.test(raw)) {
    return "This grant has already been cancelled.";
  }
  if (/NotThePayer/i.test(raw)) {
    return `Only the company that opened this grant can ${which} it.`;
  }
  if (/NotFinished/i.test(raw)) {
    return "This grant still owes the beneficiary something, so it cannot be closed yet.";
  }
  if (/NotOpen/i.test(raw)) {
    return "This grant is closed.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "This wallet does not hold enough OKB to pay for the transaction.";
  }
  return raw.split("\n")[0] ?? `The ${which} did not go through.`;
}
