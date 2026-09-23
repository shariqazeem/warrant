"use client";

/**
 * SENDING A PAYMENT, ONE SIGNATURE DEEP.
 *
 * Both `/pay` and `/run` go through here, so there is one description of what a payment
 * does and not two that drift. The phases are the words the button says.
 *
 * THE SIGNATURE COUNT IS THE PRODUCT. With a separate approval a run is two transactions
 * and two waits. USDT on X Layer implements EIP-2612, so the payer signs a permit off
 * chain, for no gas, and the run is a single transaction.
 *
 * AND WHEN A PERMIT CANNOT WORK, THE APPROVAL DOES. A token whose domain cannot be
 * reproduced, a wallet that cannot sign typed data, a smart-contract wallet whose signature
 * the token cannot check (components/wallet/permit.ts), or a permit the contract refuses
 * anyway: each falls back to approve-then-pay, once, in the same press, and the wallet is
 * remembered so its next payment goes straight there.
 */
import {useCallback, useRef, useState} from "react";
import {erc20Abi, type Address, type Hex} from "viem";
import {useAccount, useConfig} from "wagmi";
import {readContract, waitForTransactionReceipt, writeContract, signTypedData} from "wagmi/actions";
import {STABLE, xLayer} from "@/lib/chain";
import {deadlineIn, permitAbi, resolveDomain} from "@/lib/permit";
import {payrollAbi} from "@/lib/payroll-abi";
import {approveFirst, isPermitRefusal, signPermit, type Permit} from "@/components/wallet/permit";
import type {BuiltLine} from "@/app/pay/actions";

export type PayPhase = "idle" | "building" | "signing" | "confirming" | "done" | "failed";

export type PayResult = {hash: Hex};

/** How long a permit signature stays good. Long enough to read the screen, not longer. */
const PERMIT_MINUTES = 30;

export function usePay(payroll: Address | undefined) {
  const config = useConfig();
  const {address, chainId} = useAccount();
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);
  /** Said while it is true: this payment is taking two wallet requests instead of one. */
  const [note, setNote] = useState<string | null>(null);
  /** Wallets, lower-cased, whose permit could not work here. Their next payment approves
   *  straight away instead of asking for a signature that cannot be used. */
  const noPermit = useRef(new Set<string>());

  const reset = useCallback(() => {
    setPhase("idle");
    setWhy(null);
    setHash(null);
    setNote(null);
  }, []);

  const pay = useCallback(
    async (lines: BuiltLine[], asset: Address, runId: Hex, total: bigint) => {
      setWhy(null);
      setHash(null);
      setNote(null);

      if (!address) {
        setPhase("failed");
        setWhy("No wallet is connected, so there is nothing to sign with.");
        return null;
      }
      if (chainId !== xLayer.id) {
        setPhase("failed");
        setWhy(`This wallet is on chain ${chainId}. Warrant pays on X Layer, chain ${xLayer.id}.`);
        return null;
      }
      if (!payroll) {
        setPhase("failed");
        setWhy("Payroll is not deployed, so there is nothing to pay through.");
        return null;
      }
      if (lines.length === 0) {
        setPhase("failed");
        setWhy("There are no lines to pay.");
        return null;
      }

      const asLine = (l: BuiltLine) => ({
        recipient: l.recipient,
        stableAmount: BigInt(l.stableAmount),
        cashAmount: BigInt(l.cashAmount),
        minOut: BigInt(l.minOut),
        reasonHash: l.reasonHash,
        routerCalldata: l.routerCalldata,
      });

      try {
        setPhase("building");

        const allowance = await readContract(config, {
          address: STABLE.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, payroll],
        });

        let txHash: Hex;

        if (allowance >= total) {
          // Already approved. One transaction, no signature needed first.
          setPhase("signing");
          txHash = await writeContract(config, {
            address: payroll,
            abi: payrollAbi,
            functionName: lines.length === 1 ? "payOne" : "payMany",
            args:
              lines.length === 1
                ? [asLine(lines[0]!), asset, runId]
                : [lines.map(asLine), asset, runId],
          });
        } else {
          const wallet = address.toLowerCase();
          let permit: Permit | null = null;

          if (!noPermit.current.has(wallet)) {
            const attempt = await signPermit({
              owner: address,
              spender: payroll,
              value: total,
              domain: () => resolveDomain(),
              nonce: () =>
                readContract(config, {
                  address: STABLE.address,
                  abi: permitAbi,
                  functionName: "nonces",
                  args: [address],
                }),
              deadline: () => deadlineIn(PERMIT_MINUTES),
              sign: (typed) => signTypedData(config, typed),
              onAsk: () => setPhase("signing"),
            });
            if (attempt.kind === "dismissed") {
              setPhase("failed");
              setWhy("You dismissed the request in your wallet, so nothing was sent.");
              return null;
            }
            if (attempt.kind === "signed") permit = attempt.permit;
            else noPermit.current.add(wallet);
          }

          let sent: Hex | null = null;
          if (permit) {
            try {
              sent = await writeContract(config, {
                address: payroll,
                abi: payrollAbi,
                functionName: lines.length === 1 ? "payOneWithPermit" : "payManyWithPermit",
                args:
                  lines.length === 1
                    ? [asLine(lines[0]!), asset, runId, permit]
                    : [lines.map(asLine), asset, runId, permit],
              });
            } catch (err) {
              // The contract refused the permit after all. Fall back to the approval — once,
              // now — and remember the wallet. Anything else is a real failure.
              if (!isPermitRefusal(err)) throw err;
              noPermit.current.add(wallet);
            }
          }

          if (sent === null) {
            // Approve, then pay: two transactions, and the payer is told why before the
            // wallet asks twice.
            setNote(approveFirst("pay"));
            setPhase("signing");
            const approveHash = await writeContract(config, {
              address: STABLE.address,
              abi: erc20Abi,
              functionName: "approve",
              args: [payroll, total],
            });
            setPhase("confirming");
            const approved = await waitForTransactionReceipt(config, {hash: approveHash});
            if (approved.status !== "success") {
              setPhase("failed");
              setWhy("The approval did not go through, so nothing was paid.");
              return null;
            }

            setPhase("signing");
            sent = await writeContract(config, {
              address: payroll,
              abi: payrollAbi,
              functionName: lines.length === 1 ? "payOne" : "payMany",
              args:
                lines.length === 1
                  ? [asLine(lines[0]!), asset, runId]
                  : [lines.map(asLine), asset, runId],
            });
          }
          txHash = sent;
        }

        setPhase("confirming");
        setHash(txHash);
        const receipt = await waitForTransactionReceipt(config, {hash: txHash});

        if (receipt.status !== "success") {
          setPhase("failed");
          setWhy(
            "The transaction reverted, so nothing was paid. The most likely cause is that " +
              "the route moved: the contract refuses to settle below the floor you signed for.",
          );
          return null;
        }

        setPhase("done");
        return {hash: txHash} satisfies PayResult;
      } catch (err) {
        // A permit refusal that got this far still sends the next press to the approval,
        // which is what the message below tells the payer.
        if (isPermitRefusal(err)) noPermit.current.add(address.toLowerCase());
        setPhase("failed");
        setWhy(readableFailure(err));
        return null;
      }
    },
    [address, chainId, config, payroll],
  );

  return {pay, phase, why, hash, note, reset};
}

/**
 * A wallet's own error text, turned into a sentence a payer can act on. The rule from
 * Scrip that is worth more than the code: a refusal is only useful if it names what to do.
 */
function readableFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/User rejected|denied transaction|rejected the request/i.test(raw)) {
    return "You dismissed the request in your wallet, so nothing was sent.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "This wallet does not hold enough OKB to pay for the transaction.";
  }
  if (/BelowMinimum/i.test(raw)) {
    return "The route moved while you were signing and would have delivered less than the floor. Nothing was paid. Ask for a fresh quote.";
  }
  if (isPermitRefusal(err)) {
    // True because the wallet is remembered on the way here: the next press approves first.
    return "Your wallet's approval signature was not accepted, so nothing was paid. Try again — it will ask you to approve the USDT with a transaction first.";
  }
  if (/TransferFromFailed|allowance/i.test(raw)) {
    return "The payment could not draw the stablecoin from this wallet. Check the balance and the approval.";
  }
  return raw.split("\n")[0] ?? "The payment did not go through.";
}
