import {ImageResponse} from "next/og";
import {readGrantRecord} from "@/lib/grant-receipts";
import {grantStanding, parseGrantId} from "@/lib/grants";
import {short, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";

/**
 * A GRANT'S SHARE CARD — the stub at its fifth size, for the person a grant was made to.
 *
 * SAME RULES AS THE PAGE. The figures are the grant's opening, read from its transaction and
 * checked against the USDT it moved; the state is the escrow's own; the reason is shown only
 * if the stored text hashes to the one on chain. A card that cannot be built says so in
 * words rather than inventing a grant.
 */
export const runtime = "nodejs";
export const alt = "A stock position that vests on a schedule, with the reason it was granted";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

const {ink: INK, paper: PAPER, sheet: SHEET, muted: MUTED, faint: FAINT, line: LINE, ok: OK} = OG;

function Card({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: PAPER,
        padding: 48,
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

/** A card that cannot show a grant says why, in words, rather than showing a figure. */
function inWords(title: string, body: string) {
  return new ImageResponse(
    (
      <Card>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div style={{display: "flex", fontSize: 40, color: INK}}>{title}</div>
          <div style={{display: "flex", fontSize: 26, color: MUTED, marginTop: 16, maxWidth: 900}}>
            {body}
          </div>
        </div>
      </Card>
    ),
    size,
  );
}

export default async function Image({params}: {params: {id: string}}) {
  const id = parseGrantId(params.id);
  if (id === null) {
    return inWords("Not a grant", "A grant's address is its number, counting from 1.");
  }

  const found = await readGrantRecord(id);
  if (!found.ok || found.value === null) {
    return inWords("Warrant", found.ok ? `There is no grant ${id}.` : found.why);
  }

  const {grant: g, opening} = found.value;
  const o = opening.moment;
  const standing = grantStanding(g, Math.floor(Date.now() / 1000));
  const reason = g.reason ? (g.reason.length > 64 ? `${g.reason.slice(0, 64)}…` : g.reason) : null;
  const term =
    `vesting to ${short(o.beneficiary)}’s own wallet over ${humanDuration(o.durationSeconds)}` +
    (o.cliffSeconds === 0 ? "" : `, cliff after ${humanDuration(o.cliffSeconds)}`);

  return new ImageResponse(
    (
      <Card>
        {/*
          EXPLICIT SPACING, NO AUTO MARGINS. Satori is not a browser: `marginTop: auto` does
          not push a block down, it collapses, and the rows end up drawn over each other.
        */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: SHEET,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: 44,
          }}
        >
          <div style={{display: "flex", justifyContent: "space-between", fontSize: 22, color: FAINT}}>
            <div style={{display: "flex", color: OK}}>Granted on X Layer</div>
            <div style={{display: "flex"}}>Warrant</div>
          </div>

          <div style={{display: "flex", fontSize: 30, color: MUTED, marginTop: 32}}>
            {`${usdt(o.stableCost)} paid, which bought`}
          </div>

          {/* The units are the largest thing on any surface they appear on. */}
          <div style={{display: "flex", alignItems: "baseline"}}>
            <div style={{display: "flex", fontSize: 104, color: INK, letterSpacing: -4}}>
              {unitsFromRaw(o.units, g.assetDecimals)}
            </div>
            <div style={{display: "flex", fontSize: 34, color: MUTED, marginLeft: 18}}>
              {g.assetSymbol}
            </div>
          </div>

          {/* ONE STRING PER BLOCK. Satori measures a flex child with several text nodes
              badly, and the blocks then draw on top of one another. */}
          <div style={{display: "flex", fontSize: 24, color: MUTED, marginTop: 16}}>{term}</div>

          {reason ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                lineHeight: 1.25,
                color: INK,
                marginTop: 28,
                paddingTop: 24,
                borderTop: `1px solid ${LINE}`,
              }}
            >
              {`“${reason}”`}
            </div>
          ) : null}

          <div style={{display: "flex", fontSize: 18, color: FAINT, marginTop: 18}}>
            {`Grant ${id} · ${standing.label}` +
              (standing.irrevocable ? " · irrevocable" : "") +
              ` · ${short(opening.txHash)}`}
          </div>
        </div>
      </Card>
    ),
    size,
  );
}
