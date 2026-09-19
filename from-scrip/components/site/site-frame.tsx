import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import "@/app/landing.css";
import "./site.css";

/**
 * THE MARKETING FRAME — the floor's nav on ink, then the page on paper. Every page under it
 * is a stranger's page: no session, no owner chrome, the same doors as the front.
 */
export function SiteFrame({ eyebrow, title, lede, children, wide = false }: { eyebrow: string; title: string; lede: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="sp-landing sp-site">
      <div className="sp-dark">
        <nav className="sp-nav">
          <Link href="/" className="sp-nav-brand" aria-label="Scrip home">
            <Wordmark size={22} />
          </Link>
          <Link href="/people" className="sp-nav-link">
            People
          </Link>
          <Link href="/teams" className="sp-nav-link">
            Teams
          </Link>
          <Link href="/grants" className="sp-nav-link">
            Grants
          </Link>
          <Link href="/ledger" className="sp-nav-link">
            Ledger
          </Link>
          <Link href="/docs" className="sp-nav-link">
            Docs
          </Link>
          <Link href="/app/rule" className="sp-btn is-primary">
            Turn on the rule
          </Link>
        </nav>
      </div>
      <div className="sp-tear" aria-hidden />
      <main className={`sp-sec sp-site-main${wide ? " is-wide" : ""}`}>
        <p className="sp-kicker">{eyebrow}</p>
        <h1 className="sp-site-h1">{title}</h1>
        <p className="sp-lede">{lede}</p>
        <div className="sp-site-body">{children}</div>
      </main>
      <footer className="sp-site-foot">
        <span>Scrip</span>
        <span className="sp-foot-spacer" />
        <Link href="/company">Company</Link>
        <Link href="/security">Security</Link>
        <Link href="/bounties">Bounties</Link>
        <Link href="/keepers">Keepers</Link>
        <Link href="/actions">Corporate actions</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/changelog">Changelog</Link>
        <Link href="/brand">Brand</Link>
        <Link href="/docs">Docs</Link>
      </footer>
    </div>
  );
}

/** A ruled section on a site page: a label, then rows or paragraphs. */
export function SiteSection({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sp-site-section">
      <p className="sp-section-label">
        <span>{label}</span>
        {aside ? <span>{aside}</span> : null}
      </p>
      {children}
    </section>
  );
}

export function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="sp-truth">
      <span className="k">{k}</span>
      <p className="v">{children}</p>
    </div>
  );
}
