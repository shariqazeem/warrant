"use client";

import "@/styles/globals.css";
import "@/styles/tokens.css";
import "@/app/landing.css";

/**
 * WHEN THE FRAME ITSELF FAILS.
 *
 * This replaces the root layout, so it brings its own <html>, its own stylesheets and no
 * fonts: the system faces the tokens fall back to are enough to say what happened. Same
 * words as app/error.tsx, and the same refusal to guess about money.
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
          <main className="wa-sec">
            <p className="wa-kicker">Warrant</p>
            <h1 className="wa-h2">This page could not be shown.</h1>
            <p className="wa-lede">
              Something failed before the page could be put together. Trying again usually
              works.
            </p>
            <p className="wa-lede">
              If you had just signed a payment or a grant, it settled or it did not on X Layer,
              whatever this page says. Check your wallet&rsquo;s history before you send it
              again.
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
              <p className="wa-kicker" style={{marginTop: "var(--s-6)"}}>
                Reference <span className="wa-mono">{error.digest}</span>
              </p>
            ) : null}
          </main>
        </div>
      </body>
    </html>
  );
}
