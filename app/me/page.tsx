import type {Metadata} from "next";
import {ChoiceForm} from "@/components/choice/choice-form";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "How you get paid — Warrant",
  description:
    "Choose how much of each payment becomes stock, and which stock. Sign it once, for free; " +
    "every company that pays you through Warrant follows it.",
};

/**
 * `/me` — THE PERSON BEING PAID DECIDES.
 *
 * How much of each payment becomes stock, and which stock. The page is a server component
 * with nothing to read — whose choice it is depends on the wallet, which only the browser
 * knows — so it is one client leaf: connect, choose, sign. Signing is an EIP-712 signature,
 * not a transaction: nothing moves and there is no network fee.
 */
export default function MePage() {
  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">How you get paid</p>
        <h1 className="wa-h2">Choose how much of your pay becomes stock.</h1>
        <p className="wa-lede">
          When a company pays you through Warrant, you decide how much of each payment arrives
          as a stock — like the S&amp;P 500 — and how much as USDT, a digital dollar. You sign it
          once, for free, and every company that pays you follows it.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          <WalletProvider>
            <ChoiceForm />
          </WalletProvider>
        </div>
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
