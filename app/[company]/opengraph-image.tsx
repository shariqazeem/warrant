import {ImageResponse} from "next/og";
import {payHeading, theyGet} from "@/components/link/pay-link";
import {linkFacts, type LinkFacts} from "@/components/link/read-link";
import type {StoredChoice} from "@/lib/choice";
import {readCompany} from "@/lib/company";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";
import {ogOptions} from "@/lib/og-fonts";
import {DISPLAY, UI} from "@/components/cert/cert-card";
import {dateUTC, short, unitsFromRaw, usdt} from "@/lib/format";
import {siteUrl} from "@/lib/site";

/**
 * AN ADDRESS'S CARD, of the page it stands for. The page and this card decide what the
 * page is by one rule (components/link/pay-link.ts, pageKind), so a card never advertises
 * a page that is not there.
 *
 * A PAY LINK'S CARD, for someone who has chosen how they are paid or has been paid before:
 * "Pay 0x…", their choice in words, and where to do it. Its only figures are what their
 * signed choice and the stored receipts say — the share, the day it was signed, how many
 * payments they have received. No amount and no price.
 *
 * A COMPANY'S CARD, for everyone else: what a company shows when it says "we pay our people
 * in stock". Every figure is a sum over rows the indexer copied from the chain. A company
 * that has paid nobody gets a card that says so rather than a card with zeroes on it,
 * because a zero here would read as a claim.
 */
export const runtime = "nodejs";
export const alt = "A wallet on Warrant: the link to pay it in stock, or the record of what it has paid";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

function Figure({k, v}: {k: string; v: string}) {
  return (
    <div style={{display: "flex", flexDirection: "column", marginRight: 48}}>
      <div style={{display: "flex", fontSize: 19, color: OG.faint}}>{k}</div>
      <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: 50, color: OG.ink, marginTop: 8, letterSpacing: -1}}>
        {v}
      </div>
    </div>
  );
}

/** Whether this address's page is a pay link. A read that fails leaves the company card. */
function readFacts(address: string): LinkFacts | null {
  try {
    return linkFacts(address);
  } catch {
    return null;
  }
}

/**
 * ONE STRING PER BLOCK, AND NO AUTO MARGINS: Satori is not a browser. Several text nodes in
 * one flex child are measured badly and drawn over each other, so every line is composed
 * before it reaches a block, and the space above the foot is a flex spacer.
 */
function PayLinkCard({address, choice, timesPaid}: {address: string; choice: StoredChoice | null; timesPaid: number}) {
  const facts = [
    choice ? `Their own choice, signed ${dateUTC(choice.issuedAt)}` : null,
    timesPaid > 0 ? `${timesPaid} ${timesPaid === 1 ? "payment" : "payments"} received through Warrant` : null,
  ]
    .filter((f): f is string => f !== null)
    .map((f) => `${f}.`)
    .join(" ");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: OG.paper,
        padding: 48,
        fontFamily: UI,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: OG.sheet,
          border: `1px solid ${OG.line}`,
          borderRadius: 8,
          padding: 44,
        }}
      >
        <div style={{display: "flex", justifyContent: "space-between", fontSize: 22, color: OG.faint}}>
          <div style={{display: "flex", color: OG.accent}}>Pay link</div>
          <div style={{display: "flex"}}>Warrant</div>
        </div>

        <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 500, fontSize: 76, color: OG.ink, marginTop: 40, letterSpacing: -2, lineHeight: 1}}>
          {payHeading(address)}
        </div>

        <div style={{display: "flex", fontSize: 36, color: OG.muted, marginTop: 28, lineHeight: 1.3, maxWidth: 980}}>
          {theyGet(choice)}
        </div>

        <div style={{display: "flex", flex: 1}} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${OG.accent}`,
            paddingTop: 20,
            fontSize: 22,
          }}
        >
          <div style={{display: "flex", color: OG.ink}}>{facts}</div>
          <div style={{display: "flex", color: OG.muted}}>{new URL(siteUrl()).host}</div>
        </div>
      </div>
    </div>
  );
}

export default async function Image({params}: {params: {company: string}}) {
  const address = decodeURIComponent(params.company).replace(/^@/, "");
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address);

  const person = valid ? readFacts(address) : null;
  if (person?.kind === "pay-link") {
    return new ImageResponse(
      <PayLinkCard address={address} choice={person.choice} timesPaid={person.timesPaid} />,
      await ogOptions(size),
    );
  }

  // One receipt is enough; the totals are computed over every row regardless of this.
  const record = valid ? readCompany(address, 1) : null;
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
          fontFamily: UI,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: OG.sheet,
            border: `1px solid ${OG.line}`,
            borderRadius: 8,
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
                  ? "Pays its people in stock."
                  : `Paying people in stock since ${dateUTC(c.since)}.`}
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
                {"Every payment carries the reason it was made, on X Layer."}
              </div>
            </div>
          ) : (
            <div style={{display: "flex", fontSize: 32, color: OG.muted, marginTop: 28, lineHeight: 1.3}}>
              This wallet has not granted stock or run payroll through Warrant yet.
            </div>
          )}
        </div>
      </div>
    ),
    await ogOptions(size),
  );
}
