import {Stub} from "@/components/stub/stub";
import {STABLE} from "@/lib/chain";
import type {Opening} from "@/lib/grant-receipts";
import {bps, settledUnitPrice, short, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {Address, AssetIdentity, Line, Sheet, ShortAddress} from "./parts";

/**
 * A GRANT, AS A STUB.
 *
 * The same object a payment prints, at the same size, with what the USDT bought in the
 * units line, and the terms the grant was opened with in the sheet beneath. Every figure
 * comes from the grant's opening, which was checked against the USDT it moved before
 * anything here was drawn.
 */

type Facts = {symbol: string; decimals: number};

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
        {usdt(o.stableCost)} in {STABLE.symbol}
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
