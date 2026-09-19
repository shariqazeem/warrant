import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {EXPLORER_TX, STABLE} from "@/lib/chain";
import {ASSETS, ISSUER_NOTE, defaultAsset} from "@/lib/assets";
import {recentPaid} from "@/lib/receipts";
import {short, since, unitsFromRaw, usdt} from "@/lib/format";
import "./landing.css";

/**
 * THE FRONT DOOR. Ink opening, the tape, what a stock could not do before, then the paper
 * tears off: the honesty rows and the public record. Ink close.
 *
 * NOTHING HERE IS INVENTED. The tape renders payments read from the chain, and when there
 * are none it says in words what will fill it. There is no sample row anywhere on this
 * page, because a sample row on a page about receipts is the one lie that would cost the
 * whole product its point.
 */
export const revalidate = 15;

export default async function Home() {
  const tape = await recentPaid(8);
  const asset = defaultAsset();

  return (
    <div className="wa-landing">
      <section className="wa-dark">
        <SiteNav />
        <div className="wa-open">
          <p className="wa-kicker">There is no opening bell.</p>
          <h1 className="wa-display">A company pays its people in ownership.</h1>
          <p className="wa-lede">
            Upload a file of names and amounts, sign once, and every person is paid in a
            tokenized stock in their own wallet — each with a receipt carrying the reason
            they were paid.
          </p>
          <div className="wa-actions">
            <Link href="/pay" className="wa-btn is-primary">
              Pay someone
            </Link>
            <Link href="/run" className="wa-btn">
              Pay a run
            </Link>
          </div>
        </div>

        <div className="wa-sec is-wide" style={{paddingTop: 0}}>
          <p className="wa-kicker">The tape</p>
          {tape.ok && tape.value.length > 0 ? (
            <ol className="wa-tape">
              {tape.value.map((r) => (
                <li key={`${r.txHash}-${r.logIndex}`} className="wa-tape-row">
                  <span className="wa-mono">{short(r.recipient)}</span>
                  <span className="wa-tape-amt wa-mono">
                    {unitsFromRaw(r.assetAmount, asset.decimals)}
                  </span>
                  <span className="wa-tape-meta">
                    for {usdt(r.stableAmount)}
                    {r.timestamp === null ? null : `, ${since(r.timestamp)}`}
                  </span>
                  <Link className="wa-tape-link wa-mono" href={`/receipt/${r.txHash}`}>
                    {short(r.txHash)}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="wa-nothing">
              <strong>{tape.ok ? "No payments yet." : "The tape is not reading."}</strong>
              {tape.ok
                ? "Every payment made through Warrant prints here as it settles, newest " +
                  "first, with the transaction it is anchored to. Nothing is shown until " +
                  "there is something real to show."
                : tape.why}
            </div>
          )}
        </div>
      </section>

      <div className="wa-tear" aria-hidden />

      <section className="wa-sec">
        <p className="wa-kicker">What a stock could not do before</p>
        <div className="wa-rule-row">
          <span className="k">Be paid, not bought</span>
          <p className="v">
            A stock position could only be acquired by the person who ends up holding it.
            Here the company sends it, as the payment itself, in one signature.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">Carry a reason</span>
          <p className="v">
            Every payment prints a stub with the reason written on it. Only the hash of the
            reason goes on chain; the text is stored, and the two are checked against each
            other on the receipt.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">Land in their own wallet</span>
          <p className="v">
            The asset is delivered to the recipient&rsquo;s own address. Warrant holds
            nothing between transactions, and the contract reverts if the amount that
            arrives is below the floor the payer signed for.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">Vest without a custodian</span>
          <p className="v">
            A grant sits in an escrow the payer cannot reach into. Vesting is permissionless:
            anyone can release what is due, and is paid a fixed tip for doing it.
          </p>
        </div>
      </section>

      <section className="wa-sec">
        <p className="wa-kicker">What you are being paid in</p>
        {/*
          PER-ROW DISCLOSURE, NEVER A BANNER. An asset carries issuer powers and they belong
          beside the asset, on the row where someone decides to be paid in it. One list, in
          lib/assets.ts, so this page and a receipt cannot say different things.
        */}
        {ASSETS.map((a) => (
          <div className="wa-rule-row" key={a.address}>
            <span className="k">
              {a.symbol}
              {a.address === asset.address ? <em className="wa-default"> default</em> : null}
            </span>
            <p className="v">
              {a.name}. {ISSUER_NOTE} Read the issuer&rsquo;s terms before being paid in it.
            </p>
          </div>
        ))}
        <div className="wa-rule-row">
          <span className="k">{STABLE.symbol}</span>
          <p className="v">
            What the payer pays with, and what a split leaves as cash. Six decimals on X
            Layer.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">The route</span>
          <p className="v">
            The swap is routed by the OKX DEX aggregator. Warrant never chooses the asset,
            the amount or the reason — the payer does, and the contract checks what arrived
            against what was promised.
          </p>
        </div>
      </section>

      <section className="wa-sec">
        <p className="wa-kicker">The public record</p>
        {tape.ok && tape.value.length > 0 ? (
          <p className="wa-lede" style={{marginTop: 0}}>
            Every payment is openable by a stranger with no session. The most recent one is{" "}
            <Link href={`/receipt/${tape.value[0]!.txHash}`}>its stub</Link>, anchored to{" "}
            <Link href={EXPLORER_TX(tape.value[0]!.txHash)}>
              the transaction on X Layer
            </Link>
            .
          </p>
        ) : (
          <div className="wa-nothing">
            <strong>Nothing is published yet.</strong>
            When payments exist, every one of them is openable by a stranger with no
            session: the stub, the reason, and the transaction it is anchored to.
          </div>
        )}
      </section>

      <section className="wa-dark">
        <div className="wa-close">
          <h2 className="wa-h2">The same rail pays agents.</h2>
          <p className="wa-lede">
            A person earning a bounty and an agent earning through x402 are the same line in
            the same run. The reason is written on both.
          </p>
        </div>
        <SiteFoot />
      </section>
    </div>
  );
}
