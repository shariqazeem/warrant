import Link from "next/link";
import type {ReactNode} from "react";
import {Wordmark} from "@/components/brand/wordmark";
import {Jump} from "@/components/shell/jump";
import {DOORS} from "./doors";
import {NavLinks} from "./nav-links";
import "@/app/landing.css";
import "./site.css";

export {DOORS};

/**
 * THE SITE FRAME: the nav on vault, the canvas the page works on, the footer on vault.
 *
 * ONE LIST OF DOORS (./doors.ts), read by the nav, the footer and ⌘K. A link that appears
 * in two places and drifts is the defect shape this project is most prone to.
 *
 * Landmarks: the nav renders a <header> with a skip link to `#main`, the footer a <footer>.
 * Every page's <main> carries id="main".
 */

export function SiteNav() {
  return (
    <header className="wa-header">
      <a className="wa-skip" href="#main">
        Skip to content
      </a>
      <nav className="wa-nav" aria-label="Main">
        <Link href="/" className="wa-nav-brand" aria-label="Warrant, the front page">
          <Wordmark size={28} />
        </Link>
        <NavLinks doors={DOORS} />
        <div className="wa-nav-end">
          <Jump />
          <Link href="/grants" className="wa-btn is-primary wa-nav-cta">
            Grant stock
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFoot() {
  return (
    <footer className="wa-site-foot">
      <div className="wa-foot-row">
        <Link href="/" className="wa-foot-brand" aria-label="Warrant, the front page">
          <Wordmark size={24} />
        </Link>
        <ul className="wa-foot-doors">
          {DOORS.map((d) => (
            <li key={d.href}>
              <Link href={d.href}>{d.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="wa-foot-word">war·rant: a document that grants a right; to guarantee.</p>
    </footer>
  );
}

export function SiteFrame({
  eyebrow,
  title,
  lede,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="wa-landing wa-site">
      <div className="wa-vault">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />
      <main id="main" className={`wa-sec wa-site-main${wide ? " is-wide" : ""}`}>
        <p className="wa-kicker">{eyebrow}</p>
        <h1 className="wa-h1">{title}</h1>
        <p className="wa-lede">{lede}</p>
        <div className="wa-site-body">{children}</div>
      </main>
      <div className="wa-vault">
        <SiteFoot />
      </div>
    </div>
  );
}

/** A ruled section on a site page: a label, then rows or paragraphs. */
export function SiteSection({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="wa-site-section">
      <p className="wa-section-label">
        <span>{label}</span>
        {aside ? <span>{aside}</span> : null}
      </p>
      {children}
    </section>
  );
}

/** A ruled row: a label and what it says. */
export function Row({k, children}: {k: string; children: ReactNode}) {
  return (
    <div className="wa-rule-row">
      <span className="k">{k}</span>
      <p className="v">{children}</p>
    </div>
  );
}

/**
 * THE HONEST EMPTY. It says what will fill it, in words. It never renders a sample row and
 * never a zero standing in for something unknown.
 */
export function Nothing({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="wa-nothing">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
