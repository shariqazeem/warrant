import type {Metadata} from "next";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Toasts} from "@/components/toast/toasts";
import {RunBuilder} from "@/components/run/run-builder";
import {payrollAddress} from "@/lib/receipts";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Pay a run — Warrant",
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
        <p className="wa-kicker">Pay a run</p>
        <h1 className="wa-h2">A file of names and amounts. One signature. A receipt each.</h1>
        <p className="wa-lede">
          Every line becomes a payment in the same transaction, sharing one run. Each person
          gets the asset in their own wallet and a stub carrying the reason they were paid.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          {payroll.ok ? (
            <WalletProvider>
              <RunBuilder payroll={payroll.value} />
              <Toasts />
            </WalletProvider>
          ) : (
            <div className="wa-nothing">
              <strong>Nothing can be paid yet.</strong>
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
