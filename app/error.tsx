"use client";

import Link from "next/link";
import {useEffect} from "react";
import {Wordmark} from "@/components/brand/wordmark";
import {isStaleBuild, reloadOnce, reportError} from "@/components/app/report";
import "@/app/landing.css";
import "@/components/site/site.css";

/**
 * WHEN A PAGE FAILS.
 *
 * Every reader on this site returns a value rather than throwing (lib/outcome.ts), so this
 * is the rare render that met something nobody anticipated. It says so in plain words and
 * offers the action that usually works.
 *
 * IT NEVER GUESSES ABOUT MONEY. A page can fail after a wallet has already signed, and "no
 * money moved" would then be a lie that invites someone to pay twice. The chain is where a
 * payment happened or did not, so that is where it sends them to look.
 *
 * The frame is the vault bar with the wordmark and nothing else: the fewer parts an error
 * page has, the fewer can fail with it.
 */
export default function ErrorPage({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  const stale = isStaleBuild(error);
  useEffect(() => {
    // A tab older than the site is not broken: one reload fixes it, so it happens by itself.
    if (isStaleBuild(error) && reloadOnce()) return;
    console.error(error);
    // A failure in one browser leaves nothing on the server unless the page sends it.
    reportError(error, "page");
  }, [error]);

  return (
    <div className="wa-landing">
      <div className="wa-vault">
        <header className="wa-header">
          <nav className="wa-nav" aria-label="Main">
            <Link href="/" className="wa-nav-brand" aria-label="Warrant, the front page">
              <Wordmark size={28} />
            </Link>
          </nav>
        </header>
      </div>
      <div className="wa-tear" aria-hidden />

      <main id="main" className="wa-sec">
        <p className="wa-kicker">Something went wrong</p>
        <h1 className="wa-h1">This page could not be shown.</h1>
        <p className="wa-lede">
          {stale
            ? "Warrant was updated while this page was open, so it asked for parts that have since changed. Reloading the page fixes it."
            : "It failed while it was being put together, most often because X Layer\u2019s public endpoint refused a read for a moment. Trying again usually works."}
        </p>
        <p className="wa-lede">
          If you had just signed a grant or a payment, it went through or it did not on X
          Layer, whatever this page says. Check your wallet&rsquo;s history before you send it
          again.
        </p>
        <div className="wa-actions">
          <button
            type="button"
            className="wa-btn is-primary"
            onClick={stale ? () => window.location.reload() : reset}
          >
            {stale ? "Reload the page" : "Try again"}
          </button>
          <Link href="/" className="wa-btn">
            Go to the front page
          </Link>
        </div>
        {/* What broke, in lines a person can screenshot and send. */}
        <dl className="wa-error-ref">
          {error.digest ? (
            <div>
              <dt>Reference</dt>
              <dd className="wa-mono">{error.digest}</dd>
            </div>
          ) : null}
          <div>
            <dt>What failed</dt>
            <dd className="wa-mono">{(error.message || String(error)).slice(0, 160)}</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
