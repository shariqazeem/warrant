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
  description:
    "Pay one person in USD₮0 and they receive it in the split they chose, part in a tokenized " +
    "stock, in their own wallet, with a payslip that carries your note.",
};

type Props = {searchParams: Promise<Record<string, string | string[] | undefined>>};

/**
 * `/pay` — PAY ONE PERSON: one form, one signature, one payslip.
 *
 * The page is a server component; only the form is a client leaf. The Payroll address is
 * read here and passed down, so a browser that never loads the form still gets an honest
 * page saying nothing is deployed.
 *
 * `/pay?to=0x…` fixes who is paid, as a person's page does: the form shows the wallet
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
      <main id="main" className="wa-sec is-wide">
        <p className="wa-kicker">Payroll</p>
        <h1 className="wa-h2">Pay one person.</h1>
        <p className="wa-lede">
          You pay in USD₮0. If they have chosen how they&rsquo;re paid, part in a stock like the
          S&amp;P 500, they receive exactly that in their own wallet; if not, you decide this once.
          Either way their payslip carries your note. To pay your whole team in one signature,{" "}
          <Link href="/run">run payroll</Link>.
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
