"use client";

import {Component, Fragment, type ReactNode} from "react";
import {isStaleBuild, reloadOnce, reportError} from "./report";

type Props = {
  /** Which part of the site this guards, for the server log: "me", "pay", "run", "grants". */
  where: string;
  children: ReactNode;
};

type State = {error: unknown; seq: number};

/**
 * ONE PART OF A PAGE FAILING, SAID IN PLACE.
 *
 * The wallet parts of a page (connect, choose, pay) run beside code that browser extensions
 * inject, and a wallet can answer in shapes nobody anticipated. Unguarded, one bad answer
 * takes the whole page down, headline and explanation included, and leaves the site-wide
 * error page. Guarded, the rest of the page stays, this part says what broke and offers the
 * two things that work, and the server log gets the error.
 *
 * A page left open across a deploy is not broken, only older than the site: it reloads once,
 * by itself.
 *
 * It never guesses about money. A part can fail after a wallet signed, so it sends people to
 * their wallet's history rather than saying nothing moved.
 */
export class Guard extends Component<Props, State> {
  state: State = {error: null, seq: 0};

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {error: error ?? "unknown error"};
  }

  componentDidCatch(error: unknown) {
    if (isStaleBuild(error) && reloadOnce()) return;
    console.error(error);
    reportError(error, this.props.where);
  }

  render() {
    const {error, seq} = this.state;
    if (error === null) return <Fragment key={seq}>{this.props.children}</Fragment>;

    const stale = isStaleBuild(error);
    const said =
      typeof error === "object" && error !== null && typeof (error as {message?: unknown}).message === "string"
        ? (error as {message: string}).message
        : String(error);

    return (
      <div className="wa-nothing" role="alert">
        <strong>{stale ? "Warrant was updated while this page was open." : "This part of the page stopped."}</strong>
        {stale
          ? "Reload the page and it will work again."
          : "Something your browser or a wallet extension sent could not be read. Reloading usually " +
            "fixes it. If it happens again, connect with OKX Wallet by QR code, or use another browser."}
        <div className="wa-actions" style={{marginTop: "var(--s-4)"}}>
          <button type="button" className="wa-btn is-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          {stale ? null : (
            <button type="button" className="wa-btn" onClick={() => this.setState({error: null, seq: seq + 1})}>
              Try again
            </button>
          )}
        </div>
        <p className="wa-fine" style={{marginTop: "var(--s-4)"}}>
          If you had just signed a payment, it settled or it did not on X Layer, whatever this
          says. Check your wallet&rsquo;s history before you send it again.
        </p>
        {/* What broke, in one line a person can screenshot and send. */}
        <p className="wa-fine wa-mono">{said.split("\n")[0]!.slice(0, 160)}</p>
      </div>
    );
  }
}
