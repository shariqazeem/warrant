"use client";

/**
 * THE TICKING NUMBERS — the only part of a certificate that runs in the browser.
 *
 * Once a second it asks lib/vesting for the EXACT value at that whole second: the same
 * arithmetic the escrow's `vestedUnitsAt` and `releasableUnits` do, on the grant's own terms
 * and its pool as read by the server. Nothing accumulates, so nothing drifts: second t
 * always shows what the chain would say at t. Only these numbers re-render; the certificate
 * around them is static HTML. The figures are fixed-width tabular mono, so nothing moves.
 *
 * A screen reader hears the value once a minute, not once a second.
 */
import {
  accruedUnitsAt,
  formatUnitsFixed,
  releasableUnits,
  vestedUnitsAt,
  vestingPhase,
  type PoolState,
  type VestingTerms,
} from "@/lib/vesting";
import {useSecond} from "./use-second";

export type TickerProps = {
  terms: VestingTerms;
  pool: PoolState;
  decimals: number;
  symbol: string;
  /** The server's clock when it rendered, so the first paint and hydration agree. */
  initialNow: number;
  closed: boolean;
  /** Preformatted: a date, or a clock time on a short grant. */
  startLabel: string;
  cliffLabel: string | null;
  endLabel: string;
};

type Readout = {
  label: string;
  value: string | null;
  right: {k: string; v: string | null} | null;
  spoken: string;
  ready: bigint;
  phase: "closed" | ReturnType<typeof vestingPhase>;
};

/** Everything the readout says at one second. Pure, so both islands agree. */
function readout(p: TickerProps, at: number): Readout {
  const {terms: t, pool, decimals} = p;
  const phase = p.closed ? "closed" : vestingPhase(t, at);
  const vested = vestedUnitsAt(t, pool, at);
  const ready = releasableUnits(t, pool, at);
  const fmt = (v: bigint, dp: number) => formatUnitsFixed(v, decimals, dp);

  switch (phase) {
    case "closed":
      return {
        label: t.revoked ? "Cancelled, and all it kept released" : "Fully released",
        value: null,
        right: null,
        spoken: t.revoked ? "Cancelled; everything that had vested was released." : "Fully released.",
        ready,
        phase,
      };
    case "not-started":
      return {
        label: `Vesting starts ${p.startLabel}`,
        value: null,
        right: p.cliffLabel ? {k: `Unlocks on ${p.cliffLabel}`, v: null} : null,
        spoken: `Vesting starts ${p.startLabel}.`,
        ready,
        phase,
      };
    case "accruing": {
      const accrued = accruedUnitsAt(t, pool, at);
      return {
        label: "Accruing…",
        value: fmt(accrued, 8),
        right: p.cliffLabel ? {k: `Unlocks on ${p.cliffLabel}`, v: null} : null,
        spoken: `Accruing ${fmt(accrued, 6)} ${p.symbol}; unlocks on ${p.cliffLabel ?? p.startLabel}.`,
        ready,
        phase,
      };
    }
    case "vested":
      return {
        label: "Fully vested",
        value: fmt(vested, 10),
        right: ready > 0n ? {k: "Ready to release", v: fmt(ready, 6)} : {k: "All released", v: null},
        spoken: `Fully vested: ${fmt(vested, 6)} ${p.symbol}.`,
        ready,
        phase,
      };
    case "revoked":
      return {
        label: "Vested before it was cancelled",
        value: fmt(vested, 10),
        right: ready > 0n ? {k: "Ready to release", v: fmt(ready, 6)} : {k: "All released", v: null},
        spoken: `Vested before it was cancelled: ${fmt(vested, 6)} ${p.symbol}.`,
        ready,
        phase,
      };
    default:
      return {
        label: "Vested now",
        value: fmt(vested, 10),
        right: {k: "Ready to release", v: fmt(ready, 6)},
        spoken: `Vested now ${fmt(vested, 6)} ${p.symbol}. Ready to release ${fmt(ready, 6)}.`,
        ready,
        phase,
      };
  }
}

/** What a screen reader is told: the readout, refreshed on the minute or on a change of phase. */
function spokenAt(p: TickerProps, at: number): string {
  return readout(p, at - (at % 60)).spoken;
}

/** The certificate's own line: "Vested now 0.7149657947 … Ready to release 0.001785". */
export function TickerRow(p: TickerProps) {
  const at = useSecond(p.initialNow);
  const r = readout(p, at);
  return (
    <div className="wa-rule-head">
      <span className="wa-rule-l" aria-hidden>
        {r.label}
        {r.value !== null ? <> <span className="wa-rule-n">{r.value}</span></> : null}
      </span>
      {r.right ? (
        <span className="wa-rule-r" aria-hidden>
          {r.right.k}
          {r.right.v !== null ? <> <span className="wa-rule-n is-small">{r.right.v}</span></> : null}
        </span>
      ) : null}
      <span className="wa-sr" aria-live="polite">
        {spokenAt(p, at)}
      </span>
    </div>
  );
}

/** The phone's readout: "Vested so far", the figure large, and what it is out of. */
export function TickerStack(p: TickerProps & {unitsText: string}) {
  const at = useSecond(p.initialNow);
  const r = readout(p, at);
  return (
    <div className="wa-rule-stack">
      <span className="wa-rule-k" aria-hidden>
        {r.phase === "vesting" ? "Vested so far" : r.label}
      </span>
      {r.value !== null ? (
        <span className="wa-rule-big" aria-hidden>
          {r.value} <span className="wa-rule-sym">{p.symbol}</span>
        </span>
      ) : null}
      <span className="wa-rule-of" aria-hidden>
        {r.phase === "closed"
          ? `of ${p.unitsText} ${p.symbol}`
          : r.phase === "revoked"
            ? `of ${p.unitsText} ${p.symbol} granted; nothing more will vest`
            : r.phase === "vested"
              ? `of ${p.unitsText} ${p.symbol}, fully vested since ${p.endLabel}`
              : r.phase === "accruing"
                ? `of ${p.unitsText} ${p.symbol}, unlocking on ${p.cliffLabel ?? p.startLabel}, then vesting every second until ${p.endLabel}`
                : `of ${p.unitsText} ${p.symbol}, vesting every second until ${p.endLabel}`}
      </span>
      <span className="wa-sr" aria-live="polite">
        {spokenAt(p, at)}
      </span>
    </div>
  );
}

/** The two ruled rows under the phone's rule: what has reached them, and what is due. */
export function TickerRows(p: TickerProps & {releasedUnits: bigint | null}) {
  const at = useSecond(p.initialNow);
  const ready = releasableUnits(p.terms, p.pool, at);
  return (
    <dl className="wa-rule-rows">
      {p.releasedUnits !== null ? (
        <div>
          <dt>Released to them</dt>
          <dd className="wa-rule-n">{formatUnitsFixed(p.releasedUnits, p.decimals, 6)}</dd>
        </div>
      ) : null}
      <div>
        <dt>Ready to release</dt>
        <dd className="wa-rule-n">{formatUnitsFixed(ready, p.decimals, 6)}</dd>
      </div>
    </dl>
  );
}
