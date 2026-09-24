import type {Metadata} from "next";
import {Suspense} from "react";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {WalletProvider} from "@/components/wallet/provider";
import {Guard} from "@/components/app/guard";
import {Toasts} from "@/components/toast/toasts";
import {IssueForm} from "@/components/grants/issue-form";
import {GrantList, type ShelfRow} from "@/components/grants/grant-list";
import {escrowAddress, grantStanding, readGrantShelf, shelfHeading} from "@/lib/grants";
import "@/app/landing.css";
import "@/components/grants/issue.css";

export const metadata: Metadata = {
  title: "Issue a grant — Warrant",
  description:
    "Grant someone stock that vests. It is bought on day one through OKX DEX, held in an escrow " +
    "nobody can spend, and theirs a little every second.",
};

/** Grants change on the chain, not in a cache. Read them fresh. */
export const revalidate = 10;

const SUBTITLE =
  "The certificate on the right follows every choice you make, and becomes real when you issue it.";

/**
 * THE GRANTS THAT EXIST, read from the escrow on the server and handed to the list, which
 * picks out the connected wallet's own. Where each one stands is worked out here, once, with
 * the same clock for every row.
 */
async function Shelf() {
  const shelf = await readGrantShelf();
  if (!shelf.ok) {
    return (
      <section className="wa-issue-shelf" aria-labelledby="shelf-heading">
        <h2 id="shelf-heading">Grants</h2>
        <p className="wa-issue-empty">
          <strong>Grants could not be read just now.</strong>
          {shelf.why} Each one is still on X Layer; reload in a moment.
        </p>
      </section>
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const rows: ShelfRow[] = shelf.value.grants.map((g) => {
    const standing = grantStanding(g, now);
    return {
      id: g.id,
      payer: g.payer,
      beneficiary: g.beneficiary,
      assetSymbol: g.assetSymbol,
      assetDecimals: g.assetDecimals,
      heldUnits: g.heldUnits,
      start: g.start,
      durationSeconds: g.durationSeconds,
      sealed: g.isSealed,
      standing: standing.label,
      standingKind: standing.kind,
    };
  });
  return (
    <GrantList
      rows={rows}
      count={shelf.value.count}
      heading={shelfHeading(shelf.value)}
      unread={shelf.value.unread}
    />
  );
}

function ShelfLoading() {
  return (
    <section className="wa-issue-shelf" aria-busy="true" aria-label="Grants, loading">
      <p className="wa-issue-shelf-note">Reading the grants from X Layer…</p>
    </section>
  );
}

export default function GrantsPage() {
  const escrow = escrowAddress();
  // Read once, on the server, so the first render in the browser matches this HTML.
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="wa-landing wa-issue-page">
      <div className="wa-dark">
        <SiteNav />
      </div>

      <div className="wa-tear" aria-hidden />
      <main id="main">
        {escrow.ok ? (
          <Guard where="grants">
            <WalletProvider>
              <IssueForm escrow={escrow.value} initialNow={now} />
              <Suspense fallback={<ShelfLoading />}>
                <Shelf />
              </Suspense>
              <Toasts />
            </WalletProvider>
          </Guard>
        ) : (
          <div className="wa-issue">
            <header className="wa-issue-head">
              <h1>Issue a grant</h1>
              <p>{SUBTITLE}</p>
            </header>
            <div className="wa-issue-form">
              <p className="wa-issue-empty">
                <strong>Grants are not switched on yet.</strong>
                {escrow.why}
              </p>
            </div>
          </div>
        )}
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
