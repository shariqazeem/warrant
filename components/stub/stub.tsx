import {Check} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";
import "./stub.css";

/**
 * A PAYMENT'S SHEET: what was paid, what it bought, when, and where it went.
 *
 * A plain sheet on white with a hairline edge. No state, and no variant that shows a figure
 * nobody signed for: every value on it was read from a Paid log or the transaction that
 * wrote it. The payslip for payroll lines is built from this later; the certificate is a
 * different object and does not live here.
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
  kicker = "Paid on X Layer",
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
  /** The sheet arrives with a short rise: the one moment on a page that shows a payment. */
  printing?: boolean;
  kicker?: string;
  foot?: ReactNode;
}) {
  const body = (
    <>
      <div className="stub-head">
        <span className="stub-kicker">
          <Check size={14} strokeWidth={2.25} aria-hidden />
          {kicker}
        </span>
        <span className="stub-brand">Warrant</span>
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
  const cls = `stub${compact ? " is-compact" : ""}${printing ? " is-arriving" : ""}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <article className={cls}>{body}</article>;
}

/** Before any payment exists: what will fill this place, in words, never a sample figure. */
export function EmptyStub({
  title = "No payment yet",
  note,
}: {
  title?: string;
  note: string;
}) {
  return (
    <article className="stub is-empty">
      <div className="stub-head">
        <span>{title}</span>
        <span className="stub-brand">Warrant</span>
      </div>
      <p className="stub-landed">The next real payment appears here.</p>
      <p className="stub-became">Read from X Layer, never a sample</p>
      <p className="stub-foot">{note}</p>
    </article>
  );
}
