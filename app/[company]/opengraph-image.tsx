import {ImageResponse} from "next/og";
import {readCompany} from "@/lib/company";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";
import {dateUTC, short, unitsFromRaw, usdt} from "@/lib/format";

/**
 * A COMPANY'S CARD. What a company shows when it says "we pay our people in ownership".
 *
 * Every figure is a sum over rows the indexer copied from the chain. A company that has
 * paid nobody gets a card that says so rather than a card with zeroes on it, because a
 * zero here would read as a claim.
 */
export const runtime = "nodejs";
export const alt = "A company paying its people in ownership";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

function Figure({k, v}: {k: string; v: string}) {
  return (
    <div style={{display: "flex", flexDirection: "column", marginRight: 48}}>
      <div style={{display: "flex", fontSize: 19, color: OG.faint}}>{k}</div>
      <div style={{display: "flex", fontSize: 50, color: OG.ink, marginTop: 8, letterSpacing: -2}}>
        {v}
      </div>
    </div>
  );
}

export default async function Image({params}: {params: {company: string}}) {
  const address = decodeURIComponent(params.company).replace(/^@/, "");
  // One receipt is enough; the totals are computed over every row regardless of this.
  const record = /^0x[0-9a-fA-F]{40}$/.test(address) ? readCompany(address, 1) : null;
  const c = record?.ok ? record.value : null;

  const biggest = (c?.deliveredByAsset ?? [])
    .slice()
    .sort((a, b) => (a.units > b.units ? -1 : 1))[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: OG.paper,
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: OG.sheet,
            border: `1px solid ${OG.line}`,
            borderRadius: 16,
            padding: 44,
          }}
        >
          <div style={{display: "flex", justifyContent: "space-between", fontSize: 22, color: OG.faint}}>
            <div style={{display: "flex"}}>A company&rsquo;s record</div>
            <div style={{display: "flex"}}>Warrant</div>
          </div>

          <div style={{display: "flex", fontSize: 30, color: OG.ink, marginTop: 30}}>
            {short(address)}
          </div>

          {c && c.paymentCount > 0 ? (
            <div style={{display: "flex", flexDirection: "column"}}>
              <div style={{display: "flex", fontSize: 40, color: OG.ink, marginTop: 20, lineHeight: 1.2}}>
                {c.since === null
                  ? "Pays its people in ownership."
                  : `Paying people in ownership since ${dateUTC(c.since)}.`}
              </div>

              <div style={{display: "flex", marginTop: 40}}>
                <Figure k="People paid" v={String(c.peoplePaid)} />
                <Figure k="Payments" v={String(c.paymentCount)} />
                <Figure k="Paid out" v={usdt(c.totalStable)} />
                {biggest ? (
                  <Figure
                    k={`Delivered in ${biggest.symbol}`}
                    v={unitsFromRaw(biggest.units, biggest.decimals)}
                  />
                ) : (
                  <div style={{display: "flex"}} />
                )}
              </div>

              <div style={{display: "flex", fontSize: 20, color: OG.faint, marginTop: 40}}>
                {"Every payment carries the reason it was made \u00b7 X Layer"}
              </div>
            </div>
          ) : (
            <div style={{display: "flex", fontSize: 32, color: OG.muted, marginTop: 28, lineHeight: 1.3}}>
              This address has not paid anyone in ownership through Warrant yet.
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
