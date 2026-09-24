import Link from "next/link";
import {Stub} from "@/components/stub/stub";
import {PrintButton} from "@/components/app/print-button";
import {EXPLORER_ADDRESS, EXPLORER_TX, STABLE} from "@/lib/chain";
import {STABLE_NAME} from "@/lib/grant-terms";
import type {GrantReceipt, Opening} from "@/lib/grant-receipts";
import {bps, settledUnitPrice, short, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {Address, AssetIdentity, Line, Note, Sheet, ShortAddress} from "./parts";

/**
 * A GRANT'S MOMENTS, EACH AS A STUB.
 *
 * The same object a payment prints, at the same size, with the figure that moved in the
 * units line: what the USDT bought when a grant opens, what reached their wallet when it
 * vests, what went back to the company when it is cancelled. Sealing and closing move no
 * money, so their stubs carry what the grant bought and say plainly what changed.
 *
 * Every figure comes from the transaction's own logs or from the grant's opening, which
 * was checked against the USDT it moved before anything here was drawn.
 */

type Facts = {symbol: string; decimals: number};
type Hex = `0x${string}`;

const when = (t: number | null) => (t === null ? "settled on X Layer" : stampUTC(t));

/** The stub for a grant's opening: USDT in, the units it bought, vesting to them. */
export function OpeningStub({opening, facts}: {opening: Opening; facts: Facts}) {
  const o = opening.moment;
  return (
    <Stub
      kicker="Granted on X Layer"
      landed={
        <>
          <strong>{usdt(o.stableCost)}</strong> paid into grant {o.id}
        </>
      }
      became="which bought"
      units={unitsFromRaw(o.units, facts.decimals)}
      symbol={facts.symbol}
      when={when(opening.timestamp)}
      where="vesting to their own wallet"
      whereName={short(o.beneficiary)}
      printing
    />
  );
}

/**
 * The terms a grant was opened with. None of them changes after the opening; what a grant
 * holds now is the record page's business, read live from the escrow.
 */
export function GrantTerms({
  opening,
  facts,
  shortAddresses = false,
}: {
  opening: Opening;
  facts: Facts;
  shortAddresses?: boolean;
}) {
  const o = opening.moment;
  const Who = shortAddresses ? ShortAddress : Address;
  const price = settledUnitPrice(o.stableCost, o.units, facts.decimals);
  const cliffAt = o.start + o.cliffSeconds;
  const endsAt = o.start + o.durationSeconds;

  return (
    <Sheet title="What was granted">
      <Line k="Paid">
        {usdt(o.stableCost)} in {STABLE_NAME}
      </Line>
      <Line k="Bought">
        {unitsFromRaw(o.units, facts.decimals)} {facts.symbol}
        <span className="wa-r-aside">held in escrow for them until it vests</span>
      </Line>
      <Line k="Asset">
        <AssetIdentity address={o.asset} symbol={facts.symbol} eligibility />
      </Line>
      <Line k="Price paid">
        {price === null ? "not available" : `1 ${facts.symbol} = $${price.toFixed(2)}`}
        <span className="wa-r-aside">what this grant actually paid per unit</span>
      </Line>
      <Line k="Vests to">
        <Who value={o.beneficiary} />
      </Line>
      <Line k="Granted by">
        <Who value={o.payer} />
      </Line>
      <Line k="Starts">{stampUTC(o.start)}</Line>
      <Line k="Cliff">
        {o.cliffSeconds === 0
          ? "none: it vests from the start"
          : `${stampUTC(cliffAt)}, after ${humanDuration(o.cliffSeconds)}`}
      </Line>
      <Line k="Fully vested">
        {stampUTC(endsAt)}, after {humanDuration(o.durationSeconds)}
      </Line>
      <Line k="Release fee">
        {o.tipBps === 0 ? "none" : `${bps(o.tipBps)} of each release, to whoever releases it`}
        <span className="wa-r-aside">nothing when they release it themselves</span>
      </Line>
    </Sheet>
  );
}

/** Where a grant moment is anchored, and the grant it belongs to. */
function Proof({r, asset, escrow}: {r: GrantReceipt; asset: Hex; escrow: Hex | null}) {
  const id = r.moment.id;
  return (
    <Sheet title="Proof on X Layer">
      <Line k="Transaction">
        <a href={EXPLORER_TX(r.txHash)} className="wa-mono">
          {r.txHash}
        </a>
      </Line>
      <Line k="Block">{r.blockNumber.toString()}</Line>
      <Line k="Chain">X Layer, 196</Line>
      <Line k="Asset">
        <a href={EXPLORER_ADDRESS(asset)} className="wa-mono">
          {asset}
        </a>
      </Line>
      {escrow ? (
        <Line k="Held by">
          <a href={EXPLORER_ADDRESS(escrow)} className="wa-mono">
            {escrow}
          </a>
          <span className="wa-r-aside">the escrow contract that holds the stock until it vests</span>
        </Line>
      ) : null}
      <Line k="Grant">
        <Link href={`/grant/${id}`}>Grant {id}, its whole record</Link>
      </Line>
    </Sheet>
  );
}

/** A share of a grant as a percentage, rounded down so it never reads as more than it is. */
const shareOf = (part: bigint, whole: bigint) =>
  whole === 0n ? "0%" : bps(Number((part * 10_000n) / whole));

/** One of a grant's moments, as the stub it prints and the sheets beneath it. */
export function GrantMomentReceipt({r, facts, escrow}: {r: GrantReceipt; facts: Facts; escrow: Hex | null}) {
  const m = r.moment;
  const o = r.opening.moment;
  const u = (v: bigint) => `${unitsFromRaw(v, facts.decimals)} ${facts.symbol}`;

  let stub: React.ReactNode;
  let sheet: React.ReactNode;

  switch (m.kind) {
    case "opened":
      stub = <OpeningStub opening={r.opening} facts={facts} />;
      sheet = <GrantTerms opening={r.opening} facts={facts} />;
      break;

    case "vested": {
      const selfServed = m.caller.toLowerCase() === m.beneficiary.toLowerCase();
      stub = (
        <Stub
          kicker="Released on X Layer"
          landed={
            <>
              From grant <strong>{m.id}</strong>
            </>
          }
          became="which released"
          units={unitsFromRaw(m.unitsToBeneficiary, facts.decimals)}
          symbol={facts.symbol}
          when={when(r.timestamp)}
          where="in their own wallet"
          whereName={short(m.beneficiary)}
          printing
        />
      );
      sheet = (
        <Sheet title="What was released">
          <Line k="Released to them">{u(m.unitsToBeneficiary)}</Line>
          <Line k="Release fee">
            {m.unitsToCaller > 0n ? u(m.unitsToCaller) : "none"}
            <span className="wa-r-aside">
              {m.unitsToCaller > 0n
                ? `${bps(o.tipBps)} of the release, paid to whoever released it`
                : selfServed
                  ? "they released it themselves, which costs nothing"
                  : "nothing was due to whoever released it"}
            </span>
          </Line>
          <Line k="Released by">
            <Address value={m.caller} />
            <span className="wa-r-aside">anyone may release a grant; it only ever goes to them</span>
          </Line>
          <Line k="Paid to">
            <Address value={m.beneficiary} />
          </Line>
          <Line k="Asset">
            <AssetIdentity address={m.asset} symbol={facts.symbol} eligibility />
          </Line>
          <Line k="Released so far">
            {shareOf(m.sharesReleased, m.sharesTotal)} of the grant
            <span className="wa-r-aside">counting this release</span>
          </Line>
        </Sheet>
      );
      break;
    }

    case "revoked":
      stub = (
        <Stub
          kicker="Cancelled on X Layer"
          landed={
            <>
              Grant <strong>{m.id}</strong> cancelled
            </>
          }
          became="which returned"
          units={unitsFromRaw(m.returnedUnits, facts.decimals)}
          symbol={facts.symbol}
          when={when(r.timestamp)}
          where="to the company's own wallet"
          whereName={short(m.payer)}
          printing
        />
      );
      sheet = (
        <Sheet title="What the cancel did">
          <Line k="Returned">
            {u(m.returnedUnits)}
            <span className="wa-r-aside">the part that had not vested, back to the company</span>
          </Line>
          <Line k="Theirs to keep">
            {u(m.vestedUnits)}
            <span className="wa-r-aside">
              everything that had vested by then, released or not; what is left can still be
              released to them
            </span>
          </Line>
          <Line k="Cancelled by">
            <Address value={m.payer} />
          </Line>
          <Line k="Granted to">
            <Address value={o.beneficiary} />
          </Line>
          <Line k="Asset">
            <AssetIdentity address={o.asset} symbol={facts.symbol} eligibility />
          </Line>
        </Sheet>
      );
      break;

    case "sealed":
      stub = (
        <Stub
          kicker="Made irrevocable on X Layer"
          landed={
            <>
              Grant <strong>{m.id}</strong> made irrevocable
            </>
          }
          became="the grant of"
          units={unitsFromRaw(o.units, facts.decimals)}
          symbol={facts.symbol}
          when={when(r.timestamp)}
          where="vesting to their own wallet"
          whereName={short(o.beneficiary)}
          printing
        />
      );
      sheet = (
        <Sheet title="What changed">
          <Line k="Irrevocable">
            Nobody can cancel this grant now, including the company. It vests to them on its
            schedule. No money moved.
          </Line>
          <Line k="Made so by">
            <Address value={m.payer} />
          </Line>
          <Line k="Vests to">
            <Address value={o.beneficiary} />
          </Line>
          <Line k="Asset">
            <AssetIdentity address={o.asset} symbol={facts.symbol} eligibility />
          </Line>
          <Line k="Granted">
            {u(o.units)} for {usdt(o.stableCost)}
            <span className="wa-r-aside">what the grant bought when it was opened</span>
          </Line>
        </Sheet>
      );
      break;

    case "closed":
      stub = (
        <Stub
          kicker="Closed on X Layer"
          landed={
            <>
              Grant <strong>{m.id}</strong> closed
            </>
          }
          became="the grant of"
          units={unitsFromRaw(o.units, facts.decimals)}
          symbol={facts.symbol}
          when={when(r.timestamp)}
          where="everything owed was released to"
          whereName={short(o.beneficiary)}
          printing
        />
      );
      sheet = (
        <Sheet title="What changed">
          <Line k="Closed">
            Everything the grant owed had been released before it was closed. Closing it
            moved no money.
          </Line>
          <Line k="Granted to">
            <Address value={o.beneficiary} />
          </Line>
          <Line k="Asset">
            <AssetIdentity address={o.asset} symbol={facts.symbol} eligibility />
          </Line>
          <Line k="Granted">
            {u(o.units)} for {usdt(o.stableCost)}
            <span className="wa-r-aside">what the grant bought when it was opened</span>
          </Line>
        </Sheet>
      );
      break;
  }

  return (
    <article className="wa-r-one">
      {stub}
      {sheet}
      <Note hash={o.reasonHash} of="grant" />
      <Proof r={r} asset={o.asset} escrow={escrow} />

      {/* A stub is a document. It should print like one, and nothing else on the page
          should print at all. */}
      <div className="wa-r-print">
        <PrintButton />
      </div>
    </article>
  );
}
