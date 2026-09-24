import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {Payslip} from "@/components/stub/stub";
import {EXPLORER_TX} from "@/lib/chain";
import {readRun} from "@/lib/company";
import {catchUp} from "@/lib/indexer";
import {dateUTC, runLabel, short, unitsFromRaw, usdt} from "@/lib/format";
import "@/app/landing.css";
import "@/app/[company]/company.css";
import "./run.css";

/**
 * `/run/[id]` — ONE PAYROLL RUN'S PUBLIC RECORD.
 *
 * Everyone paid in one signature, each as their own payslip, in one place. A stranger's page:
 * what a company shows when it says "we paid the team". Every figure is from the Paid events
 * of the run, summed exactly; units of two stocks are never added together.
 */
export const revalidate = 15;

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {id} = await params;
  return {
    title: `Payroll run ${runLabel(decodeURIComponent(id))} — Warrant`,
    description: "Everyone paid in one payroll run, each with a payslip and the note they were paid for.",
  };
}

export default async function RunRecordPage({params}: Params) {
  const {id} = await params;
  const runId = decodeURIComponent(id);

  await catchUp();
  const found = readRun(runId);
  if (!found.ok) notFound();

  const rows = found.value;
  const total = rows.reduce((sum, r) => sum + r.stableAmount, 0n);
  const cash = rows.reduce((sum, r) => sum + r.cashAmount, 0n);
  // Summed per stock, never across them: units of two different stocks do not add up.
  const delivered = new Map<string, {units: bigint; symbol: string; decimals: number}>();
  for (const r of rows) {
    // Someone paid all in dollars bought no stock: nothing to add up here.
    if (r.assetAmount === 0n) continue;
    const d = delivered.get(r.asset) ?? {units: 0n, symbol: r.assetSymbol, decimals: r.assetDecimals};
    d.units += r.assetAmount;
    delivered.set(r.asset, d);
  }
  const transactions = [...new Set(rows.map((r) => r.txHash))];
  const people = new Set(rows.map((r) => r.recipient.toLowerCase())).size;
  const payer = rows[0]?.payer;

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>

      <main id="main" className="wa-sec is-wide">
        <p className="wa-kicker">Payroll run</p>
        <h1 className="wa-co-name">{runLabel(runId)}</h1>

        {rows.length === 0 ? (
          <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
            <strong>No payroll run with that id.</strong>
            Either nothing was ever paid under it, or it was paid moments ago and is still being
            read from X Layer. The link on any payslip always opens its own run.
          </div>
        ) : (
          <>
            <p className="wa-lede">
              {rows.length} {rows.length === 1 ? "payslip" : "payslips"} issued
              {rows[0]?.blockTime ? ` on ${dateUTC(rows[0].blockTime)}` : ""}
              {payer ? (
                <>
                  {" "}
                  by <Link href={`/@${payer}`}>{short(payer)}</Link>
                </>
              ) : null}
              {transactions.length === 1 ? (
                <>
                  , in one signature.{" "}
                  <a href={EXPLORER_TX(transactions[0]!)}>See the transaction on X Layer</a>.
                </>
              ) : (
                <>, in {transactions.length} transactions.</>
              )}
            </p>

            <section className="wa-co-figures" aria-label="The run in figures">
              <div>
                <p className="k">Paid</p>
                <p className="wa-units-sm">{usdt(total)}</p>
              </div>
              {[...delivered.entries()].map(([asset, d]) => (
                <div key={asset}>
                  <p className="k">Received as {d.symbol}</p>
                  <p className="wa-units-sm">
                    {unitsFromRaw(d.units, d.decimals)} <span className="wa-co-sym">{d.symbol}</span>
                  </p>
                </div>
              ))}
              {cash > 0n ? (
                <div>
                  <p className="k">Received as USD₮0</p>
                  <p className="wa-units-sm">{usdt(cash)}</p>
                </div>
              ) : null}
              <div>
                <p className="k">People</p>
                <p className="wa-units-sm">{people}</p>
              </div>
            </section>

            <section className="wa-co-section" aria-labelledby="run-payslips">
              <h2 id="run-payslips" className="wa-kicker">
                Every payslip in this run
              </h2>
              <ol className="wa-run-payslips">
                {rows.map((r) => (
                  <li key={`${r.txHash}-${r.logIndex}`}>
                    <Payslip receipt={r} href={`/receipt/${r.txHash}`} compact />
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
