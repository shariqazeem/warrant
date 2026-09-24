"use client";

import "@/styles/globals.css";
import "@/styles/tokens.css";
import "@/app/landing.css";
import "@/components/site/site.css";
import {Wordmark} from "@/components/brand/wordmark";

/**
 * WHEN THE FRAME ITSELF FAILS.
 *
 * This replaces the root layout, so it brings its own <html>, its own stylesheets and no
 * fonts: the faces the tokens fall back to (Didot or Georgia, the system sans) are enough to
 * say what happened. Same words as app/error.tsx, and the same refusal to guess about money.
 *
 * The way back is a plain link on purpose. After the root has failed, a full load of the
 * front page is more likely to work than a client-side navigation inside what failed.
 */
export default function GlobalError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong — Warrant</title>
        <div className="wa-landing">
          <div className="wa-vault">
            <header className="wa-header">
              <nav className="wa-nav" aria-label="Main">
                <a href="/" className="wa-nav-brand" aria-label="Warrant, the front page">
                  <Wordmark size={28} />
                </a>
              </nav>
            </header>
          </div>
          <div className="wa-tear" aria-hidden />
          <main id="main" className="wa-sec">
            <p className="wa-kicker">Something went wrong</p>
            <h1 className="wa-h1">This page could not be shown.</h1>
            <p className="wa-lede">
              Something failed before the page could be put together. Trying again usually
              works.
            </p>
            <p className="wa-lede">
              If you had just signed a grant or a payment, it went through or it did not on X
              Layer, whatever this page says. Check your wallet&rsquo;s history before you send
              it again.
            </p>
            <div className="wa-actions">
              <button type="button" className="wa-btn is-primary" onClick={reset}>
                Try again
              </button>
              <a href="/" className="wa-btn">
                Go to the front page
              </a>
            </div>
            {error.digest ? (
              <dl className="wa-error-ref">
                <div>
                  <dt>Reference</dt>
                  <dd className="wa-mono">{error.digest}</dd>
                </div>
              </dl>
            ) : null}
          </main>
        </div>
      </body>
    </html>
  );
}
