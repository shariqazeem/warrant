"use client";

import {ChevronDown} from "lucide-react";
import type {ReactNode} from "react";
import {CopyText} from "@/components/app/copy-text";
import {ceilCents, STABLE_NAME} from "@/lib/grant-terms";

/**
 * TOP UP FROM OKX: how to fill this wallet from an OKX account.
 *
 * The words follow docs/topup.md, where each claim was checked against OKX's own pages:
 * withdrawing USDT from OKX on the X Layer network lands as USD₮0, the exact token Warrant
 * pays with, so a step says "USDT" where it names what OKX shows and "USD₮0" where Warrant
 * names its own balance. OKX's fee and minimum are never printed; both change, and OKX
 * shows them on its own confirm screen. So the amount asked for is what must ARRIVE, which
 * holds whether OKX takes its fee out of the amount or on top of it.
 *
 * `usdMissing` is what the action needs minus what the wallet holds, in six-decimal base
 * units, both read from the chain; null when the wallet is empty and the need is not known
 * yet (no price). Shown rounded up to the cent, so topping up exactly that is enough.
 */
export function TopUp({
  address,
  usdMissing,
  okbShort,
  purpose,
}: {
  address: `0x${string}`;
  usdMissing: bigint | null;
  okbShort: boolean;
  /** What the wallet is for, finishing "before you can …": "issue this grant". */
  purpose: string;
}) {
  const usdKnown = usdMissing !== null && usdMissing > 0n;
  const needsUsd = usdMissing === null || usdMissing > 0n;
  if (!needsUsd && !okbShort) return null;

  const amount = usdKnown ? ceilCents(usdMissing) : null;
  const okbWords = "a little OKB for network fees";

  const steps: ReactNode[] = [
    <>
      Open the OKX app and go to <b>Assets</b>, then <b>Withdraw</b>.
    </>,
  ];
  if (needsUsd) {
    steps.push(
      <>
        Choose <b>USDT</b>. For the network, choose <b>X Layer</b>. On X Layer, OKX sends {STABLE_NAME}, the dollar
        token Warrant uses.
      </>,
      <>
        Paste the address above.{" "}
        {amount ? (
          <>
            Enter an amount so that what OKX says will arrive is at least <b>{amount} USDT</b>, then confirm.
          </>
        ) : (
          <>Enter the amount and confirm.</>
        )}{" "}
        OKX shows its own fee before you confirm.
      </>,
    );
    if (okbShort) {
      steps.push(
        <>
          For network fees, do the same with <b>OKB</b> on <b>X Layer</b>. A dollar&apos;s worth pays for many
          transactions.
        </>,
      );
    }
  } else {
    steps.push(
      <>
        Choose <b>OKB</b>. For the network, choose <b>X Layer</b>.
      </>,
      <>
        Paste the address above, enter the amount and confirm. OKX shows its own fee before you confirm. A
        dollar&apos;s worth pays for many transactions.
      </>,
    );
  }
  steps.push(<>Leave this page open. It rechecks the wallet twice a minute, and the button unlocks once the withdrawal lands.</>);

  return (
    <div className="wa-topup">
      <p className="wa-wallet-note">
        {needsUsd ? (
          <>
            This wallet needs{" "}
            {amount ? (
              <b>
                {amount} more {STABLE_NAME}
              </b>
            ) : (
              <b>{STABLE_NAME}</b>
            )}
            {okbShort ? ` and ${okbWords}` : ""}
          </>
        ) : (
          <>This wallet needs {okbWords}</>
        )}{" "}
        on the X Layer network before you can {purpose}.
      </p>
      <details className="wa-topup-how">
        <summary>
          <span>Top up from OKX</span>
          <ChevronDown size={16} strokeWidth={2} aria-hidden className="wa-topup-chev" />
        </summary>
        <div className="wa-topup-body">
          <p className="wa-topup-addr">
            <code className="wa-mono">{address}</code>
            <CopyText text={address} label="Copy address" />
          </p>
          <ol className="wa-topup-steps">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="wa-wallet-note">
            {`Pick X Layer as the network${needsUsd && okbShort ? " both times" : ""}.`} Sent on any other network, it
            arrives there instead, where Warrant cannot use it.{" "}
            <a href="https://www.okx.com/en-us/help/how-do-i-make-a-crypto-withdrawal-app" target="_blank" rel="noreferrer">
              OKX&apos;s own guide to withdrawing
            </a>
            .
          </p>
        </div>
      </details>
    </div>
  );
}
