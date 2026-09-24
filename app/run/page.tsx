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
  description: "A file of names and amounts becomes lines, then one signature, then a receipt each.",
};

/** `/run` — the file becomes lines, then one signature, then the receipts print. */
export default function RunPage() {
  const payroll = payrollAddress();

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Payroll</p>
        <h1 className="wa-h2">Pay your whole team at once.</h1>
        <p className="wa-lede">
          Paste or upload a list of who and how much. You pay in dollars; each person is paid
          the way they chose — part in stock, all in stock, or none — in a single transaction,
          with one signature, and each gets their own receipt.
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
