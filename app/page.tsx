import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {Stub} from "@/components/stub/stub";
import {EXPLORER_TX, STABLE} from "@/lib/chain";
import {ASSETS, ELIGIBILITY_NOTE, ISSUER, ISSUER_NOTE_SHORT, ISSUER_POWERS, defaultAsset} from "@/lib/assets";
import {readRail} from "@/lib/company";
import {catchUp} from "@/lib/indexer";
import {short, since, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import "./landing.css";
import {AssetNote} from "@/components/pay/asset-note";

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
  await catchUp();
  const rail = readRail(8);
  const asset = defaultAsset();
  const latest = rail.ok ? rail.value.recent[0] : undefined;
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="wa-landing">
      <section className="wa-dark">
        <SiteNav />
        <div className="wa-open">
          <p className="wa-kicker">Payroll on X Layer · priced by OKX DEX</p>
          <h1 className="wa-display">Pay your team. They choose the stock.</h1>
          <p className="wa-lede">
            You pay in dollars, with one signature for everyone. Each person has chosen how
            much of their pay becomes stock — a quarter into the S&amp;P 500, all of it into
            NVIDIA, or none at all — and gets exactly that, in their own wallet, with a receipt
            that says why they were paid.
          </p>
          <div className="wa-actions">
            <Link href="/run" className="wa-btn is-primary">
              Run payroll
            </Link>
            <Link href="/me" className="wa-btn">
              Choose how you&rsquo;re paid
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
          <p className="wa-kicker">Recent payments</p>
          {rail.ok && rail.value.recent.length > 0 ? (
            <>
              <ol className="wa-tape">
                {rail.value.recent.map((r) => (
                  <li key={`${r.txHash}-${r.logIndex}`} className="wa-tape-row">
                    <span className="wa-mono">{short(r.recipient)}</span>
                    <span className="wa-tape-why">{r.reason ?? ""}</span>
                    <span className="wa-tape-amt wa-mono">
                      {unitsFromRaw(r.assetAmount, r.assetDecimals)} {r.assetSymbol}
                    </span>
                    <span className="wa-tape-meta">
                      for {usdt(r.stableAmount)}
                      {r.blockTime === null ? null : `, ${since(r.blockTime, now * 1000)}`}
                    </span>
                    <Link className="wa-tape-link wa-mono" href={`/receipt/${r.txHash}`}>
                      receipt
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
                  <dt>Total paid</dt>
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
              <strong>{rail.ok ? "No payments yet." : "Payments could not be loaded."}</strong>
              {rail.ok
                ? "Every real payment appears here the moment it settles, with its note and " +
                  "a receipt anyone can open. There are no sample rows — only real payments " +
                  "on X Layer."
                : rail.why}
            </div>
          )}
        </div>
      </section>

      <div className="wa-tear" aria-hidden />

      <section className="wa-sec">
        <p className="wa-kicker">How it works</p>
        <div className="wa-rule-row">
          <span className="k">1. Each person chooses</span>
          <p className="v">
            Once, in their own wallet, for free: how much of each payment becomes stock, and
            which stock. The choice is signed, so anyone can check it, and it follows them to
            every company that pays them through Warrant. <Link href="/me">Choose yours</Link>.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">2. You pay in dollars</span>
          <p className="v">
            One person, or your whole team as a CSV: wallet address, amount, and a note for
            each. You never pick anyone&rsquo;s stock. One signature pays everyone in a single
            transaction, and OKX DEX finds the price for each person&rsquo;s choice.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">3. Everyone is paid their way</span>
          <p className="v">
            The stock and the dollars land in each person&rsquo;s own wallet — Warrant never
            holds either. Each payment gets a public receipt with your note on it and the choice
            it followed.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">Safe by default</span>
          <p className="v">
            Every payment has a minimum amount of stock that the contract enforces. If the
            price moves too far while it is being sent, the payment is cancelled and no USDT
            leaves your wallet.
          </p>
        </div>
        <div className="wa-rule-row">
          <span className="k">Vesting grants</span>
          <p className="v">
            For the people you want to keep: stock that vests over time, for anyone you
            can&rsquo;t give company shares to. It is bought on day one and held in an
            escrow the company cannot spend, and what has vested is theirs. You can cancel the
            part that has not vested — or give that up too, by making the grant irrevocable.
          </p>
        </div>
      </section>

      <section className="wa-sec">
        <p className="wa-kicker">The stocks people can choose</p>
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
              {a.name}. {ISSUER_NOTE_SHORT} <AssetNote symbol={a.symbol} name={a.name} />
            </p>
          </div>
        ))}
        {/*
          The powers, named. Read off the chain by `npm run check-issuer`, not taken from
          anyone's marketing. Every stock here sits behind one implementation with one owner.
        */}
        <div className="wa-rule-row">
          <span className="k">What the issuer can do</span>
          <p className="v">
            These are tokenized stocks, not shares, and carry no voting rights. Every one sits
            behind the same upgradeable contract with one owner,{" "}
            <span className="wa-mono">{ISSUER.owner}</span>, which can{" "}
            {ISSUER_POWERS.map((p, i) => (
              <span key={p}>
                {i === 0 ? "" : i === ISSUER_POWERS.length - 1 ? ", and " : ", "}
                {p}
              </span>
            ))}
            . Warrant cannot prevent any of it. {ELIGIBILITY_NOTE} Read from X Layer on{" "}
            {ISSUER.checkedOn};
            there was no sign of {ISSUER.noSignOf.join(", ")}, though a power can hide
            behind a proxy and absence is weaker evidence than presence.
          </p>
        </div>


      </section>

      <section className="wa-sec">
        <p className="wa-kicker">Every payment is public</p>
        {latest ? (
          <p className="wa-lede" style={{marginTop: 0}}>
            Anyone can open any payment, no account needed: its{" "}
            <Link href={`/receipt/${latest.txHash}`}>receipt</Link>, the{" "}
            <Link href={`/run/${latest.runId}`}>payroll batch</Link> it was part of, the{" "}
            <Link href={`/@${latest.payer}`}>company</Link> that paid it, and{" "}
            <Link href={EXPLORER_TX(latest.txHash)}>the transaction on X Layer</Link>.
          </p>
        ) : (
          <div className="wa-nothing">
            <strong>Nothing to show yet.</strong>
            Every payment gets a receipt anyone can open — no account needed — showing what
            was paid, what it became, the note, and the proof on X Layer.
          </div>
        )}
      </section>

      <section className="wa-dark">
        <div className="wa-close">
          <h2 className="wa-h2">Works for AI agents too.</h2>
          <p className="wa-lede">
            An agent&rsquo;s wallet is one more line on the same file — paid in stock, with a
            receipt, like everyone else.
          </p>
        </div>
        <SiteFoot />
      </section>
    </div>
  );
}
