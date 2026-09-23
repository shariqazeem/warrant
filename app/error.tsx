"use client";

import Link from "next/link";
import {useEffect} from "react";
import {Wordmark} from "@/components/brand/wordmark";
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
 * The frame is the ink bar with the wordmark and nothing else: the fewer parts an error page
 * has, the fewer can fail with it.
 */
export default function ErrorPage({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {
    // The server logged the same failure under this digest; the console is where to look.
    console.error(error);
  }, [error]);

  return (
    <div className="wa-landing">
      <div className="wa-dark">
        <nav className="wa-nav">
          <Link href="/" className="wa-nav-brand" aria-label="Warrant home">
            <Wordmark size={22} />
          </Link>
        </nav>
      </div>
      <div className="wa-tear" aria-hidden />

      <main className="wa-sec">
        <p className="wa-kicker">Something went wrong</p>
        <h1 className="wa-h2">This page could not be shown.</h1>
        <p className="wa-lede">
          It failed while it was being put together, most often because X Layer&rsquo;s public
          endpoint refused a read for a moment. Trying again usually works.
        </p>
        <p className="wa-lede">
          If you had just signed a payment or a grant, it settled or it did not on X Layer,
          whatever this page says. Check your wallet&rsquo;s history before you send it again.
        </p>
        <div className="wa-actions">
          <button type="button" className="wa-btn is-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="wa-btn">
            Go to the front page
          </Link>
        </div>
        {error.digest ? (
          <p className="wa-kicker" style={{marginTop: "var(--s-6)"}}>
            Reference <span className="wa-mono">{error.digest}</span>
          </p>
        ) : null}
      </main>
    </div>
  );
}
