import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {EXPLORER_TX} from "@/lib/chain";
import {readRun} from "@/lib/company";
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

  const found = readRun(runId);
  if (!found.ok) notFound();

  const rows = found.value;
  const total = rows.reduce((sum, r) => sum + r.stableAmount, 0n);
  const delivered = rows.reduce((sum, r) => sum + r.assetAmount, 0n);
  const symbol = rows[0]?.assetSymbol ?? "";
  const decimals = rows[0]?.assetDecimals ?? 18;
  const payer = rows[0]?.txHash;

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">A run</p>
        <h1 className="wa-co-name">{runLabel(runId)}</h1>

        {rows.length === 0 ? (
          <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
            <strong>No run by that id.</strong>
            Either it has not been indexed yet, or nothing was ever paid under it. The run
            id on a receipt is the one that works.
          </div>
        ) : (
          <>
            <p className="wa-lede">
              {rows.length} {rows.length === 1 ? "person" : "people"} paid{" "}
              {rows[0]?.blockTime ? `on ${dateUTC(rows[0].blockTime)}` : ""}, in one
              signature.{" "}
              {payer ? (
                <Link href={EXPLORER_TX(payer)}>The transaction on X Layer</Link>
              ) : null}
              .
            </p>

            <section className="wa-co-figures">
              <div>
                <p className="k">Paid</p>
                <p className="wa-units-sm">{usdt(total)}</p>
              </div>
              <div>
                <p className="k">Delivered</p>
                <p className="wa-units-sm">
                  {unitsFromRaw(delivered, decimals)} <span className="wa-co-sym">{symbol}</span>
                </p>
              </div>
              <div>
                <p className="k">People</p>
                <p className="wa-units-sm">{rows.length}</p>
              </div>
            </section>

            <section className="wa-co-section">
              <p className="wa-kicker">Every line</p>
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
