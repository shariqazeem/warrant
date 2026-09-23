import type {Metadata} from "next";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
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
          Paste or upload a list. Everyone is paid in stock in a single transaction, with one
          signature — and each person gets their own receipt.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          {payroll.ok ? (
            <WalletProvider>
              <RunBuilder payroll={payroll.value} />
              <Toasts />
            </WalletProvider>
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
