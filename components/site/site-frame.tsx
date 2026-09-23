import Link from "next/link";
import type {ReactNode} from "react";
import {Wordmark} from "@/components/brand/wordmark";
import {Jump} from "@/components/shell/jump";
import "@/app/landing.css";
import "./site.css";

/**
 * THE MARKETING FRAME — the floor's nav on ink, then the page tears off onto paper. Every
 * page under it is a stranger's page: no session, no owner chrome, the same doors as the
 * front door.
 *
 * ONE LIST OF DOORS, used by the nav and the footer both. A link that appears in two
 * places and drifts is the defect shape this project is most prone to, so there is only
 * ever one list, and nothing is listed here that does not exist.
 */
export const DOORS = [
  {href: "/pay", label: "Pay someone"},
  {href: "/run", label: "Payroll"},
  {href: "/grants", label: "Vesting grants"},
] as const;

export function SiteNav() {
  return (
    <nav className="wa-nav">
      <Link href="/" className="wa-nav-brand" aria-label="Warrant home">
        <Wordmark size={22} />
      </Link>
      {DOORS.map((d) => (
        <Link key={d.href} href={d.href} className="wa-nav-link">
          {d.label}
        </Link>
      ))}
      <span className="wa-nav-spacer" />
      <Jump />
      <Link href="/run" className="wa-btn is-primary">
        Run payroll
      </Link>
    </nav>
  );
}

export function SiteFoot() {
  return (
    <footer className="wa-site-foot">
      <span>Warrant</span>
      <span className="wa-foot-spacer" />
      {DOORS.map((d) => (
        <Link key={d.href} href={d.href}>
          {d.label}
        </Link>
      ))}
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
      <div className="wa-dark">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />
      <main className={`wa-sec wa-site-main${wide ? " is-wide" : ""}`}>
        <p className="wa-kicker">{eyebrow}</p>
        <h1 className="wa-site-h1">{title}</h1>
        <p className="wa-lede">{lede}</p>
        <div className="wa-site-body">{children}</div>
      </main>
      <SiteFoot />
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

/** A ruled row. If it is not a stub, it is one of these or a paragraph. */
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
