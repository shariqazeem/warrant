import Link from "next/link";
import type {ReactNode} from "react";
import {settledUnitPrice, short, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import "./payslip.css";

/**
 * THE PAYSLIP — what one payroll line, or one moment of a grant, prints.
 *
 * Company to person, the units in large type, a two-part bar for what arrived as stock and
 * what arrived as USD₮0, the price it was bought at, the route when it is known, the note,
 * and a small "Paid" stamp. Every value it prints was read from a Paid log, the transaction
 * that wrote it, or a grant's own events. There is no sample payslip and no ghost of one.
 *
 * The props the receipt page has always passed still work: `landed`, `units`, `symbol`,
 * `when` and `where` print as they did. The payslip's own facts (`from`, `to`, the amounts
 * for the bar, `price`, `route`, `note`) are optional, and each prints only when it is given.
 * The words "which became" are retired: the bar says what became what.
 */
export type StubRow = {readonly k: string; readonly v: ReactNode; readonly tone?: "ok" | "muted"};
export type StubSection = {readonly title?: string; readonly rows: readonly StubRow[]};

/** "which became" and "$1.50 of it became" say what the bar shows; they are not printed. */
const RETIRED = /\bbecame$/;

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
  kicker,
  foot,
  from,
  to,
  stableAmount,
  cashAmount,
  price,
  route,
  note,
  stamp,
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
  /** What kind of document this is. A payroll line is a payslip; a grant's moments name themselves. */
  kicker?: string;
  foot?: ReactNode;
  /** The company that paid, and the person paid. */
  from?: string;
  to?: string;
  /** The whole payment and the part of it kept as USD₮0, in base units, for the bar. */
  stableAmount?: bigint;
  cashAmount?: bigint;
  /** What one unit cost, as printed: "$767.34". */
  price?: string | null;
  /** The OKX DEX route, by symbol, when it is known. */
  route?: readonly string[];
  note?: string | null;
  /** The stamp's word. A payslip says "Paid"; pass null for none. */
  stamp?: string | null;
}) {
  const isPayslip = kicker === undefined;
  const word = stamp === undefined ? (isPayslip ? "Paid" : null) : stamp;
  const line = RETIRED.test(became.trim()) ? null : became;
  const person = to ?? null;

  const body = (
    <>
      <div className="wa-payslip-head">
        <span className="wa-payslip-kicker">{kicker ?? "Payslip"}</span>
        <span className="wa-payslip-when">{when}</span>
      </div>

      {from || person ? (
        <p className="wa-payslip-parties">
          <span className="wa-payslip-who">{from ? short(from) : "A company"}</span>
          <span className="wa-payslip-to"> to </span>
          <span className="wa-payslip-who">{person ? short(person) : (whereName ?? "them")}</span>
        </p>
      ) : null}

      <p className="wa-payslip-landed">{landed}</p>
      {line ? <p className="wa-payslip-became">{line}</p> : null}
      <p className="wa-payslip-units">
        {units}
        <span className="wa-payslip-sym">{symbol}</span>
      </p>

      {stableAmount !== undefined && cashAmount !== undefined && stableAmount > 0n ? (
        <SplitBar stable={stableAmount} cash={cashAmount} symbol={symbol} />
      ) : null}

      {where && !(from || person) ? (
        <p className="wa-payslip-where">
          {where} {whereName ? <span className="wa-payslip-who">{whereName}</span> : null}
        </p>
      ) : null}

      {price || (route && route.length > 0) ? (
        <dl className="wa-payslip-facts">
          {price ? (
            <div>
              <dt>Price</dt>
              <dd>
                1 {symbol} = {price}
              </dd>
            </div>
          ) : null}
          {route && route.length > 0 ? (
            <div>
              <dt>Route</dt>
              <dd>{route.join(" → ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {note ? <p className="wa-payslip-note">{note}</p> : null}

      {sections?.map((s, i) => (
        <div key={i} className="wa-payslip-section">
          {s.title ? <p className="wa-payslip-section-title">{s.title}</p> : null}
          {s.rows.map((r, j) => (
            <p key={j} className="wa-payslip-row">
              <span className="k">{r.k}</span>
              <span className={`v${r.tone ? ` is-${r.tone}` : ""}`}>{r.v}</span>
            </p>
          ))}
        </div>
      ))}

      {foot ? <p className="wa-payslip-foot">{foot}</p> : null}

      {word ? (
        <span className="wa-payslip-stamp">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
            <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {word}
        </span>
      ) : null}
    </>
  );

  const cls = `wa-payslip${compact ? " is-compact" : ""}${printing ? " is-printing" : ""}${href ? " is-link" : ""}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <article className={cls}>{body}</article>;
}

/**
 * The two-part bar: what arrived as stock and what arrived as USD₮0, as shares of the whole
 * payment, with the dollars written under each part. Widths are bigint arithmetic, rounded
 * down; the words carry the amounts, so the bar itself is hidden from screen readers.
 */
function SplitBar({stable, cash, symbol}: {stable: bigint; cash: bigint; symbol: string}) {
  const kept = cash > stable ? stable : cash < 0n ? 0n : cash;
  const stock = stable - kept;
  const stockPct = Number((stock * 10_000n) / stable) / 100;
  return (
    <div className="wa-payslip-split">
      <div className="wa-payslip-bar" aria-hidden>
        {stock > 0n ? <span className="is-stock" style={{width: `${stockPct}%`}} /> : null}
        {kept > 0n ? <span className="is-cash" style={{width: `${100 - stockPct}%`}} /> : null}
      </div>
      <p className="wa-payslip-split-words">
        {stock > 0n ? (
          <span>
            <i className="key is-stock" aria-hidden />
            {usdt(stock)} in {symbol}
          </span>
        ) : null}
        {kept > 0n ? (
          <span>
            <i className="key is-cash" aria-hidden />
            {usdt(kept)} in USD₮0
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** One payment as the record holds it, for a payslip. The shape lib/company.ts reads. */
export type PayslipReceipt = {
  txHash: `0x${string}`;
  payer: `0x${string}`;
  recipient: `0x${string}`;
  blockTime: number | null;
  asset: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  stableAmount: bigint;
  cashAmount: bigint;
  assetAmount: bigint;
  reason: string | null;
};

/**
 * A PAYSLIP FROM A RECORDED PAYMENT: company to person, the units, the split, the price it
 * actually paid (what was swapped over what arrived: arithmetic on a settled payment, not a
 * quote), and the note.
 */
export function Payslip({
  receipt: r,
  href,
  compact = false,
}: {
  receipt: PayslipReceipt;
  href?: string;
  compact?: boolean;
}) {
  const dollarsOnly = r.assetAmount === 0n;
  const price = dollarsOnly ? null : settledUnitPrice(r.stableAmount - r.cashAmount, r.assetAmount, r.assetDecimals);
  return (
    <Stub
      landed={
        <>
          <strong>{usdt(r.stableAmount)}</strong> paid
        </>
      }
      became={dollarsOnly ? "all of it in USD₮0" : "which became"}
      units={dollarsOnly ? (Number(r.cashAmount) / 1e6).toFixed(2) : unitsFromRaw(r.assetAmount, r.assetDecimals)}
      symbol={dollarsOnly ? "USD₮0" : r.assetSymbol}
      when={r.blockTime === null ? "Settled on X Layer" : stampUTC(r.blockTime)}
      from={r.payer}
      to={r.recipient}
      stableAmount={r.stableAmount}
      cashAmount={r.cashAmount}
      price={price === null ? null : `$${price.toFixed(2)}`}
      note={r.reason}
      href={href}
      compact={compact}
    />
  );
}
