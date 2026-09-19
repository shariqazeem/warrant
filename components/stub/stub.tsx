import Link from "next/link";
import type { ReactNode } from "react";
import "./stub.css";

/**
 * THE STUB — the receipt, rendered as the paper stub it is.
 *
 * No state, and no variant that shows a figure nobody signed for. Every value it prints
 * was read from a Paid log or the transaction that wrote it. There is no example stub and
 * no ghost stub here: Scrip needed those because money could land before a keeper acted,
 * and on this rail a payment either settled or it did not.
 */
export type StubRow = { readonly k: string; readonly v: ReactNode; readonly tone?: "ok" | "muted" };
export type StubSection = { readonly title?: string; readonly rows: readonly StubRow[] };

export function Stub({
  landed,
  became,
  units,
  symbol,
  when,
  where,
  whereName,
  sections,
  href,
  compact = false,
  printing = false,
  kicker = "Settled on X Layer",
  foot,
}: {
  landed: ReactNode;
  became: string;
  units: string;
  symbol: string;
  when: string;
  where?: string;
  whereName?: string;
  sections?: readonly StubSection[];
  href?: string;
  compact?: boolean;
  printing?: boolean;
  kicker?: string;
  foot?: ReactNode;
}) {
  const body = (
    <>
      <div className="stub-head">
        <span className="settled">
          <span className="dot" aria-hidden />
          {kicker}
        </span>
        <span>Warrant</span>
      </div>
      <p className="stub-landed">{landed}</p>
      <p className="stub-became">{became}</p>
      <p className="stub-units">
        {units}
        <span className="sym">{symbol}</span>
      </p>
      <p className="stub-when">{when}</p>
      {where ? (
        <p className="stub-where">
          {where} {whereName ? <span className="name">{whereName}</span> : null}
        </p>
      ) : null}
      {sections?.map((s, i) => (
        <div key={i}>
          <hr className="stub-rule" />
          {s.title ? <p className="stub-section">{s.title}</p> : null}
          {s.rows.map((r, j) => (
            <p key={j} className="stub-row">
              <span className="k">{r.k}</span>
              <span className={`v${r.tone ? ` is-${r.tone}` : ""}`}>{r.v}</span>
            </p>
          ))}
        </div>
      ))}
      {foot ? <p className="stub-foot">{foot}</p> : null}
    </>
  );
  const cls = `stub${compact ? " is-compact" : ""}${printing ? " is-printing" : ""}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <article className={cls}>{body}</article>;
}

/** The stub before any payment exists: what will fill it, in words. */
export function EmptyStub({
  title = "No payment has settled yet",
  note,
}: {
  title?: string;
  note: string;
}) {
  return (
    <article className="stub is-empty">
      <div className="stub-head">
        <span>{title}</span>
        <span>Warrant</span>
      </div>
      <p className="stub-landed">The next real stub prints here.</p>
      <p className="stub-became">Read from the chain, never a sample</p>
      <p className="stub-units">&mdash;</p>
      <p className="stub-foot">{note}</p>
    </article>
  );
}
