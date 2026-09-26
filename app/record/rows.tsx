import Link from "next/link";
import type {RecordEntry} from "@/lib/company";
import {dateUTC, lengthWords, runLabel, short, unitsFromRaw, usdt} from "@/lib/format";
import {allTeam} from "@/lib/team";
import "./record.css";

/** A grant's number as its certificate prints it: the id, zero-padded to six digits. */
export const certificateNumber = (id: number): string => String(id).padStart(6, "0");

/**
 * THE PUBLIC RECORD, AS RULED ROWS: one per grant, opening its certificate, and one per
 * payroll run, opening its payslips. Used by /record and by the front page's excerpt of it.
 * Every figure is from the chain's events, as the indexer copied them.
 */
export function RecordRows({entries}: {entries: readonly RecordEntry[]}) {
  return (
    <ol className="wa-rec-rows">
      {entries.map((e) =>
        e.kind === "grant" ? (
          <li key={`g-${e.id}`} className="wa-rec">
            <p className="wa-rec-what">
              <Link href={`/g/${e.id}`}>Grant No. {certificateNumber(e.id)}</Link>
            </p>
            <p className="wa-rec-body">
              <span className="wa-rec-units">{unitsFromRaw(e.units, e.assetDecimals)}</span>{" "}
              {e.assetSymbol} to <span className="wa-rec-mono">{short(e.beneficiary)}</span>, bought for{" "}
              {usdt(e.stableCost)} and vesting over {lengthWords(e.durationSeconds)}
              {e.cliffSeconds > 0 ? `, with a cliff of ${lengthWords(e.cliffSeconds)}` : ""}. Granted by{" "}
              <span className="wa-rec-mono">{short(e.payer)}</span>.
              {allTeam([e.payer, e.beneficiary]) ? (
                <span className="wa-rec-team">A test between Warrant&rsquo;s own wallets.</span>
              ) : null}
            </p>
            <p className="wa-rec-when">{e.blockTime === null ? `Block ${e.blockNumber}` : dateUTC(e.blockTime)}</p>
          </li>
        ) : (
          <li key={`r-${e.runId}`} className="wa-rec">
            <p className="wa-rec-what">
              <Link href={`/run/${e.runId}`}>{e.people === 1 && e.payments === 1 ? "Payslip" : "Payroll run"}</Link>
            </p>
            <p className="wa-rec-body">
              <span className="wa-rec-units">{usdt(e.totalStable)}</span> paid to {e.people}{" "}
              {e.people === 1 ? "person" : "people"}
              {e.delivered.length > 0
                ? `, who received ${e.delivered
                    .map((d) => `${unitsFromRaw(d.units, d.decimals)} ${d.symbol}`)
                    .join(" and ")}${e.cashTotal > 0n ? ` and ${usdt(e.cashTotal)} in USD₮0` : ""}`
                : ", all in USD₮0"}
              . Paid by <span className="wa-rec-mono">{short(e.payer)}</span>
              {e.transactions === 1 ? " in one transaction" : ` in ${e.transactions} transactions`}
              {/* A run's name is what someone types into Jump to find it again; a single
                  payment's generated name is not, because its payslip is the handle. */}
              {e.people === 1 && e.payments === 1 ? (
                "."
              ) : (
                <>
                  , run <span className="wa-rec-mono">{runLabel(e.runId)}</span>.
                </>
              )}
              {allTeam([e.payer, ...e.recipients]) ? (
                <span className="wa-rec-team">A test: every wallet in it is one of Warrant&rsquo;s own.</span>
              ) : null}
            </p>
            <p className="wa-rec-when">{e.blockTime === null ? `Block ${e.blockNumber}` : dateUTC(e.blockTime)}</p>
          </li>
        ),
      )}
    </ol>
  );
}
