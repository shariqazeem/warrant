import type {Metadata} from "next";
import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {PayBox} from "@/components/link/pay-box";
import {payLinkPath, readTo} from "@/components/link/pay-link";
import {readChoiceView} from "@/components/link/choice-view";
import {short} from "@/lib/format";
import {payrollAddress} from "@/lib/receipts";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Pay one person — Warrant",
  description: "Pay someone in a tokenized stock, in their own wallet, with the reason on it.",
};

type Props = {searchParams: Promise<Record<string, string | string[] | undefined>>};

/**
 * `/pay` — one form, one confirm, one receipt.
 *
 * The page is a server component; only the form is a client leaf. The Payroll address is
 * read here and passed down, so a browser that never loads the form still gets an honest
 * page saying nothing is deployed.
 *
 * `/pay?to=0x…` fixes who is paid, as a person's pay link does: the form shows the wallet
 * instead of asking for it. The address is checked here, because nobody can correct it in
 * the form; one that fails is said, and the form opens empty rather than half-filled.
 */
export default async function PayPage({searchParams}: Props) {
  const payroll = payrollAddress();
  const to = readTo((await searchParams).to);
  const fixed =
    to.kind === "fixed" ? {address: to.address, choice: await readChoiceView(to.address)} : undefined;

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Pay someone</p>
        <h1 className="wa-h2">Pay someone. They choose the stock.</h1>
        <p className="wa-lede">
          You send USDT. If they have chosen how much of their pay becomes stock — like the
          S&amp;P 500 — they get exactly that in their own wallet; if not, you decide this once.
          Either way, a receipt shows your note.
        </p>
        {to.kind === "fixed" ? (
          <p className="wa-pay-to">
            Paying <span className="wa-mono">{short(to.address)}</span>, the wallet in the link you
            opened. <Link href={payLinkPath(to.address)}>See their page</Link> or{" "}
            <Link href="/pay">pay someone else</Link>.
          </p>
        ) : to.kind === "refused" ? (
          <p className="wa-pay-to is-refused">
            The wallet in the link you opened can&rsquo;t be paid. {to.why} Enter theirs below.
          </p>
        ) : null}

        <div style={{marginTop: "var(--s-7)"}}>
          <PayBox payroll={payroll} to={fixed} />
        </div>
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
