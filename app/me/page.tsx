import type {Metadata} from "next";
import {ChoiceForm} from "@/components/choice/choice-form";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Guard} from "@/components/app/guard";
import "@/app/landing.css";

export const metadata: Metadata = {
  title: "Get your link — Warrant",
  description:
    "Choose how much of every payment becomes stock, and which stock. Sign it once, for free, " +
    "and share your link: whoever pays you through it, you get your split.",
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
        <p className="wa-kicker">Get paid in stocks</p>
        <h1 className="wa-h2">Get your link.</h1>
        <p className="wa-lede">
          Choose how much of every payment becomes stock — like the S&amp;P 500 — and how much
          arrives as USDT, a digital dollar. It takes a minute, costs nothing, and nothing leaves
          your wallet. Then share your link: whoever pays you through it, you get your split.
        </p>

        <div style={{marginTop: "var(--s-7)"}}>
          <Guard where="me">
            <WalletProvider>
              <ChoiceForm />
            </WalletProvider>
          </Guard>
        </div>
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
