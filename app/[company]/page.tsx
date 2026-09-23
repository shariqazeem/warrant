import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {ScheduleBar} from "@/components/grants/schedule-bar";
import {PaidToWallet} from "@/components/choice/paid-to";
import {TheirChoice} from "@/components/choice/their-choice";
import {AssetNote} from "@/components/pay/asset-note";
import {assetByAddress} from "@/lib/assets";
import {EXPLORER_ADDRESS} from "@/lib/chain";
import {readCompany} from "@/lib/company";
import {choiceFor, readPaidTo} from "@/lib/person";
import {readGrant, type Grant} from "@/lib/grants";
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

  // The same address as a person being paid: the choice it signed, and what it was paid.
  // A wallet can be either or both, so the page reads both sides and shows what is there.
  const choice = choiceFor(address);
  const paidTo = readPaidTo(address);
  const beenPaid = paidTo.ok && paidTo.value.paymentCount > 0;
  const hasPaid = c.paymentCount > 0 || c.grants.length > 0;

  // A grant's terms are on the record from the day it opened; what has happened since —
  // released, cancelled, made irrevocable, closed — is only on the contract. Read it, so a
  // cancelled grant never shows as still vesting. Bounded: the first twenty.
  const live = new Map<number, Grant>();
  for (const r of await Promise.all(c.grants.slice(0, 20).map((g) => readGrant(g.id)))) {
    if (r.ok) live.set(r.value.id, r.value);
  }

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">
          {hasPaid || (!beenPaid && choice === null) ? "Company payroll record" : "Payroll record"}
        </p>
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
          // "Nothing to show" is only true when the person's side below is empty too.
          beenPaid || choice !== null ? null : (
            <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
              <strong>Nothing to show yet.</strong>
              When this company pays someone, the payment appears here with its note and a
              receipt anyone can open. Only real payments are ever shown.
            </div>
          )
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
                {c.deliveredByAsset.map((a) => {
                  const known = assetByAddress(a.asset);
                  return (
                    <div className="wa-rule-row" key={a.asset}>
                      <span className="k">{a.symbol}</span>
                      <p className="v">
                        <span className="wa-units-sm">{unitsFromRaw(a.units, a.decimals)}</span>{" "}
                        <span className="wa-co-sym">{a.symbol}</span>
                        <br />
                        <Link href={EXPLORER_ADDRESS(a.asset)} className="wa-mono wa-co-addr">
                          {a.asset}
                        </Link>
                        {known ? (
                          <>
                            <br />
                            <AssetNote symbol={known.symbol} name={known.name} />
                          </>
                        ) : null}
                      </p>
                    </div>
                  );
                })}
              </section>
            ) : null}

            {c.grants.length > 0 ? (
              <section className="wa-co-section">
                <p className="wa-kicker">Grants</p>
                {c.grants.map((g) => {
                  const now_ = live.get(g.id);
                  const status = !now_
                    ? "Current state could not be read"
                    : now_.state === "closed"
                      ? "Fully released"
                      : now_.revoked
                        ? "Cancelled — what had vested stays theirs"
                        : now_.isSealed
                          ? "Vesting · irrevocable"
                          : "Vesting";
                  return (
                  <article className="wa-grant" key={g.id}>
                    <div className="wa-grant-head">
                      <Link href={`/grant/${g.id}`} className="wa-grant-who wa-mono">
                        {short(g.beneficiary)}
                      </Link>
                      <span className="wa-grant-units">
                        {unitsFromRaw(g.units, g.assetDecimals)}
                        <span className="sym">{g.assetSymbol}</span>
                      </span>
                    </div>
                    <p className="wa-grant-why">{status}</p>
                    {g.reason ? <p className="wa-grant-why">{g.reason}</p> : null}
                    <ScheduleBar
                      schedule={{
                        shares: now_ ? now_.shares : g.units,
                        start: g.startAt,
                        cliffSeconds: g.cliffSeconds,
                        durationSeconds: g.durationSeconds,
                      }}
                      releasedShares={now_ ? now_.sharesReleased : 0n}
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
                  );
                })}
                <p className="wa-co-note">
                  The terms are from the day each grant opened; its state is read from the
                  contract now. Each grant&rsquo;s full record, with every release, is on its
                  own page.
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

        {choice ? <TheirChoice choice={choice} /> : null}
        <PaidToWallet paid={paidTo} hasChoice={choice !== null} />
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
