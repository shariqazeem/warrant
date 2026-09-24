import type {Metadata} from "next";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Guard} from "@/components/app/guard";
import {Toasts} from "@/components/toast/toasts";
import {RunBuilder} from "@/components/run/run-builder";
import {payrollAddress} from "@/lib/receipts";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Payroll — Warrant",
  description:
    "One signature pays your whole team, each in the split they chose, part stock and part " +
    "USD₮0, with a payslip for every line. On X Layer.",
};

/**
 * `/run` — PAYROLL. A list of who and how much becomes lines, then one signature pays every
 * line in one transaction, each person in the split they chose, and every line gets its
 * payslip.
 */
export default function RunPage() {
  const payroll = payrollAddress();

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <main id="main" className="wa-sec is-wide">
        <p className="wa-kicker">Payroll</p>
        <h1 className="wa-h2">One signature pays your whole team, each in the split they chose.</h1>
        <p className="wa-lede">
          Paste or upload who you pay and how much. Everyone who has chosen how they&rsquo;re paid
          gets exactly that: part stock, all stock, or all USD₮0. For anyone who hasn&rsquo;t, you
          decide once. It is one transaction, and every line gets its own payslip.
        </p>
        <p className="wa-fine">
          Works for AI agents too: an agent&rsquo;s wallet is one more line, with its own payslip.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          {payroll.ok ? (
            <Guard where="run">
              <WalletProvider>
                <RunBuilder payroll={payroll.value} />
                <Toasts />
              </WalletProvider>
            </Guard>
          ) : (
            <div className="wa-nothing">
              <strong>Payroll is not switched on yet.</strong>
              {payroll.why}
            </div>
          )}
        </div>
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
