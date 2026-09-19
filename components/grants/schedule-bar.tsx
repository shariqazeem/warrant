import {progress, type Schedule} from "@/lib/schedule";
import {dateUTC} from "@/lib/format";

/**
 * THE SCHEDULE, DRAWN.
 *
 * One ruled bar: the term from end to end, the cliff marked on it, how much has vested,
 * and how much of that has actually been released. Vested and released are different
 * things and are drawn differently — a grant can be half vested with nothing taken.
 *
 * Every figure comes from lib/schedule.ts, which is checked against the same fixture the
 * contract is, so this bar cannot show a position the contract would not honour.
 */
export function ScheduleBar({
  schedule,
  releasedShares,
  now,
}: {
  schedule: Schedule;
  releasedShares: bigint;
  now: number;
}) {
  const p = progress(schedule, releasedShares, now);
  const pct = (n: number) => `${Math.max(0, Math.min(1, n)) * 100}%`;

  return (
    <div className="wa-sched">
      <div
        className="wa-sched-bar"
        role="img"
        aria-label={
          `${Math.round(p.vestedFraction * 100)}% vested, ` +
          `${Math.round(p.releasedFraction * 100)}% released, ` +
          `cliff ${p.pastCliff ? "passed" : `on ${dateUTC(p.cliffAt)}`}`
        }
      >
        <span className="wa-sched-vested" style={{width: pct(p.vestedFraction)}} />
        <span className="wa-sched-released" style={{width: pct(p.releasedFraction)}} />
        {p.cliffFraction > 0 && p.cliffFraction < 1 ? (
          <span
            className={`wa-sched-cliff${p.pastCliff ? " is-past" : ""}`}
            style={{left: pct(p.cliffFraction)}}
          />
        ) : null}
      </div>

      <p className="wa-sched-legend">
        <span>{dateUTC(schedule.start)}</span>
        {p.cliffFraction > 0 ? (
          <span className={p.pastCliff ? "" : "is-ahead"}>
            cliff {dateUTC(p.cliffAt)}
          </span>
        ) : null}
        <span>{p.finished && schedule.revoked ? "revoked" : dateUTC(p.endsAt)}</span>
      </p>
    </div>
  );
}
