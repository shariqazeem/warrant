import type {Metadata} from "next";
import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import "@/app/landing.css";

/**
 * NOTHING HERE.
 *
 * Every address on this site is something on X Layer — a transaction, a wallet, a run, a
 * grant — so a link that finds nothing is usually one character wrong. Say that plainly,
 * say what the addresses look like, and give the one way back.
 */
export const metadata: Metadata = {
  title: "Not found — Warrant",
};

export default function NotFound() {
  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec">
        <p className="wa-kicker">Not found</p>
        <h1 className="wa-h2">There is nothing at this address.</h1>
        <p className="wa-lede">
          The link may be mistyped, or it points at something that is not on X Layer. A
          receipt is found by the hash of the transaction that paid it, a company by its wallet
          address, and a grant by its number.
        </p>
        <div className="wa-actions">
          <Link href="/" className="wa-btn is-primary">
            Go to the front page
          </Link>
        </div>
      </main>

      <div className="wa-dark">
        <SiteFoot />
      </div>
    </div>
  );
}
