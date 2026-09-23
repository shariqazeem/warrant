import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {Lock} from "lucide-react";
import {PrintButton} from "@/components/app/print-button";
import {ScheduleBar} from "@/components/grants/schedule-bar";
import {EXPLORER_ADDRESS, EXPLORER_TX} from "@/lib/chain";
import {readGrantRecord, type GrantRecord} from "@/lib/grant-receipts";
import {escrowAddress, grantStanding, parseGrantId, type Standing} from "@/lib/grants";
import {catchUp} from "@/lib/indexer";
import {bps, dateUTC, short, stampUTC, unitsFromRaw} from "@/lib/format";
import {progress, type Schedule} from "@/lib/schedule";
import {GrantTerms, OpeningStub} from "@/app/receipt/[tx]/grant-stubs";
import {Line, Note, Sheet} from "@/app/receipt/[tx]/parts";
import "@/app/receipt/[tx]/receipt.css";
import "@/components/grants/grants.css";
import "./grant.css";

/**
 * `/grant/[id]` — ONE GRANT'S PUBLIC RECORD.
 *
 * Who gave whom what, how it vests, where it stands today, why it was made, and every
 * release, each one a transaction with its own receipt. The page a person is sent when they
 * are told "you have been granted stock", and the page a judge can check it against.
 *
 * Unshelled and print-like, like the receipt. What a grant holds and what is due are read
 * live from the escrow; its opening is read from the transaction on record and checked
 * against the USDT it moved before anything else is drawn (lib/grant-receipts.ts). A grant
 * whose opening does not check out is not shown, and the page says why.
 */
export const revalidate = 15;

type Params = {params: Promise<{id: string}>};

type Hex = `0x${string}`;

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {id} = await params;
  const n = parseGrantId(id);
  return {
    title: n === null ? "Not a grant — Warrant" : `Grant ${n} — Warrant`,
    description: "A stock position that vests on a schedule, with the reason it was granted.",
  };
}

/** The chip's colour. Red is money taken back; a grant simply running on is not coloured. */
const CHIP: Record<Standing["kind"], string> = {
  closed: "wa-chip is-closed",
  cancelled: "wa-chip is-revoked",
  "fully-vested": "wa-chip",
  "not-started": "wa-chip",
  "before-cliff": "wa-chip",
  vesting: "wa-chip",
};

function Record({record, escrow, now}: {record: GrantRecord; escrow: Hex; now: number}) {
  const {grant: g, opening, vests} = record;
  const facts = {symbol: g.assetSymbol, decimals: g.assetDecimals};
  const u = (v: bigint) => `${unitsFromRaw(v, facts.decimals)} ${facts.symbol}`;
  const standing = grantStanding(g, now);

  // Drawn against the shares the grant was OPENED with. A cancel shrinks a grant's shares to
  // what had vested, and a bar drawn on those would read "fully vested" on the very day it
  // was cancelled.
  const schedule: Schedule = {
    shares: opening.moment.shares,
    start: g.start,
    cliffSeconds: g.cliffSeconds,
    durationSeconds: g.durationSeconds,
    revoked: g.revoked,
    frozenShares: g.frozenVestedShares,
  };
  const p = progress(schedule, g.sharesReleased, now);
  const vested = bps(Math.floor(p.vestedFraction * 10_000));
  const released = vests.reduce((sum, v) => sum + v.unitsToBeneficiary, 0n);

  return (
    <main className="wa-receipt">
      <OpeningStub opening={opening} facts={facts} />

      <section className="wa-g-standing">
        <p className="wa-g-chips">
          <span className={CHIP[standing.kind]}>{standing.label}</span>
          {standing.irrevocable ? (
            <span className="wa-chip is-sealed">
              <Lock size={14} strokeWidth={2} aria-hidden />
              Irrevocable
            </span>
          ) : null}
        </p>
        <p className="wa-g-words">{standing.words}</p>
        <ScheduleBar schedule={schedule} releasedShares={g.sharesReleased} now={now} />
      </section>

      <Sheet title="Where it stands">
        <Line k="Vested so far">
          {vested} of the grant
          <span className="wa-r-aside">
            {g.revoked
              ? "when it was cancelled; nothing more will vest"
              : p.finished
                ? `all of it, since ${dateUTC(p.endsAt)}`
                : p.pastCliff
                  ? `on its schedule, until ${dateUTC(p.endsAt)}`
                  : `nothing vests until the cliff on ${dateUTC(p.cliffAt)}`}
          </span>
        </Line>
        <Line k="Released to them">
          {u(released)}
          <span className="wa-r-aside">
            {vests.length === 0
              ? "nothing yet"
              : `in ${vests.length} release${vests.length === 1 ? "" : "s"}, listed below`}
          </span>
        </Line>
        <Line k="Ready to release">
          {u(g.releasableUnits)}
          <span className="wa-r-aside">anyone may release it, and it only ever goes to them</span>
        </Line>
        <Line k="Still in escrow">
          {u(g.heldUnits)}
          <span className="wa-r-aside">held for them, vested or not</span>
        </Line>
      </Sheet>

      <GrantTerms opening={opening} facts={facts} shortAddresses />

      <Note hash={g.reasonHash} of="grant" />

      <Sheet title="Releases">
        {vests.length === 0 ? (
          <p className="wa-r-note">
            Nothing has been released yet. Each release will be listed here with its own
            receipt.
          </p>
        ) : (
          <ol className="wa-g-vests">
            {vests.map((v) => (
              <li className="wa-g-vest" key={`${v.txHash}-${v.logIndex}`}>
                <Link href={`/receipt/${v.txHash}`} className="wa-g-vest-when">
                  {v.blockTime === null ? `Block ${v.blockNumber}` : stampUTC(v.blockTime)}
                </Link>
                <span className="wa-g-vest-units wa-mono">{u(v.unitsToBeneficiary)}</span>
                <span className="wa-g-vest-fee">
                  {v.unitsToCaller > 0n
                    ? `${u(v.unitsToCaller)} to whoever released it`
                    : "no release fee"}
                </span>
                <a href={EXPLORER_TX(v.txHash)} className="wa-g-vest-tx wa-mono" title={v.txHash}>
                  <span className="wa-r-addr-short">{short(v.txHash)} on OKLink</span>
                  <span className="wa-r-addr-full">{v.txHash}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </Sheet>

      <Sheet title="Proof on X Layer">
        <Line k="Opened in">
          <a href={EXPLORER_TX(opening.txHash)} className="wa-mono">
            {opening.txHash}
          </a>
          <span className="wa-r-aside">
            <Link href={`/receipt/${opening.txHash}`}>Its receipt</Link>
          </span>
        </Line>
        <Line k="Block">{opening.blockNumber.toString()}</Line>
        <Line k="Chain">X Layer, 196</Line>
        <Line k="Held by">
          <a href={EXPLORER_ADDRESS(escrow)} className="wa-mono">
            {escrow}
          </a>
          <span className="wa-r-aside">the escrow contract that holds the stock until it vests</span>
        </Line>
        <Line k="Read">
          {stampUTC(now)}
          <span className="wa-r-aside">what it holds and what is due, from the escrow itself</span>
        </Line>
      </Sheet>

      {/* A record is a document. It prints like one, and the control does not. */}
      <div className="wa-r-print">
        <PrintButton />
      </div>
    </main>
  );
}

export default async function GrantPage({params}: Params) {
  const {id: raw} = await params;
  const id = parseGrantId(raw);
  if (id === null) notFound();

  // Without an escrow there are no grants on this site, and every id is unknown.
  const escrow = escrowAddress();
  if (!escrow.ok) notFound();

  // A grant opened moments ago may not be on the indexer's record yet. Bounded: it moves an
  // existing cursor a window or two and never cold-starts a page.
  await catchUp();

  const found = await readGrantRecord(id);
  if (!found.ok) {
    return (
      <main className="wa-receipt">
        <p className="wa-r-held">{found.why}</p>
        <p className="wa-r-note">
          <a href={EXPLORER_ADDRESS(escrow.value)}>Look at the escrow on the X Layer explorer</a>.
        </p>
      </main>
    );
  }
  if (found.value === null) notFound();

  // Read once, so the bar, the words and the figures describe the same moment.
  const now = Math.floor(Date.now() / 1000);
  return <Record record={found.value} escrow={escrow.value} now={now} />;
}
