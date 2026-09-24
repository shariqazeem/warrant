"use client";

import Link from "next/link";
import {useWallet} from "@/components/wallet/use-wallet";
import {short, stampUTC} from "@/lib/format";
import {floorUnits, stampOrDate} from "@/lib/grant-terms";

/**
 * THE GRANTS BELOW THE FORM: the connected wallet's own first — the ones it issued and the
 * ones issued to it — and every grant, folded, under them. Each row opens its certificate.
 *
 * Every figure was read from the escrow on the server (app/grants/page.tsx). The units are
 * what the contract says it holds for the grant right now, cut to four places, never rounded
 * up; where each grant stands was worked out there with one clock for every row. The actions
 * — seal, release, claim, cancel — live on each certificate's page.
 */
export type ShelfRow = {
  id: number;
  payer: `0x${string}`;
  beneficiary: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  /** Units the escrow holds for this grant now, as the contract computes them. */
  heldUnits: bigint;
  start: number;
  durationSeconds: number;
  sealed: boolean;
  /** "Vesting", "Fully vested", "Cancelled", "Closed", "Not started". */
  standing: string;
  standingKind: "closed" | "cancelled" | "fully-vested" | "not-started" | "before-cliff" | "vesting";
};

const certNo = (id: number) => `No. ${String(id).padStart(6, "0")}`;

function Row({row, me}: {row: ShelfRow; me: string | null}) {
  const ends = row.start + row.durationSeconds;
  const iPaid = me !== null && row.payer.toLowerCase() === me;
  const iReceive = me !== null && row.beneficiary.toLowerCase() === me;
  const who = iPaid
    ? `You granted it to ${short(row.beneficiary)}`
    : iReceive
      ? `Granted to you by ${short(row.payer)}`
      : `To ${short(row.beneficiary)}, from ${short(row.payer)}`;
  const vests =
    row.standingKind === "closed" || row.standingKind === "cancelled"
      ? null
      : row.standingKind === "fully-vested"
        ? `Fully vested ${stampOrDate(ends, row.durationSeconds)}`
        : row.standingKind === "not-started"
          ? `Starts ${stampUTC(row.start)}`
          : `Vests until ${stampOrDate(ends, row.durationSeconds)}`;
  return (
    <li>
      <Link href={`/g/${row.id}`} className="wa-issue-row">
        <span className="no">{certNo(row.id)}</span>
        <span className="units">
          {row.heldUnits > 0n
            ? `${floorUnits(row.heldUnits, row.assetDecimals)} ${row.assetSymbol} in escrow`
            : `${row.assetSymbol}, all released`}
        </span>
        <span className="state">
          {row.standing}
          {row.sealed ? <span className="sealed">, sealed</span> : null}
          {vests ? <span className="when">. {vests}</span> : null}
        </span>
        <span className="who">{who}</span>
      </Link>
    </li>
  );
}

export function GrantList({
  rows,
  count,
  heading,
  unread,
}: {
  rows: ShelfRow[];
  /** Every grant the escrow has ever opened. */
  count: number;
  /** "Grants (12)", or how many of how many could be read. */
  heading: string;
  unread: {id: number; why: string}[];
}) {
  const wallet = useWallet();
  const me = wallet.status === "ready" || wallet.status === "wrong-chain" ? (wallet.address?.toLowerCase() ?? null) : null;
  const mine = me ? rows.filter((r) => r.payer.toLowerCase() === me || r.beneficiary.toLowerCase() === me) : [];

  return (
    <section className="wa-issue-shelf" aria-labelledby="shelf-heading">
      {me ? (
        <>
          <h2 id="shelf-heading">Your grants</h2>
          {mine.length > 0 ? (
            <ul className="wa-issue-rows">
              {mine.map((r) => (
                <Row key={r.id} row={r} me={me} />
              ))}
            </ul>
          ) : (
            <p className="wa-issue-empty">
              <strong>No grants from or to this wallet yet.</strong>
              The grant you issue above appears here, and so does any grant issued to{" "}
              <span className="is-mono">{short(me)}</span>.
            </p>
          )}
        </>
      ) : (
        <h2 id="shelf-heading">Grants</h2>
      )}

      {unread.length > 0 ? (
        <p className="wa-issue-shelf-note">
          {unread.length === 1 ? "One grant" : `${unread.length} grants`} could not be read just now.{" "}
          {unread[0]!.why} Each is still on X Layer, and its own page reads it again:{" "}
          {unread.map((u, i) => (
            <span key={u.id}>
              {i === 0 ? "" : ", "}
              <Link href={`/g/${u.id}`} className="wa-issue-link">
                {certNo(u.id)}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}

      {count === 0 ? (
        <p className="wa-issue-empty">
          <strong>No grants yet.</strong>
          The first grant issued here will be certificate No. 000001, and it will be listed here.
        </p>
      ) : rows.length > 0 ? (
        <details className="wa-issue-all">
          <summary>
            {heading.startsWith("Grants (")
              ? `All ${heading.charAt(0).toLowerCase()}${heading.slice(1)}`
              : `All grants, ${heading.charAt(0).toLowerCase()}${heading.slice(1)}`}
          </summary>
          <ul className="wa-issue-rows">
            {rows.map((r) => (
              <Row key={r.id} row={r} me={me} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
