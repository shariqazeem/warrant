import type {Metadata} from "next";
import {Guard} from "@/components/app/guard";
import {YourGrants} from "@/components/me/your-grants";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import "@/app/home.css";
import "./me.css";

export const metadata: Metadata = {
  title: "Your grants and pay — Warrant",
  description:
    "The stock a team has granted you, vesting every second, and every payslip paid to you, " +
    "read from X Layer. Choose how you're paid next time with a free signature that sends nothing.",
};

/**
 * `/me` — YOUR GRANTS AND PAY. The person's side, designed at 390px first.
 *
 * A server frame with one client leaf: whose grants these are depends on the wallet, which
 * only the browser knows, so the leaf connects, then reads that wallet's grants and payslips
 * from the chain through a server action. A certificate itself never needs a wallet: each
 * one links to its own page, which anyone can open.
 */
export default function MePage() {
  return (
    <div className="wa-yours">
      <div className="wa-yours-top">
        <SiteNav />
      </div>
      <main id="main" className="wa-yours-main">
        <Guard where="me">
          <WalletProvider>
            <YourGrants />
          </WalletProvider>
        </Guard>
      </main>
      <SiteFoot />
    </div>
  );
}
