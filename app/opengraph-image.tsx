import {ImageResponse} from "next/og";
import {readRail} from "@/lib/company";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";

/**
 * THE FRONT DOOR'S CARD. What a link to warrant.world unfurls into, on X, LinkedIn or a chat.
 *
 * Without it the launch link unfurled into nothing at all, and every page without a card of
 * its own (pay, run, grants) did the same. The only figure on it is the number of people
 * paid, and only once the indexer has copied real payments from the chain: before that the
 * card makes no count at all, because "0 paid" would read as a claim.
 */
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Warrant: get paid in stocks";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image() {
  const rail = readRail(1);
  const people = rail.ok ? rail.value.peoplePaid : 0;
  const proof =
    people > 0
      ? `${people} ${people === 1 ? "person" : "people"} paid so far · live on X Layer mainnet`
      : "Live on X Layer mainnet";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: OG.paper,
          padding: "56px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
          <div style={{display: "flex", alignItems: "center"}}>
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke={OG.accent}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 3h9l5 5v8" />
              <path d="M5 3v16h6" />
              <path d="M14 3v5h5" />
              <path d="M8.5 12h6" />
              <circle cx="16" cy="18" r="3.25" />
            </svg>
            <div style={{display: "flex", fontSize: 34, color: OG.ink, marginLeft: 14, letterSpacing: -0.5}}>
              Warrant
            </div>
          </div>
          <div style={{display: "flex", fontSize: 24, color: OG.faint}}>warrant.world</div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 84,
            color: OG.ink,
            marginTop: 52,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          Get paid in stocks.
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: OG.muted,
            marginTop: 28,
            lineHeight: 1.35,
            maxWidth: 980,
          }}
        >
          Choose how much of every payment becomes stock, and which one. Whoever pays you, you get
          your split in your own wallet, with a receipt.
        </div>

        <div style={{display: "flex", flex: 1}} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${OG.accent}`,
            paddingTop: 22,
            fontSize: 24,
          }}
        >
          <div style={{display: "flex", color: OG.ink}}>Your split, whoever pays you</div>
          <div style={{display: "flex", color: OG.muted}}>{proof}</div>
        </div>
      </div>
    ),
    size,
  );
}
