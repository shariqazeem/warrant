import type {Metadata} from "next";
import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import "@/app/landing.css";

/**
 * NOTHING HERE.
 *
 * Every address on this site is something on X Layer — a certificate, a transaction, a
 * wallet, a payroll run — so a link that finds nothing is usually one character wrong. Say
 * that plainly, say what the addresses look like, and give the ways back.
 */
export const metadata: Metadata = {
  title: "Not found — Warrant",
};

export default function NotFound() {
  return (
    <div className="wa-landing">
      <div className="wa-vault">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />

      <main id="main" className="wa-sec">
        <p className="wa-kicker">Not found</p>
        <h1 className="wa-h1">There is nothing at this address.</h1>
        <p className="wa-lede">
          The link may be mistyped by a character, or it points at something that is not on X
          Layer. A certificate is found by its number, a transaction by its hash, and a
          wallet&rsquo;s record by its address.
        </p>
        <div className="wa-actions">
          <Link href="/grants" className="wa-btn is-primary">
            Grant stock
          </Link>
          <Link href="/" className="wa-btn">
            Go to the front page
          </Link>
        </div>
      </main>

      <div className="wa-vault">
        <SiteFoot />
      </div>
    </div>
  );
}
