import {ImageResponse} from "next/og";
import {readOpenedGrants} from "@/lib/company";
import {humanDuration} from "@/lib/schedule";
import {short, unitsFromRaw, usdt} from "@/lib/format";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";

/**
 * THE FRONT PAGE'S CARD: a certificate on bond paper, what a link to warrant.world unfurls
 * into on X, LinkedIn or a chat.
 *
 * REAL DATA ONLY. When a grant exists, the card carries the newest one's number and terms as
 * its opening recorded them on X Layer, read from the record without a network call, so a
 * crawler is never kept waiting. Before any grant exists it carries the one line and nothing
 * else: no sample number, no sample stock.
 */
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Warrant: give your team stock that vests";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

/** The palette, from the one copy every card reads (lib/og-theme.ts). */
const CARD = OG;

export default async function Image() {
  let newest: ReturnType<typeof readOpenedGrants>[number] | undefined;
  try {
    newest = readOpenedGrants({}, 1)[0];
  } catch {
    // A card is not worth a failed unfurl; without the record it carries the line alone.
    newest = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CARD.vault,
          padding: 28,
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            background: CARD.bond,
            padding: 14,
            borderRadius: 3,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              border: `1.5px solid ${CARD.engrave}`,
              padding: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                border: `1px solid ${CARD.engrave}`,
                padding: "40px 52px",
                color: CARD.engrave,
              }}
            >
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <div style={{display: "flex", alignItems: "center"}}>
                  <svg width="44" height="44" viewBox="0 0 30 30">
                    <g fill="none" stroke={CARD.engrave} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3 H18 L24 9 V19" />
                      <path d="M6 3 V27 H16" />
                      <path d="M18 3 V9 H24" />
                      <path d="M10 13 H19" />
                    </g>
                    <circle cx="22" cy="24" r="5.5" fill={CARD.seal} stroke={CARD.bond} strokeWidth="1.4" />
                  </svg>
                  <div style={{display: "flex", fontSize: 36, marginLeft: 14, letterSpacing: -0.5}}>Warrant</div>
                </div>
                <div style={{display: "flex", fontSize: 24, color: CARD.mutedBond, fontFamily: "sans-serif"}}>
                  warrant.world
                </div>
              </div>

              {newest ? (
                <div style={{display: "flex", justifyContent: "space-between", marginTop: 40, fontSize: 22, letterSpacing: 4}}>
                  <div style={{display: "flex"}}>CERTIFICATE OF GRANT</div>
                  <div style={{display: "flex", letterSpacing: 0}}>No. {String(newest.id).padStart(6, "0")}</div>
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  fontSize: newest ? 70 : 88,
                  marginTop: newest ? 18 : 64,
                  letterSpacing: -2,
                  lineHeight: 1.02,
                  maxWidth: 1000,
                }}
              >
                Give your team stock that vests.
              </div>

              {newest ? (
                <div
                  style={{
                    display: "flex",
                    fontSize: 27,
                    marginTop: 24,
                    lineHeight: 1.4,
                    color: CARD.mutedBond,
                    fontFamily: "sans-serif",
                    maxWidth: 1000,
                  }}
                >
                  {`${unitsFromRaw(newest.units, newest.assetDecimals)} ${newest.assetSymbol} granted to ` +
                    `${short(newest.beneficiary)}, bought for ${usdt(newest.stableCost)} USDT through OKX DEX, ` +
                    `vesting over ${humanDuration(newest.durationSeconds)}.`}
                </div>
              ) : null}

              <div style={{display: "flex", flex: 1}} />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${CARD.engrave}`,
                  paddingTop: 18,
                  fontSize: 22,
                  fontFamily: "sans-serif",
                  color: CARD.mutedBond,
                }}
              >
                <div style={{display: "flex"}}>Stock grants that vest every second, on X Layer</div>
                <div style={{display: "flex"}}>Bought through OKX DEX</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
