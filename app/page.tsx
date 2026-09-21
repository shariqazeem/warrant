import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {Stub} from "@/components/stub/stub";
import {EXPLORER_TX, STABLE} from "@/lib/chain";
import {ASSETS, ISSUER, ISSUER_NOTE, ISSUER_POWERS, defaultAsset} from "@/lib/assets";
import {readRail} from "@/lib/company";
import {short, since, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
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
  // The whole rail, from the indexer. Zeroes and an empty list before anything has been
  // paid, which is rendered as a sentence rather than as a figure.
  const rail = readRail(8);
  const asset = defaultAsset();
  const latest = rail.ok ? rail.value.recent[0] : undefined;
  const now = Math.floor(Date.now() / 1000);

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

          {/*
            THE STUB IS THE ONE OBJECT, so the front door shows one — a real payment, read
            from the chain, openable by anyone. Before there is a real one it says what will
            fill it. There is no example stub here and never will be: a worked example on a
            page about receipts is the one lie this product cannot afford.
          */}
          {latest ? (
            <div className="wa-hero-stub">
              <Stub
                landed={<><strong>{usdt(latest.stableAmount)}</strong> paid</>}
                became={
                  latest.cashAmount > 0n
                    ? `${usdt(latest.stableAmount - latest.cashAmount)} of it became`
                    : "which became"
                }
                units={unitsFromRaw(latest.assetAmount, latest.assetDecimals)}
                symbol={latest.assetSymbol}
                when={latest.blockTime === null ? "settled on X Layer" : stampUTC(latest.blockTime)}
                where="in their own wallet"
                whereName={short(latest.recipient)}
                href={`/receipt/${latest.txHash}`}
                foot={latest.reason ?? undefined}
              />
            </div>
          ) : null}
        </div>

        <div className="wa-sec is-wide" style={{paddingTop: 0}}>
          <p className="wa-kicker">The tape</p>
          {rail.ok && rail.value.recent.length > 0 ? (
            <>
              <ol className="wa-tape">
                {rail.value.recent.map((r) => (
                  <li key={`${r.txHash}-${r.logIndex}`} className="wa-tape-row">
                    <span className="wa-mono">{short(r.recipient)}</span>
                    <span className="wa-tape-why">{r.reason ?? ""}</span>
                    <span className="wa-tape-amt wa-mono">
                      {unitsFromRaw(r.assetAmount, r.assetDecimals)}
                    </span>
                    <span className="wa-tape-meta">
                      for {usdt(r.stableAmount)}
                      {r.blockTime === null ? null : `, ${since(r.blockTime, now * 1000)}`}
                    </span>
                    <Link className="wa-tape-link wa-mono" href={`/receipt/${r.txHash}`}>
                      open
                    </Link>
                  </li>
                ))}
              </ol>

              <dl className="wa-rail">
                <div>
                  <dt>People paid</dt>
                  <dd>{rail.value.peoplePaid}</dd>
                </div>
                <div>
                  <dt>Payments</dt>
                  <dd>{rail.value.paymentCount}</dd>
                </div>
                <div>
                  <dt>Paid in ownership</dt>
                  <dd>{usdt(rail.value.totalStable)}</dd>
                </div>
                {rail.value.deliveredByAsset.map((a) => (
                  <div key={a.asset}>
                    <dt>Delivered in {a.symbol}</dt>
                    <dd>{unitsFromRaw(a.units, a.decimals)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <div className="wa-nothing">
              <strong>{rail.ok ? "No payments yet." : "The tape is not reading."}</strong>
              {rail.ok
                ? "Every payment made through Warrant prints here as it settles, newest " +
                  "first, with the reason it was made and the transaction it is anchored " +
                  "to. Nothing is shown until there is something real to show."
                : rail.why}
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
              {a.name}. {ISSUER_NOTE}
            </p>
          </div>
        ))}
        {/*
          The powers, named. Read off the chain by `npm run check-issuer`, not taken from
          anyone's marketing. All three assets sit behind one implementation with one owner.
        */}
        <div className="wa-rule-row">
          <span className="k">What the issuer can do</span>
          <p className="v">
            All three sit behind one upgradeable contract with one owner,{" "}
            <span className="wa-mono">{ISSUER.owner}</span>, which can{" "}
            {ISSUER_POWERS.map((p, i) => (
              <span key={p}>
                {i === 0 ? "" : i === ISSUER_POWERS.length - 1 ? ", and " : ", "}
                {p}
              </span>
            ))}
            . Warrant cannot prevent any of it. Read from X Layer on {ISSUER.checkedOn};
            there was no sign of {ISSUER.noSignOf.join(", ")}, though a power can hide
            behind a proxy and absence is weaker evidence than presence.
          </p>
        </div>

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
        {latest ? (
          <p className="wa-lede" style={{marginTop: 0}}>
            Every payment is openable by a stranger with no session: its{" "}
            <Link href={`/receipt/${latest.txHash}`}>stub</Link>, the{" "}
            <Link href={`/run/${latest.runId}`}>run</Link> it belonged to, the{" "}
            <Link href={`/@${latest.payer}`}>company</Link> that paid it, and{" "}
            <Link href={EXPLORER_TX(latest.txHash)}>the transaction on X Layer</Link>.
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
