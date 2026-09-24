"use client";

import Link from "next/link";
import {useCallback, useEffect, useState} from "react";
import {useAccount, useDisconnect} from "wagmi";
import {readYours, type Yours, type YourGrant} from "@/app/me/actions";
import {STALE_PAGE, isStaleBuild} from "@/components/app/report";
import {Certificate} from "@/components/cert/certificate";
import {VestingRule} from "@/components/cert/vesting-rule";
import {ChoiceForm} from "@/components/choice/choice-form";
import {ChoiceWallet} from "@/components/choice/choice-wallet";
import {AssetNote} from "@/components/pay/asset-note";
import {Payslip} from "@/components/stub/stub";
import {short} from "@/lib/format";
import {held, type Outcome} from "@/lib/outcome";

/**
 * YOUR GRANTS AND PAY — the person's side, phone first.
 *
 * Connect the wallet you're paid to and this reads, from X Layer, every grant that vests to
 * it (each as its certificate) and every payslip paid to it. Nothing is written and nothing is
 * signed to look; the one signature on this page is the choice of how you're paid next
 * time, which is free and sends nothing.
 *
 * THE PAGE NEVER PROMISES WHAT IS NOT HAPPENING. "There's nothing you need to do" is said
 * only while the release service is running; otherwise it says where to release from.
 */
const certNo = (id: number) => String(id).padStart(6, "0");

/** The grant the heading speaks for: the newest still vesting, else the newest. */
function leadOf(grants: readonly YourGrant[]): YourGrant | undefined {
  const vesting = (g: YourGrant) =>
    g.standing.kind === "vesting" || g.standing.kind === "before-cliff" || g.standing.kind === "not-started";
  return grants.find(vesting) ?? grants[0];
}

function headingFor(grants: readonly YourGrant[], lead: YourGrant): string {
  const vesting = grants.filter(
    (g) => g.standing.kind === "vesting" || g.standing.kind === "before-cliff" || g.standing.kind === "not-started",
  ).length;
  if (vesting > 1) return "Your grants are vesting.";
  switch (lead.standing.kind) {
    case "vesting":
    case "before-cliff":
    case "not-started":
      return "Your grant is vesting.";
    case "fully-vested":
      return "Your grant has fully vested.";
    case "cancelled":
      return "Your grant was cancelled.";
    case "closed":
      return "Your grant is complete.";
  }
}

export function YourGrants() {
  const {address, status} = useAccount();
  const [read, setRead] = useState<{address: string; result: Outcome<Yours>} | null>(null);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (!address) return;
    let live = true;
    readYours(address)
      .catch(
        (err): Outcome<never> =>
          held(isStaleBuild(err) ? STALE_PAGE : "Your grants could not be read: the connection dropped. Try again."),
      )
      .then((result) => {
        if (live) setRead({address, result});
      });
    return () => {
      live = false;
    };
  }, [address, seq]);

  const again = useCallback(() => setSeq((n) => n + 1), []);

  // ── not connected ─────────────────────────────────────────────────────────────────
  if (status !== "connected" || !address) {
    return (
      <>
        <header className="wa-yours-head">
          <div className="wa-yours-head-inner">
            <h1 className="wa-yours-h1">Your grants and pay</h1>
            <p className="wa-yours-lede">
              Connect the wallet you&rsquo;re paid to. When a team grants you stock, its
              certificate appears here, vesting, with every payslip beside it.
            </p>
          </div>
        </header>
        <div className="wa-yours-body">
          <ChoiceWallet />
          <p className="wa-yours-fine">
            Only your wallet&rsquo;s address is read, and everything shown is public on X Layer.
            Anyone can open a certificate from its link without connecting anything.
          </p>
        </div>
      </>
    );
  }

  const mine = read && read.address === address ? read.result : null;

  // ── reading ───────────────────────────────────────────────────────────────────────
  if (!mine) {
    return (
      <>
        <header className="wa-yours-head" aria-busy="true">
          <div className="wa-yours-head-inner">
            <h1 className="wa-yours-h1">Your grants and pay</h1>
            <p className="wa-yours-lede" role="status">
              Reading your grants from X Layer…
            </p>
            <Connected address={address} />
          </div>
        </header>
        <div className="wa-yours-body">
          <span className="wa-yours-skel is-cert" aria-hidden />
          <span className="wa-yours-skel" aria-hidden />
          <span className="wa-yours-skel is-short" aria-hidden />
        </div>
      </>
    );
  }

  // ── could not read ────────────────────────────────────────────────────────────────
  if (!mine.ok) {
    return (
      <>
        <header className="wa-yours-head">
          <div className="wa-yours-head-inner">
            <h1 className="wa-yours-h1">Your grants and pay</h1>
            <p className="wa-yours-lede" role="alert">
              {mine.why}
            </p>
            <Connected address={address} />
          </div>
        </header>
        <div className="wa-yours-body">
          <button type="button" className="wa-yours-btn is-vault" onClick={again}>
            Read my grants again
          </button>
        </div>
      </>
    );
  }

  const y = mine.value;
  const lead = leadOf(y.grants);
  const vestingNow =
    lead !== undefined &&
    (lead.standing.kind === "vesting" || lead.standing.kind === "before-cliff" || lead.standing.kind === "not-started");

  return (
    <>
      <header className={`wa-yours-head${y.grants.length > 0 ? " has-cert" : ""}`}>
        <div className="wa-yours-head-inner">
          {lead ? (
            <>
              <h1 className="wa-yours-h1">{headingFor(y.grants, lead)}</h1>
              <p className="wa-yours-lede">
                <span className="wa-yours-mono">{lead.data.grantor ? short(lead.data.grantor) : "A company"}</span>{" "}
                granted you {lead.stock} stock.{" "}
                {vestingNow
                  ? y.keeperAlive
                    ? "There's nothing you need to do: what vests arrives in your wallet on schedule."
                    : "What has vested can be released any time from its certificate."
                  : lead.standing.kind === "fully-vested"
                    ? "All of it is yours; anything not yet released can be claimed from its certificate."
                    : lead.standing.kind === "cancelled"
                      ? "What had vested stays yours, and can be released from its certificate."
                      : "Everything it owed has been released to your wallet."}
              </p>
            </>
          ) : (
            <>
              <h1 className="wa-yours-h1">No grants yet.</h1>
              <p className="wa-yours-lede">When a team grants you stock, its certificate appears here, vesting.</p>
            </>
          )}
          <Connected address={address} />
        </div>
      </header>

      <div className="wa-yours-body">
        {y.grants.length > 0 ? (
          <section className="wa-yours-grants" aria-label="Your grants">
            {y.grants.map((g) => (
              <article className="wa-yours-grant" key={g.data.id}>
                <Certificate data={g.data} variant="portrait" />
                <div className="wa-yours-grant-facts">
                  <VestingRule data={g.data} tone="canvas" />
                  <p className="wa-yours-standing">
                    <strong>{g.standing.label}.</strong> {g.standing.words}
                  </p>
                  <Link href={`/g/${g.data.id}`} className="wa-yours-btn is-vault">
                    Open certificate No. {certNo(g.data.id)}
                  </Link>
                  <p className="wa-yours-note">
                    <AssetNote symbol={g.data.asset.symbol} name={g.data.asset.name} audience="anyone" />
                  </p>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {y.unread.length > 0 ? (
          <p className="wa-yours-held" role="status">
            {y.unread.length === 1
              ? `Grant No. ${certNo(y.unread[0]!.id)} could not be read just now. ${y.unread[0]!.why}`
              : `${y.unread.length} of your ${y.grantCount} grants could not be read just now. ${y.unread[0]!.why}`}{" "}
            <button type="button" className="wa-yours-linkish" onClick={again}>
              Read them again
            </button>
          </p>
        ) : null}

        <section className="wa-yours-section" aria-labelledby="me-payslips">
          <h2 id="me-payslips" className="wa-yours-h2">
            Your payslips
          </h2>
          {y.payslipsWhy ? (
            <p className="wa-yours-held">{y.payslipsWhy}</p>
          ) : y.payslips.length === 0 ? (
            <p className="wa-yours-empty">
              No payslips yet. When a company pays you through Warrant, each payslip appears here
              with what was paid, in what, and why.
            </p>
          ) : (
            <>
              <ol className="wa-yours-payslips">
                {y.payslips.map((r) => (
                  <li key={`${r.txHash}-${r.logIndex}`}>
                    <Payslip receipt={r} href={`/receipt/${r.txHash}`} compact />
                  </li>
                ))}
              </ol>
              {y.payslips.length < y.payslipCount ? (
                <p className="wa-yours-fine">
                  The newest {y.payslips.length} of {y.payslipCount} payslips are shown. Every one
                  is on <Link href={`/@${address}`}>your public page</Link>.
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="wa-yours-section" aria-labelledby="me-choose">
          <details className="wa-yours-choose">
            <summary id="me-choose">Choose how you&rsquo;re paid next time</summary>
            <p className="wa-yours-choose-lede">
              Pick a stock, or keep plain USD₮0. It&rsquo;s a free signature that sends nothing.
              Every payslip follows it, and a company granting you stock sees which one you
              chose. You can change it any time.
            </p>
            <ChoiceForm />
          </details>
        </section>
      </div>
    </>
  );
}

/** The connected wallet, and the way to switch it. */
function Connected({address}: {address: string}) {
  const {connector} = useAccount();
  const {disconnect} = useDisconnect();
  return (
    <p className="wa-yours-connected">
      {connector?.name ?? "Wallet"} <span className="wa-yours-mono">{short(address)}</span>{" "}
      <button type="button" className="wa-yours-linkish" onClick={() => disconnect()}>
        Use a different wallet
      </button>
    </p>
  );
}
