import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {ScheduleBar} from "@/components/grants/schedule-bar";
import {EXPLORER_ADDRESS} from "@/lib/chain";
import {readCompany} from "@/lib/company";
import {catchUp} from "@/lib/indexer";
import {dateUTC, short, since as sinceWords, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {runLabel} from "@/lib/format";
import "@/app/landing.css";
import "@/components/grants/grants.css";
import "./company.css";

/**
 * `/@0x…` — A COMPANY'S PUBLIC RECORD.
 *
 * A stranger's page: no session, no wallet, no owner chrome. Everything on it is a sum
 * over rows the indexer copied from the chain, and each one links to the receipt it came
 * from. A company that has paid nobody gets a page that says so, in words.
 *
 * The leading @ is optional and cosmetic. An address is the identity here; there is no
 * handle registry, because a handle nobody can verify is worse than an address everybody
 * can.
 */
export const revalidate = 15;

type Params = {params: Promise<{company: string}>};

const normalise = (raw: string) => decodeURIComponent(raw).replace(/^@/, "");

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {company} = await params;
  const address = normalise(company);
  return {
    title: `${short(address)} — paid in ownership — Warrant`,
    description: "Every payment this company has made, with the reason it was made.",
  };
}

export default async function CompanyPage({params}: Params) {
  const {company} = await params;
  const address = normalise(company);

  // Anything that is not an address is not a company. A 404 is more honest than a page
  // explaining itself.
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();

  // A stranger arriving by link has not just paid anyone, so nothing has synced for them.
  // Bounded: it moves an existing cursor a window or two and never cold-starts a page.
  await catchUp();

  const record = readCompany(address);
  if (!record.ok) notFound();
  const c = record.value;
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Company payroll record</p>
        <h1 className="wa-co-name wa-mono">{address}</h1>
        <p className="wa-lede">
          {c.since === null ? (
            <>This wallet has not paid anyone through Warrant yet.</>
          ) : (
            <>
              Paying people in stock since {dateUTC(c.since)} ({sinceWords(c.since, now * 1000)}).
            </>
          )}{" "}
          <Link href={EXPLORER_ADDRESS(address)}>See it on X Layer</Link>.
        </p>

        {c.paymentCount === 0 && c.grants.length === 0 ? (
          <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
            <strong>Nothing to show yet.</strong>
            When this company pays someone, the payment appears here with its note and a
            receipt anyone can open. Only real payments are ever shown.
          </div>
        ) : (
          <>
            <section className="wa-co-figures">
              <div>
                <p className="k">People paid</p>
                <p className="wa-units-sm">{c.peoplePaid}</p>
              </div>
              <div>
                <p className="k">Payments</p>
                <p className="wa-units-sm">{c.paymentCount}</p>
              </div>
              <div>
                <p className="k">Payroll batches</p>
                <p className="wa-units-sm">{c.runCount}</p>
              </div>
              <div>
                <p className="k">Total paid</p>
                <p className="wa-units-sm">{usdt(c.totalStable)}</p>
              </div>
              {c.grants.length > 0 ? (
                <div>
                  <p className="k">Granted</p>
                  <p className="wa-units-sm">{usdt(c.grantsTotalStable)}</p>
                </div>
              ) : null}
            </section>

            {c.deliveredByAsset.length > 0 ? (
              <section className="wa-co-section">
                <p className="wa-kicker">Stock delivered to people&rsquo;s wallets</p>
                {c.deliveredByAsset.map((a) => (
                  <div className="wa-rule-row" key={a.asset}>
                    <span className="k">{a.symbol}</span>
                    <p className="v">
                      <span className="wa-units-sm">{unitsFromRaw(a.units, a.decimals)}</span>{" "}
                      <span className="wa-co-sym">{a.symbol}</span>
                      <br />
                      <Link href={EXPLORER_ADDRESS(a.asset)} className="wa-mono wa-co-addr">
                        {a.asset}
                      </Link>
                    </p>
                  </div>
                ))}
              </section>
            ) : null}

            {c.grants.length > 0 ? (
              <section className="wa-co-section">
                <p className="wa-kicker">Grants vesting</p>
                {c.grants.map((g) => (
                  <article className="wa-grant" key={g.id}>
                    <div className="wa-grant-head">
                      <span className="wa-grant-who wa-mono">{short(g.beneficiary)}</span>
                      <span className="wa-grant-units">
                        {unitsFromRaw(g.units, g.assetDecimals)}
                        <span className="sym">{g.assetSymbol}</span>
                      </span>
                    </div>
                    {g.reason ? <p className="wa-grant-why">{g.reason}</p> : null}
                    <ScheduleBar
                      schedule={{
                        shares: g.units,
                        start: g.startAt,
                        cliffSeconds: g.cliffSeconds,
                        durationSeconds: g.durationSeconds,
                      }}
                      releasedShares={0n}
                      now={now}
                    />
                    <div className="wa-grant-rows">
                      <span>
                        Term<b>{humanDuration(g.durationSeconds)}</b>
                      </span>
                      <span>
                        Cliff<b>{g.cliffSeconds === 0 ? "none" : humanDuration(g.cliffSeconds)}</b>
                      </span>
                      <span>
                        Cost<b>{usdt(g.stableCost)}</b>
                      </span>
                    </div>
                  </article>
                ))}
                <p className="wa-co-note">
                  Drawn from the terms each grant was opened with. What is actually held and
                  due today is on <Link href="/grants">the grants page</Link>, read from the
                  contract itself.
                </p>
              </section>
            ) : null}

            {c.receipts.length > 0 ? (
              <section className="wa-co-section">
                <p className="wa-kicker">Every payment, with its note</p>
                <ol className="wa-co-rows">
                  {c.receipts.map((r) => (
                    <li className="wa-co-row" key={`${r.txHash}-${r.logIndex}`}>
                      <Link href={`/receipt/${r.txHash}`} className="wa-co-when">
                        {r.blockTime === null ? `block ${r.blockNumber}` : dateUTC(r.blockTime)}
                      </Link>
                      <span className="wa-co-who wa-mono">{short(r.recipient)}</span>
                      <span className="wa-co-why">
                        {r.reason ?? <em>note not available</em>}
                      </span>
                      <span className="wa-co-paid wa-mono">{usdt(r.stableAmount)}</span>
                      <span className="wa-co-got wa-mono">
                        {unitsFromRaw(r.assetAmount, r.assetDecimals)} {r.assetSymbol}
                      </span>
                      <Link href={`/run/${r.runId}`} className="wa-co-run wa-mono">
                        {runLabel(r.runId)}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        )}
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
