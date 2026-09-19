import type {Metadata} from "next";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Toasts} from "@/components/toast/toasts";
import {GrantForm} from "@/components/grants/grant-form";
import {GrantList} from "@/components/grants/grant-list";
import {escrowAddress, readGrants} from "@/lib/grants";
import "@/app/landing.css";
import "@/components/grants/grants.css";

export const metadata: Metadata = {
  title: "Grants — Warrant",
  description:
    "Ownership that vests on a schedule, out of an escrow the company cannot reach into.",
};

/** Grants change on the chain, not in a cache. Read them fresh. */
export const revalidate = 10;

export default async function GrantsPage() {
  const escrow = escrowAddress();
  const grants = escrow.ok ? await readGrants() : null;
  // Read once, on the server, so every bar on the page is drawn against the same moment.
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec is-wide">
        <p className="wa-kicker">Grants</p>
        <h1 className="wa-h2">Ownership that vests, out of an escrow you cannot reach into.</h1>
        <p className="wa-lede">
          A grant buys its asset once and holds it. It vests on a schedule, and anyone may
          release what is due — so it pays whether or not the company remembers. Seal it and
          even the right to revoke is gone.
        </p>

        {escrow.ok ? (
          <WalletProvider>
            <div style={{marginTop: "var(--s-7)"}}>
              <GrantForm escrow={escrow.value} />
            </div>

            <section style={{marginTop: "var(--s-9)"}}>
              <p className="wa-kicker">
                {grants?.ok ? `${grants.value.length} open` : "The grants"}
              </p>
              {grants?.ok ? (
                <GrantList grants={grants.value} escrow={escrow.value} now={now} />
              ) : (
                <div className="wa-nothing">
                  <strong>The grants are not reading.</strong>
                  {grants?.ok === false ? grants.why : "The chain did not answer."}
                </div>
              )}
            </section>
            <Toasts />
          </WalletProvider>
        ) : (
          <div className="wa-nothing" style={{marginTop: "var(--s-7)"}}>
            <strong>No grant can be opened yet.</strong>
            {escrow.why}
          </div>
        )}
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
