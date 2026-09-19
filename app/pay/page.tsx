import type {Metadata} from "next";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Toasts} from "@/components/toast/toasts";
import {PayForm} from "@/components/pay/pay-form";
import {payrollAddress} from "@/lib/receipts";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Pay one person — Warrant",
  description: "Pay someone in a tokenized stock, in their own wallet, with the reason on it.",
};

/**
 * `/pay` — one form, one confirm, one receipt.
 *
 * The page is a server component; only the form is a client leaf. The Payroll address is
 * read here and passed down, so a browser that never loads the form still gets an honest
 * page saying nothing is deployed.
 */
export default function PayPage() {
  const payroll = payrollAddress();

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Pay one person</p>
        <h1 className="wa-h2">Ownership, in their own wallet, with the reason on it.</h1>
        <p className="wa-lede">
          You choose the person, the amount, the asset and the reason. Warrant chooses
          nothing. The contract refuses to settle below the floor you sign for.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          {payroll.ok ? (
            <WalletProvider>
              <PayForm payroll={payroll.value} />
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
