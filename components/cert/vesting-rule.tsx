import type {CSSProperties} from "react";
import {vestedShares, vestingPhase} from "@/lib/vesting";
import {poolState, unitsText, vestingTerms, whenLabel, isShortGrant, onOrAt} from "./cert-text";
import type {CertificateData} from "./types";
import {TickerRow, TickerRows, TickerStack, type TickerProps} from "./vesting-ticker";

/**
 * THE VESTING RULE: the schedule, engraved.
 *
 * One ruled line from start to end with month ticks (evenly spaced on a short grant), the
 * cliff in oxblood, the vested part hatched and the released part solid. Above it, the
 * ticking readout (components/cert/vesting-ticker.tsx, the only client code); below it,
 * the start and end, as dates or, on a grant shorter than two days, as clock times.
 *
 * Everything drawn here is from the grant's own terms and the pool the server read, through
 * lib/vesting — the same arithmetic as the escrow. The hatched band grows by itself with a
 * CSS animation timed from the server's clock (linear, exactly as vesting is), so the rule
 * never re-renders; under reduced motion it holds still at the server's moment.
 *
 * Three tones: `engrave` inside a certificate, `vault` on the dark ground, `canvas` on a
 * page. `layout="stack"` is the phone's version: the figure large above the rule and two
 * ruled rows below it.
 */
const DAY = 86_400;
const MONTH = 30.436875 * DAY;

/** Month boundaries from the start, UTC, as unix seconds. */
function addMonthsUTC(unixSeconds: number, months: number): number {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Where the ticks go, as percentages of the term. Calendar months on a long grant — every
 * month up to a year, every quarter up to two, every half year up to five, then yearly — and
 * eighths on anything shorter than two months.
 */
export function tickPositions(start: number, durationSeconds: number): number[] {
  if (durationSeconds <= 0) return [];
  if (durationSeconds < 2 * MONTH) return [1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * 100);
  const months = durationSeconds / MONTH;
  const step = months <= 12 ? 1 : months <= 24 ? 3 : months <= 60 ? 6 : 12;
  const out: number[] = [];
  for (let m = step; m < 1200; m += step) {
    const at = addMonthsUTC(start, m);
    if (at >= start + durationSeconds - DAY) break;
    out.push(((at - start) / durationSeconds) * 100);
  }
  return out;
}

const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

export function VestingRule({
  data,
  tone,
  now = Math.floor(Date.now() / 1000),
  specimen = false,
  layout,
  releasedUnits = null,
}: {
  data: CertificateData;
  tone: "engrave" | "vault" | "canvas";
  /** The moment the page was read; the ticker takes over from it in the browser. */
  now?: number;
  /** A preview: the schedule's shape, with nothing vested and no readout. */
  specimen?: boolean;
  layout?: "row" | "stack";
  /** Units released so far, from the release events, for the phone's "Released" row. */
  releasedUnits?: bigint | null;
}) {
  const shape = layout ?? (tone === "engrave" ? "row" : "stack");
  const d = data;
  const duration = Math.max(0, d.durationSeconds);
  const cliffPct = duration > 0 ? (d.cliffSeconds / duration) * 100 : 0;
  const hasCliff = d.cliffSeconds > 0 && d.cliffSeconds < duration;
  const startLabel = whenLabel(d.start, duration);
  const endLabel = whenLabel(d.start + duration, duration);
  const cliffLabel = hasCliff ? whenLabel(d.start + d.cliffSeconds, duration) : null;
  const ticks = tickPositions(d.start, duration);

  const terms = specimen ? null : vestingTerms(d);
  const pool = specimen ? null : poolState(d);

  // The bar is drawn against the shares the grant was OPENED with: a cancel shrinks a grant's
  // live shares to what had vested, and a bar drawn on those would read "fully vested" on the
  // very day it was cancelled.
  const whole = d.openedShares ?? d.shares ?? 0n;
  const fraction = (v: bigint) => (whole > 0n ? Number((v * 1_000_000n) / whole) / 10_000 : 0);
  const vestedPct = terms ? fraction(vestedShares(terms, now)) : 0;
  const releasedPct = terms ? fraction(terms.sharesReleased) : d.closed ? 100 : 0;
  const phase = terms ? (d.closed ? "closed" : vestingPhase(terms, now)) : null;
  // Only a schedule still running grows. It starts growing at the cliff, from the cliff's
  // share, and reaches the end at the end: a negative delay means it began in the past.
  const growing = phase === "not-started" || phase === "accruing" || phase === "vesting";
  const growStyle: CSSProperties | undefined = growing
    ? ({
        "--wa-grow-from": pct(cliffPct),
        animationDuration: `${Math.max(1, duration - d.cliffSeconds)}s`,
        animationDelay: `${d.start + d.cliffSeconds - now}s`,
      } as CSSProperties)
    : undefined;

  const ticker: TickerProps | null =
    terms && pool
      ? {
          terms,
          pool,
          decimals: d.asset.decimals,
          symbol: d.asset.symbol,
          initialNow: now,
          closed: d.closed,
          startLabel,
          cliffLabel,
          endLabel,
        }
      : null;

  const ariaBar =
    phase === null
      ? `The schedule: from ${startLabel} to ${endLabel}${cliffLabel ? `, with a cliff ${onOrAt(cliffLabel)}` : ", with no cliff"}.`
      : `${Math.floor(vestedPct)}% vested and ${Math.floor(releasedPct)}% released of the grant, ` +
        `from ${startLabel} to ${endLabel}${cliffLabel ? `, cliff ${onOrAt(cliffLabel)}` : ""}.`;

  return (
    <div className={`wa-vest is-${tone} is-${shape}${isShortGrant(duration) ? " is-short" : ""}`}>
      {shape === "row" ? (
        ticker ? (
          <TickerRow {...ticker} />
        ) : (
          <div className="wa-vest-head">
            <span className="wa-vest-l">
              {specimen ? "Vesting starts the moment it is issued." : `Vests every second until ${endLabel}.`}
            </span>
          </div>
        )
      ) : ticker ? (
        <TickerStack {...ticker} unitsText={unitsText(d)} />
      ) : (
        <div className="wa-vest-stack">
          <span className="wa-vest-k">
            {specimen ? "Vesting starts the moment it is issued." : `Vests every second until ${endLabel}.`}
          </span>
        </div>
      )}

      <div className="wa-vest-bar" role="img" aria-label={ariaBar}>
        <span className="wa-vest-line" />
        {ticks.map((t) => (
          <span key={t.toFixed(4)} className="wa-vest-tick" style={{left: pct(t)}} />
        ))}
        <span
          className={`wa-vest-vested${growing ? " is-growing" : ""}`}
          style={{width: pct(vestedPct), ...growStyle}}
        />
        <span className="wa-vest-released" style={{width: pct(releasedPct)}} />
        {hasCliff ? <span className="wa-vest-cliff" style={{left: pct(cliffPct)}} /> : null}
      </div>

      <div className="wa-vest-labels" aria-hidden>
        <span className="wa-vest-start">{startLabel}</span>
        {/* The word sits under its marker, or not at all: near either end it would print over
            a date, and the certificate's own sentence already names the cliff. */}
        {hasCliff && cliffPct >= 24 && cliffPct <= 76 ? (
          <span className="wa-vest-cliff-label" style={{left: pct(cliffPct)}}>
            Cliff
          </span>
        ) : null}
        <span className="wa-vest-end">{endLabel}</span>
      </div>

      {shape === "stack" && ticker ? <TickerRows {...ticker} releasedUnits={releasedUnits} /> : null}
    </div>
  );
}
