import Link from "next/link";
import {dateUTC, runLabel, short, unitsFromRaw, usdt} from "@/lib/format";
import type {Outcome} from "@/lib/outcome";
import type {PaidTo} from "@/lib/person";
import {received} from "@/lib/received";
import "./record.css";

/**
 * WHAT WAS PAID TO THIS WALLET, on its public page: every payment where it was the
 * recipient, each linking to its receipt. The same ruled rows as the company's own list,
 * read from the same indexer; nothing here is estimated.
 *
 * Empty is said in words. A wallet nobody has paid gets a sentence, never a zero figure.
 */
export function PaidToWallet({paid, hasChoice}: {paid: Outcome<PaidTo>; hasChoice: boolean}) {
  if (!paid.ok) {
    return (
      <section className="wa-co-section wa-paid">
        <p className="wa-kicker">Paid to this wallet</p>
        <div className="wa-nothing">
          <strong>Payments to this wallet could not be read just now.</strong>
          {paid.why}
        </div>
      </section>
    );
  }

  const p = paid.value;
  if (p.paymentCount === 0) {
    return (
      <section className="wa-co-section wa-paid">
        <p className="wa-kicker">Paid to this wallet</p>
        <p className="wa-paid-none">
          Nobody has paid this wallet through Warrant yet. When a company does, each payslip
          appears here with its note, and anyone can open it.
        </p>
      </section>
    );
  }

  return (
    <section className="wa-co-section wa-paid">
      <p className="wa-kicker">Paid to this wallet</p>
      <div className="wa-co-figures">
        <div>
          <p className="k">Payments</p>
          <p className="wa-units-sm">{p.paymentCount}</p>
        </div>
        <div>
          <p className="k">{p.payers === 1 ? "From one payer" : "From payers"}</p>
          <p className="wa-units-sm">{p.payers}</p>
        </div>
        <div>
          <p className="k">Paid in total</p>
          <p className="wa-units-sm">{usdt(p.totalStable)}</p>
        </div>
        {p.deliveredByAsset.map((a) => (
          <div key={a.asset}>
            <p className="k">{a.symbol} delivered</p>
            <p className="wa-units-sm">{unitsFromRaw(a.units, a.decimals)}</p>
          </div>
        ))}
        {p.cashTotal > 0n ? (
          <div>
            <p className="k">Arrived as USD₮0</p>
            <p className="wa-units-sm">{usdt(p.cashTotal)}</p>
          </div>
        ) : null}
      </div>

      <p className="wa-paid-intro">
        {p.since !== null ? <>First paid on {dateUTC(p.since)}. </> : null}
        Newest first. Each date opens its payslip; the address is who paid.
        {hasChoice ? null : (
          <>
            {" "}
            Is this your wallet? <Link href="/me">See your grants and pay</Link>.
          </>
        )}
      </p>

      <ol className="wa-co-rows">
        {p.receipts.map((r) => (
          <li className="wa-co-row" key={`${r.txHash}-${r.logIndex}`}>
            <Link href={`/receipt/${r.txHash}`} className="wa-co-when">
              {r.blockTime === null ? `block ${r.blockNumber}` : dateUTC(r.blockTime)}
            </Link>
            <Link href={`/@${r.payer}`} className="wa-co-who wa-mono" title={`Paid by ${r.payer}`}>
              {short(r.payer)}
            </Link>
            <span className="wa-co-why">{r.reason ?? <em>note not available</em>}</span>
            <span className="wa-co-paid wa-mono">{usdt(r.stableAmount)}</span>
            <span className="wa-co-got wa-mono">
              {received(r).main}
              {received(r).plus ? <span className="wa-paid-cash">{received(r).plus}</span> : null}
            </span>
            <Link href={`/run/${r.runId}`} className="wa-co-run wa-mono">
              {runLabel(r.runId)}
            </Link>
          </li>
        ))}
      </ol>
      {p.receipts.length < p.paymentCount ? (
        <p className="wa-co-note">
          The newest {p.receipts.length} of {p.paymentCount} payments are listed; the figures
          above count every one.
        </p>
      ) : null}
    </section>
  );
}
