import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {EXPLORER_TX} from "@/lib/chain";
import {readRun} from "@/lib/company";
import {catchUp} from "@/lib/indexer";
import {dateUTC, runLabel, short, unitsFromRaw, usdt} from "@/lib/format";
import "@/app/landing.css";
import "@/app/[company]/company.css";

/**
 * `/run/[id]` — ONE RUN'S PUBLIC RECORD.
 *
 * Everyone paid in one signature, in one place, each row linking to its own receipt. A
 * stranger's page: what a company shows when it says "we paid the contributors".
 */
export const revalidate = 15;

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {id} = await params;
  return {
    title: `Run ${runLabel(decodeURIComponent(id))} — Warrant`,
    description: "Everyone paid in one run, with the reason each was paid.",
  };
}

export default async function RunPage({params}: Params) {
  const {id} = await params;
  const runId = decodeURIComponent(id);

  await catchUp();
  const found = readRun(runId);
  if (!found.ok) notFound();

  const rows = found.value;
  const total = rows.reduce((sum, r) => sum + r.stableAmount, 0n);
  // Summed per stock, never across them: units of two different stocks do not add up.
  const delivered = new Map<string, {units: bigint; symbol: string; decimals: number}>();
  for (const r of rows) {
    const d = delivered.get(r.asset) ?? {units: 0n, symbol: r.assetSymbol, decimals: r.assetDecimals};
    d.units += r.assetAmount;
    delivered.set(r.asset, d);
  }
  const transactions = [...new Set(rows.map((r) => r.txHash))];
  const people = new Set(rows.map((r) => r.recipient.toLowerCase())).size;

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Payroll batch</p>
        <h1 className="wa-co-name">{runLabel(runId)}</h1>

        {rows.length === 0 ? (
          <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
            <strong>No payroll batch with that id.</strong>
            Either nothing was ever paid under it, or it happened moments ago and is still
            being read. The batch link on any receipt always works.
          </div>
        ) : (
          <>
            <p className="wa-lede">
              {people} {people === 1 ? "person" : "people"} paid{" "}
              {rows[0]?.blockTime ? `on ${dateUTC(rows[0].blockTime)}` : ""}
              {transactions.length === 1 ? (
                <>
                  , with one signature.{" "}
                  <Link href={EXPLORER_TX(transactions[0]!)}>The transaction on X Layer</Link>.
                </>
              ) : (
                <>, in {transactions.length} transactions.</>
              )}
            </p>

            <section className="wa-co-figures">
              <div>
                <p className="k">Paid</p>
                <p className="wa-units-sm">{usdt(total)}</p>
              </div>
              {[...delivered.entries()].map(([asset, d]) => (
                <div key={asset}>
                  <p className="k">Delivered</p>
                  <p className="wa-units-sm">
                    {unitsFromRaw(d.units, d.decimals)} <span className="wa-co-sym">{d.symbol}</span>
                  </p>
                </div>
              ))}
              <div>
                <p className="k">People</p>
                <p className="wa-units-sm">{people}</p>
              </div>
            </section>

            <section className="wa-co-section">
              <p className="wa-kicker">Everyone in this batch</p>
              <ol className="wa-co-rows">
                {rows.map((r) => (
                  <li className="wa-co-row" key={`${r.txHash}-${r.logIndex}`}>
                    <Link href={`/receipt/${r.txHash}`} className="wa-co-when">
                      receipt
                    </Link>
                    <span className="wa-co-who wa-mono">{short(r.recipient)}</span>
                    <span className="wa-co-why">
                      {r.reason ?? <em>reason not stored here</em>}
                    </span>
                    <span className="wa-co-paid wa-mono">{usdt(r.stableAmount)}</span>
                    <span className="wa-co-got wa-mono">
                      {unitsFromRaw(r.assetAmount, r.assetDecimals)} {r.assetSymbol}
                    </span>
                    <span className="wa-co-run" />
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
