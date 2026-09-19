import Link from "next/link";
import type { ReactNode } from "react";
import "./stub.css";

/**
 * THE STUB — the receipt, rendered as the paper stub it is.
 *
 * No state. Every value it prints was read from a receipt account or the transaction that
 * wrote it; it never invents a figure. The ghost variant is the one exception, and it is
 * drawn dashed and says so: money that landed and has not been swept yet.
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
  kicker = "Settled on Solana",
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
        <span>Scrip</span>
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

/** The stub before any receipt exists: what will fill it, in words. */
export function EmptyStub({ title = "No arrival has settled yet", note }: { title?: string; note: string }) {
  return (
    <article className="stub is-empty">
      <div className="stub-head">
        <span>{title}</span>
        <span>Scrip</span>
      </div>
      <p className="stub-landed">The next real receipt prints here.</p>
      <p className="stub-became">Read from the chain, never a sample</p>
      <p className="stub-units">—</p>
      <p className="stub-foot">{note}</p>
    </article>
  );
}

/**
 * MONEY THAT LANDED AND HAS NOT BEEN SWEPT. Drawn dashed, never mistaken for a receipt: the
 * balance rose above the watermark by this much and a keeper has not acted yet.
 */
export function GhostStub({ landed, line, symbol, rateBps }: { landed: string; line: string; symbol: string; rateBps: number }) {
  return (
    <article className="stub is-ghost is-compact" aria-live="polite">
      <div className="stub-head">
        <span className="pending">
          <span className="dot" aria-hidden />
          Landed, not yet swept
        </span>
        <span>Scrip</span>
      </div>
      <p className="stub-landed">
        <strong>{landed}</strong> landed
      </p>
      <p className="stub-became">{rateBps / 100}% becomes</p>
      <p className="stub-units">
        …<span className="sym">{symbol}</span>
      </p>
      <p className="stub-when">{line}</p>
    </article>
  );
}

/**
 * A WORKED EXAMPLE AT THE DEFAULT RATE, in stub form, and labelled as arithmetic. Shown only
 * where no real receipt in a registered asset exists yet, so the front door still shows the
 * object without inventing a settlement.
 */
export function ExampleStub() {
  return (
    <article className="stub is-example">
      <div className="stub-head">
        <span>A worked example, not a receipt</span>
        <span>Scrip</span>
      </div>
      <p className="stub-landed">
        <strong>$500.00</strong> landed
      </p>
      <p className="stub-became">10% becomes</p>
      <p className="stub-units">
        0.0654<span className="sym">SPYx</span>
      </p>
      <p className="stub-when">in the same wallet, seconds later</p>
      <hr className="stub-rule" />
      <p className="stub-row">
        <span className="k">Stayed USDC</span>
        <span className="v">$450.00 · spendable, untouched</span>
      </p>
      <p className="stub-row">
        <span className="k">Still held</span>
        <span className="v is-muted">measured on chain at 7 and 30 days</span>
      </p>
      <p className="stub-foot">Arithmetic at the default rate. The first real receipt replaces this.</p>
    </article>
  );
}
