import { dateUTC } from "@/lib/format";

/**
 * A GRANT'S SCHEDULE AS A RULED TIMELINE: start, the cliff, the linear run, today, and what
 * has actually vested (from the account, never from the clock alone).
 */
export function GrantBar({ totalRaw, releasedRaw, startUnix, cliffSecs, durationSecs, now, compact = false }: { totalRaw: bigint; releasedRaw: bigint; startUnix: number; cliffSecs: number; durationSecs: number; now: number; compact?: boolean }) {
  const end = startUnix + cliffSecs + durationSecs;
  const span = Math.max(end - startUnix, 1);
  const cliffPct = (cliffSecs / span) * 100;
  const nowPct = Math.max(0, Math.min(100, ((now - startUnix) / span) * 100));
  const releasedPct = totalRaw > 0n ? Number((releasedRaw * 10_000n) / totalRaw) / 100 : 0;
  return (
    <div className={`sp-grantbar${compact ? " is-compact" : ""}`}>
      <div className="track" aria-hidden>
        <span className="cliff" style={{ left: `${cliffPct}%` }} />
        <span className="released" style={{ width: `${releasedPct}%` }} />
        <span className="today" style={{ left: `${nowPct}%` }} />
      </div>
      {!compact ? (
        <div className="marks">
          <span>{dateUTC(startUnix)}</span>
          {cliffSecs > 0 && cliffPct > 14 && cliffPct < 86 ? <span style={{ left: `${cliffPct}%`, transform: "translateX(-50%)" }}>cliff {dateUTC(startUnix + cliffSecs)}</span> : null}
          <span className="end">{durationSecs > 0 ? dateUTC(end) : "at the cliff"}</span>
        </div>
      ) : null}
      <p className="line">
        {releasedPct.toFixed(1)}% vested{now < startUnix + cliffSecs ? `, cliff ${dateUTC(startUnix + cliffSecs)}` : now < end ? ", vesting continuously" : ", schedule complete"}
      </p>
    </div>
  );
}
