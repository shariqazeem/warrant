import type {Metadata} from "next";
import Link from "next/link";
import {Certificate, type CertificateData} from "@/components/cert/certificate";
import {VestingRule} from "@/components/cert/vesting-rule";
import {AssetNote} from "@/components/pay/asset-note";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {ASSETS, ELIGIBILITY_NOTE, ISSUER, ISSUER_NOTE_SHORT, ISSUER_POWERS, defaultAsset} from "@/lib/assets";
import {certificateDataFor, stockName} from "@/lib/certificate-data";
import {EXPLORER_ADDRESS, STABLE} from "@/lib/chain";
import {readEscrowPool, readFeaturedGrant, readRecord, routeOfGrant, type LiveGrant} from "@/lib/company";
import {short} from "@/lib/format";
import {escrowAddress} from "@/lib/grants";
import {catchUp} from "@/lib/indexer";
import {payrollAddress} from "@/lib/receipts";
import {RecordRows, certificateNumber} from "./record/rows";
import "./home.css";

/**
 * THE FRONT PAGE. Company first: give your team stock that vests.
 *
 * NOTHING HERE IS INVENTED. The certificate beside the headline is the newest real grant,
 * read from X Layer; before one exists it is an unissued outline that says so. The public
 * record lists real grants and runs, or says in words that there are none yet. There is no
 * sample certificate, no sample row and no headline figure anywhere on this page.
 */
export const revalidate = 15;

const TITLE = "Warrant — give your team stock that vests";
const DESCRIPTION =
  "Grant your people tokenized stock, like the S&P 500 or NVIDIA, bought on day one through " +
  "OKX DEX and vesting every second in an escrow nobody can spend. Pay your team in one " +
  "signature, each in the split they chose. On X Layer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {title: TITLE, description: DESCRIPTION, siteName: "Warrant", type: "website"},
  twitter: {card: "summary_large_image", title: TITLE, description: DESCRIPTION},
};

/** The featured grant, as its certificate prints it, with its pool read so units are exact. */
async function certificateOf(l: LiveGrant): Promise<CertificateData> {
  const pool = await readEscrowPool(l.grant.asset);
  return certificateDataFor(l.grant, {
    tx: l.opened.txHash,
    openedUnits: l.opened.units,
    route: routeOfGrant(l.grant.id),
    ...(pool.ok ? pool.value : {}),
  });
}

export default async function Home() {
  // Close the last few seconds of the record; bounded, and a page still renders if it fails.
  await catchUp();
  const featured = await readFeaturedGrant();
  const live = featured.ok ? featured.value : null;
  const cert = live ? await certificateOf(live) : null;
  const record = readRecord(6);
  const payroll = payrollAddress();
  const escrow = escrowAddress();
  const fallback = defaultAsset();

  return (
    <div className="wa-home">
      <div className="wa-home-top">
        <SiteNav />
      </div>

      <main id="main">
        {/* ── the hero ────────────────────────────────────────────────────── */}
        <section className="wa-home-hero" aria-labelledby="home-title">
          <div className="wa-home-wrap wa-home-hero-grid">
            <div className="wa-home-hero-copy">
              <h1 id="home-title" className="wa-home-display">
                Give your team stock that vests.
              </h1>
              <p className="wa-home-lead">
                Grant the S&amp;P 500, NVIDIA or thirteen more to anyone with a wallet. It&rsquo;s
                bought on day one and vests every second in an escrow nobody can spend. What vests
                is theirs for good; seal the grant and so is the rest.
              </p>
              <div className="wa-home-actions">
                <Link href="/grants" className="wa-home-btn is-bond">
                  Grant stock
                </Link>
                <Link href="/me" className="wa-home-btn is-outline">
                  See what they receive
                </Link>
              </div>
              <p className="wa-home-fine">
                Paid in USDT and priced by OKX DEX on X Layer. The contracts have no owner, no
                admin and no upgrade path.
              </p>
            </div>

            <div className="wa-home-hero-cert">
              {cert ? (
                <>
                  <Certificate data={cert} variant="landscape" engrave />
                  <p className="wa-home-cert-caption">
                    Grant No. {certificateNumber(cert.id)}, read from X Layer.{" "}
                    {cert.sealed
                      ? "Sealed: nobody can take it back, including the company."
                      : cert.revoked
                        ? "Cancelled: what had vested stays theirs."
                        : "Revocable until the company seals it."}{" "}
                    <Link href={`/g/${cert.id}`}>Open its certificate</Link>
                  </p>
                </>
              ) : (
                <>
                  <Unissued
                    line={
                      featured.ok
                        ? "The first grant will be engraved here"
                        : "The newest grant could not be read just now"
                    }
                  />
                  {featured.ok ? null : <p className="wa-home-cert-held">{featured.why}</p>}
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── the three rules ─────────────────────────────────────────────── */}
        <section className="wa-home-rules" aria-label="How a grant works">
          <ul className="wa-home-wrap wa-home-rules-grid">
            <li className="wa-home-rule">
              <RuleIcon kind="bought" />
              <h2>Bought on day one</h2>
              <p>
                The grant buys the stock the moment it&rsquo;s issued, through OKX DEX, at no less
                than a minimum the contract enforces. It isn&rsquo;t a promise to buy later.
              </p>
            </li>
            <li className="wa-home-rule">
              <RuleIcon kind="every-second" />
              <h2>Vests every second</h2>
              <p>
                Linear from the start date, with a cliff if you want one. Anyone can release
                what&rsquo;s due and earn a small fee, so it arrives even if nobody remembers.
              </p>
            </li>
            <li className="wa-home-rule">
              <RuleIcon kind="theirs" />
              <h2>What vests is theirs</h2>
              <p>
                The company can cancel only the unvested part, and only until it seals the
                grant. Once sealed, nobody can take any of it back, including the company.
              </p>
            </li>
          </ul>
        </section>

        {/* ── the two instruments ─────────────────────────────────────────── */}
        <section className="wa-home-wrap wa-home-sec" aria-labelledby="home-two">
          <p className="wa-home-kicker">Two ways to pay your people in stock</p>
          <h2 id="home-two" className="wa-home-h2">
            Grants for the people you want to keep. Payroll for everyone you pay.
          </h2>
          <div className="wa-home-two">
            <div>
              <h3>Grants</h3>
              <p>
                Pick a person, a stock and an amount, and how long it vests. The grant buys the
                stock the day you issue it and holds it in an escrow nobody can spend, and the
                person gets a numbered certificate that anyone can open without a wallet.
              </p>
              <p>
                <strong>Keep it revocable</strong> and you can cancel the part that hasn&rsquo;t
                vested; <strong>seal it</strong> and nobody can, including you.
              </p>
              <Link href="/grants" className="wa-home-btn is-vault">
                Grant stock
              </Link>
            </div>
            <div>
              <h3>Payroll</h3>
              <p>
                Upload who you pay and how much, and sign once. Everyone is paid in that one
                transaction, each in the split they chose: part stock and part USD₮0, or all of
                either. Anyone who hasn&rsquo;t chosen is paid in dollars, unless you pick a stock
                for them.
              </p>
              <p>
                <strong>Every line gets a payslip</strong> that anyone can open: what was paid, to
                whom, in what, at what price, and why.
              </p>
              <Link href="/run" className="wa-home-btn is-quiet">
                Run payroll
              </Link>
            </div>
          </div>
        </section>

        {/* ── what your people see ────────────────────────────────────────── */}
        <section className="wa-home-wrap wa-home-sec" aria-labelledby="home-see">
          <div className="wa-home-see">
            <div className="wa-home-see-words">
              <p className="wa-home-kicker">What your people see</p>
              <h2 id="home-see" className="wa-home-h2">
                A certificate in their pocket, vesting while they work.
              </h2>
              <p>
                Each grant is a certificate with its own number and its own engraving. It opens
                on a phone from a link, with no wallet and no account, and shows what has vested
                and when the rest arrives.
              </p>
              <p>
                When they want what has vested, they connect OKX Wallet by QR, or any wallet on X
                Layer, and claim it. If they never do, anyone can release it to them, and it
                lands in their own wallet all the same.
              </p>
              <div className="wa-home-actions">
                <Link href="/me" className="wa-home-btn is-vault">
                  See what they receive
                </Link>
              </div>
            </div>
            <figure className="wa-home-phone">
              <figcaption className="wa-home-phone-bar">
                <span>warrant.world</span>
                <span>{cert ? `Grant No. ${certificateNumber(cert.id)}` : "Your grants"}</span>
              </figcaption>
              {cert ? (
                <>
                  <Certificate data={cert} variant="portrait" />
                  <VestingRule data={cert} tone="canvas" />
                </>
              ) : (
                <Unissued portrait line="The first grant will be engraved here" />
              )}
            </figure>
          </div>
        </section>

        {/* ── built on X Layer ────────────────────────────────────────────── */}
        <section className="wa-home-wrap wa-home-sec" aria-labelledby="home-built">
          <p className="wa-home-kicker">Built on X Layer</p>
          <h2 id="home-built" className="wa-home-h2">
            OKX at every step, and contracts nobody can change.
          </h2>
          <ul className="wa-home-rows">
            <li className="wa-home-row">
              <p className="k">OKX DEX</p>
              <p className="v">
                Every grant and every payslip is bought through the OKX DEX aggregator at a live
                quote, at no less than a minimum the contract enforces, and every certificate
                shows the route it took.
                {cert && cert.route.length > 0 ? (
                  <span className="wa-home-route">
                    Grant No. {certificateNumber(cert.id)}: {cert.route.join(" → ")}
                  </span>
                ) : null}
              </p>
            </li>
            <li className="wa-home-row">
              <p className="k">OKX Wallet</p>
              <p className="v">
                Your people connect OKX Wallet by QR from their phone, or the browser extension.
                Choosing how they&rsquo;re paid next time is a free signature that sends nothing.
              </p>
            </li>
            <li className="wa-home-row">
              <p className="k">USD₮0</p>
              <p className="v">
                Grants and payroll are paid in USD₮0 (
                <a href={EXPLORER_ADDRESS(STABLE.address)} className="wa-home-mono">
                  {short(STABLE.address)}
                </a>
                ), the USDT most wallets on X Layer hold.
              </p>
            </li>
            <li className="wa-home-row">
              <p className="k">Fees in OKB</p>
              <p className="v">
                Network fees are paid in OKB, X Layer&rsquo;s gas token, and are typically a
                fraction of a cent. The contracts take no cut: a grant&rsquo;s only fee is its
                release fee, paid to whoever releases what is due.
              </p>
            </li>
            <li className="wa-home-row">
              <p className="k">No admin</p>
              <p className="v">
                {payroll.ok && escrow.ok ? (
                  <>
                    The contracts,{" "}
                    <a href={EXPLORER_ADDRESS(escrow.value)} className="wa-home-mono">
                      GrantEscrow {short(escrow.value)}
                    </a>{" "}
                    and{" "}
                    <a href={EXPLORER_ADDRESS(payroll.value)} className="wa-home-mono">
                      Payroll {short(payroll.value)}
                    </a>
                    , have no owner, no admin, no pause and no upgrade path. Once deployed, nobody
                    can change what they do, including us.
                  </>
                ) : (
                  <>
                    The contracts, GrantEscrow and Payroll, have no owner, no admin, no pause and
                    no upgrade path. Once deployed, nobody can change what they do, including us.
                  </>
                )}
              </p>
            </li>
          </ul>
        </section>

        {/* ── the public record ───────────────────────────────────────────── */}
        <section className="wa-home-wrap wa-home-sec" aria-labelledby="home-record">
          <p className="wa-home-kicker">The public record</p>
          <h2 id="home-record" className="wa-home-h2">
            Every grant and every payroll run, in the open.
          </h2>
          {record.ok && record.value.entries.length > 0 ? (
            <>
              <RecordRows entries={record.value.entries} />
              <p className="wa-home-more">
                <Link href="/record">See the whole public record</Link>
              </p>
            </>
          ) : (
            <div className="wa-home-nothing">
              <strong>{record.ok ? "Nothing on the record yet." : "The record could not be read just now."}</strong>
              {record.ok
                ? "Every grant and every payroll run on X Layer is listed here, newest first, " +
                  "each opening its certificate or its payslips. There are no sample rows."
                : record.why}
            </div>
          )}
        </section>

        {/* ── the stocks, each with its disclosure ────────────────────────── */}
        <section className="wa-home-wrap wa-home-sec" aria-labelledby="home-stocks">
          <p className="wa-home-kicker">The stocks</p>
          <h2 id="home-stocks" className="wa-home-h2">
            Fifteen stocks, each with what its issuer can do.
          </h2>
          <p className="wa-home-intro">
            Each is an xStock: a tokenized stock issued by a third party, not by Warrant and not
            by OKX. It is a stock position with economic exposure to the price. It carries no
            voting rights.
          </p>
          {/*
            PER-ROW DISCLOSURE, NEVER A BANNER. The issuer's powers belong beside the stock, on
            the row where someone chooses it. One list, in lib/assets.ts.
          */}
          <ul className="wa-home-rows">
            {ASSETS.map((a) => (
              <li className="wa-home-stock" key={a.address}>
                <p className="sym">
                  {a.symbol}
                  {a.address === fallback.address ? <em className="default"> default</em> : null}
                </p>
                <p className="name">{stockName(a.name)}</p>
                <p className="note">
                  {ISSUER_NOTE_SHORT} <AssetNote symbol={a.symbol} name={a.name} />
                </p>
              </li>
            ))}
            <li className="wa-home-row">
              <p className="k">What the issuer can do</p>
              <p className="v">
                Every one sits behind the same upgradeable contract with one owner,{" "}
                <a href={EXPLORER_ADDRESS(ISSUER.owner)} className="wa-home-mono">
                  {ISSUER.owner}
                </a>
                , which can{" "}
                {ISSUER_POWERS.map((p, i) => (
                  <span key={p}>
                    {i === 0 ? "" : i === ISSUER_POWERS.length - 1 ? ", and " : ", "}
                    {p}
                  </span>
                ))}
                . Warrant cannot prevent any of it. {ELIGIBILITY_NOTE} Read from X Layer on{" "}
                {ISSUER.checkedOn}.
              </p>
            </li>
          </ul>
        </section>

        {/* ── the close ───────────────────────────────────────────────────── */}
        <section className="wa-home-close" aria-labelledby="home-close">
          <div className="wa-home-wrap wa-home-close-inner">
            <h2 id="home-close">
              Your best people are deciding whether to stay. Give them a reason that vests.
            </h2>
            <Link href="/grants" className="wa-home-btn is-bond">
              Grant stock
            </Link>
          </div>
        </section>
      </main>

      <SiteFoot />
    </div>
  );
}

/**
 * THE CERTIFICATE BEFORE THERE IS ONE: an outline with one line of words. Never a sample,
 * and never a number: the first real grant takes this place the moment it is issued.
 */
function Unissued({line, portrait = false}: {line: string; portrait?: boolean}) {
  return (
    <div className={`wa-home-unissued${portrait ? " is-portrait" : ""}`} role="img" aria-label={line}>
      <div className="wa-home-unissued-inner">
        <p className="wa-home-unissued-kicker">Certificate of grant</p>
        <p className="wa-home-unissued-line">{line}</p>
      </div>
    </div>
  );
}

/** The three rules' foil line icons: a calendar with a check, a clock, a rosette. */
function RuleIcon({kind}: {kind: "bought" | "every-second" | "theirs"}) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden focusable="false">
      <g fill="none" stroke="var(--foil)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "bought" ? (
          <>
            <rect x="4" y="6" width="22" height="20" rx="2" />
            <path d="M4 12 H26" />
            <path d="M10 3 V8" />
            <path d="M20 3 V8" />
            <path d="M9.5 18.5 L13 21.5 L20.5 15.5" />
          </>
        ) : kind === "every-second" ? (
          <>
            <circle cx="15" cy="15" r="11" />
            <path d="M15 8.5 V15 L19.5 18" />
          </>
        ) : (
          <>
            <circle cx="15" cy="12" r="7.5" />
            <path d="M10.5 18 L8 27 L15 23.5 L22 27 L19.5 18" />
          </>
        )}
      </g>
    </svg>
  );
}
