"use client";

/**
 * SENDING A PAYMENT, ONE SIGNATURE DEEP.
 *
 * Both `/pay` and `/run` go through here, so there is one description of what a payment
 * does and not two that drift. The phases are the words the button says.
 *
 * THE SIGNATURE COUNT IS THE PRODUCT. With a separate approval a run is two transactions
 * and two waits. USDT on X Layer implements EIP-2612, so the payer signs a permit off
 * chain, for no gas, and the run is a single transaction. If the token's domain cannot be
 * reproduced — meaning a permit signed here would be rejected on chain — this falls back
 * to a plain approval rather than producing a signature that cannot work.
 */
import {useCallback, useState} from "react";
import {erc20Abi, type Address, type Hex} from "viem";
import {useAccount, useConfig} from "wagmi";
import {readContract, waitForTransactionReceipt, writeContract, signTypedData} from "wagmi/actions";
import {STABLE, xLayer} from "@/lib/chain";
import {PERMIT_TYPES, permitAbi, resolveDomain} from "@/lib/permit";
import {payrollAbi} from "@/lib/payroll-abi";
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

  const reset = useCallback(() => {
    setPhase("idle");
    setWhy(null);
    setHash(null);
  }, []);

  const pay = useCallback(
    async (lines: BuiltLine[], asset: Address, runId: Hex, total: bigint) => {
      setWhy(null);
      setHash(null);

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
          const resolved = await resolveDomain();

          if (resolved.ok) {
            const nonce = await readContract(config, {
              address: STABLE.address,
              abi: permitAbi,
              functionName: "nonces",
              args: [address],
            });
            const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_MINUTES * 60);

            setPhase("signing");
            const signature = await signTypedData(config, {
              domain: resolved.value.domain,
              types: PERMIT_TYPES,
              primaryType: "Permit",
              message: {
                owner: address,
                spender: payroll,
                value: total,
                nonce,
                deadline,
              },
            });

            const r = `0x${signature.slice(2, 66)}` as Hex;
            const s = `0x${signature.slice(66, 130)}` as Hex;
            let v = parseInt(signature.slice(130, 132), 16);
            // Some wallets still return 0/1 where the token expects 27/28.
            if (v < 27) v += 27;

            const permit = {value: total, deadline, v, r, s};

            txHash = await writeContract(config, {
              address: payroll,
              abi: payrollAbi,
              functionName: lines.length === 1 ? "payOneWithPermit" : "payManyWithPermit",
              args:
                lines.length === 1
                  ? [asLine(lines[0]!), asset, runId, permit]
                  : [lines.map(asLine), asset, runId, permit],
            });
          } else {
            // Permit cannot be used here. Approve, then pay: two transactions, and the
            // reason is shown rather than hidden.
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
            txHash = await writeContract(config, {
              address: payroll,
              abi: payrollAbi,
              functionName: lines.length === 1 ? "payOne" : "payMany",
              args:
                lines.length === 1
                  ? [asLine(lines[0]!), asset, runId]
                  : [lines.map(asLine), asset, runId],
            });
          }
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
        setPhase("failed");
        setWhy(readableFailure(err));
        return null;
      }
    },
    [address, chainId, config, payroll],
  );

  return {pay, phase, why, hash, reset};
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
  if (/PermitFailed/i.test(raw)) {
    return "The approval signature was not accepted. Try again; it will fall back to an approval transaction.";
  }
  if (/TransferFromFailed|allowance/i.test(raw)) {
    return "The payment could not draw the stablecoin from this wallet. Check the balance and the approval.";
  }
  return raw.split("\n")[0] ?? "The payment did not go through.";
}
