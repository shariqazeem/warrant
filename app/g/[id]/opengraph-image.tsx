import {ImageResponse} from "next/og";
import {certNumber, purchaseLine, routeLine, scheduleLine, sealState, SEAL_WORDS, unitsText, whenLabel} from "@/components/cert/cert-text";
import {tickPositions} from "@/components/cert/vesting-rule";
import {xLayer} from "@/lib/chain";
import {certificateSeed, guilloche, LANDSCAPE, SEAL_EDGE, sealEdge} from "@/lib/guilloche";
import {parseGrantId} from "@/lib/grants";
import {ogFonts} from "@/lib/og-fonts";
import {OG_CERT as C, OG_SIZE, OG_TYPE} from "@/lib/og-theme";
import {vestedShares} from "@/lib/vesting";
import {readCertificate} from "./read";

/**
 * THE SHARE CARD IS THE CERTIFICATE: the same engraving from the same seed, the same fields
 * from the same read of the chain, the same seal — drawn by Satori at 1200×630 on the vault.
 * No animation and no ticking figure: a picture of a moment says only what stays true.
 * A card that cannot show a grant says why, in words.
 */
export const runtime = "nodejs";
export const alt = "A certificate of grant: stock that vests every second, on X Layer";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

const S = 1.22; // the certificate, scaled to sit on the card
const W = LANDSCAPE.W * S;
const H = LANDSCAPE.H * S;
const px = (n: number) => Math.round(n * S * 10) / 10;

const DISPLAY = "Bodoni Moda";
const UI = "Hanken Grotesk";
const MONO = "JetBrains Mono";

/** The card's faces; with none (the fetch failed), next/og's own default face draws it. */
async function withFonts() {
  const fonts = await ogFonts();
  return fonts.length > 0 ? {...size, fonts} : {...size};
}

async function inWords(title: string, body: string) {
  return new ImageResponse(
    (
      <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: C.vault, padding: 72}}>
        <div style={{display: "flex", fontFamily: DISPLAY, fontSize: 56, color: C.onVault}}>{title}</div>
        <div style={{display: "flex", fontFamily: UI, fontSize: 26, color: C.onVault2, marginTop: 20, maxWidth: 960}}>{body}</div>
      </div>
    ),
    await withFonts(),
  );
}

export default async function Image({params}: {params: {id: string} | Promise<{id: string}>}) {
  const {id: raw} = await Promise.resolve(params);
  const id = parseGrantId(raw);
  if (id === null) return inWords("Warrant", "A certificate's address is its number, counting from 1.");

  const found = await readCertificate(id);
  if (!found.ok) return inWords("Warrant", found.why);
  if (found.value === null) return inWords("Warrant", `There is no grant ${id}.`);

  const d = found.value.data;
  const now = Math.floor(Date.now() / 1000);
  const no = certNumber(d.id);
  const g = guilloche(
    certificateSeed(xLayer.id, found.value.escrow, d.id),
    LANDSCAPE.W,
    LANDSCAPE.H,
    LANDSCAPE.rx,
    LANDSCAPE.ry,
    LANDSCAPE.rr,
    false,
  );
  const seal = sealState(d, {now});
  const route = routeLine(d.route);
  const [c, R, a, N] = SEAL_EDGE[118];

  // The rule at this moment: vested hatched, released solid, the cliff in oxblood.
  const whole = d.openedShares ?? d.shares ?? 0n;
  const frac = (v: bigint) => (whole > 0n ? Number((v * 10_000n) / whole) / 10_000 : 0);
  const terms = {
    shares: d.shares ?? 0n,
    sharesReleased: d.sharesReleased ?? 0n,
    start: d.start,
    cliffSeconds: d.cliffSeconds,
    durationSeconds: d.durationSeconds,
    revoked: d.revoked,
    frozenVestedShares: d.frozenVestedShares ?? 0n,
  };
  const vested = frac(vestedShares(terms, now));
  const released = d.closed ? 1 : frac(terms.sharesReleased);
  const ruleW = 760 - 66 * 2 - 132; // the rule's width in certificate units
  const cliffAt = d.durationSeconds > 0 ? d.cliffSeconds / d.durationSeconds : 0;
  const hasCliff = d.cliffSeconds > 0 && d.cliffSeconds < d.durationSeconds;
  const ticks = tickPositions(d.start, d.durationSeconds);

  const muted = {fontFamily: UI, fontSize: px(13.5), color: C.mutedBond, lineHeight: 1.45};
  const kicker = {fontFamily: DISPLAY, fontStyle: "italic" as const, fontSize: px(17), color: C.mutedBond};

  return new ImageResponse(
    (
      <div style={{width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.vault}}>
        <div style={{position: "relative", display: "flex", width: W, height: H, background: C.bond, borderRadius: 3}}>
          <svg width={W} height={H} viewBox={`0 0 ${LANDSCAPE.W} ${LANDSCAPE.H}`} style={{position: "absolute", left: 0, top: 0}}>
            <rect x={10} y={10} width={740} height={448} fill="none" stroke={C.engrave} strokeWidth={1} />
            <rect x={44} y={44} width={672} height={380} fill="none" stroke={C.engrave} strokeWidth={0.6} />
            <path d={g.rosette} fill="none" stroke={C.engrave} strokeWidth={0.5} opacity={0.17} />
            <path d={g.waves} fill="none" stroke={C.engrave} strokeWidth={0.55} opacity={0.8} />
            <path d={g.corners} fill="none" stroke={C.engrave} strokeWidth={0.6} opacity={0.85} />
          </svg>

          <div
            style={{
              position: "absolute",
              left: px(66),
              right: px(66),
              top: px(62),
              bottom: px(58),
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              color: C.engrave,
            }}
          >
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
              <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: px(12.5), letterSpacing: px(2.2)}}>
                CERTIFICATE OF GRANT
              </div>
              <div style={{display: "flex", fontFamily: DISPLAY, fontSize: px(17)}}>{`No. ${no}`}</div>
            </div>

            <div style={{display: "flex", flexDirection: "column"}}>
              <div style={{display: "flex", ...kicker}}>This certifies that</div>
              <div style={{display: "flex", fontFamily: MONO, fontSize: px(15), marginTop: px(4)}}>{d.recipient ?? ""}</div>
              <div style={{display: "flex", ...kicker, marginTop: px(4)}}>is granted</div>
              <div style={{display: "flex", alignItems: "baseline", marginTop: px(2)}}>
                <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: px(66), lineHeight: 1}}>{unitsText(d)}</div>
                <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 500, fontSize: px(26), marginLeft: px(12)}}>
                  {d.asset.symbol}
                </div>
              </div>
              <div style={{display: "flex", ...muted, marginTop: px(8)}}>{purchaseLine(d)}</div>
              {/* In the mono face, which carries ₮ and the arrows. */}
              {route ? <div style={{display: "flex", ...muted, fontFamily: MONO, fontSize: px(11.5)}}>{route}</div> : null}
              <div style={{display: "flex", ...muted}}>{scheduleLine(d)}</div>
            </div>

            <div style={{display: "flex", flexDirection: "column", width: px(ruleW)}}>
              <svg width={px(ruleW)} height={px(20)} viewBox={`0 -3 ${ruleW} 20`}>
                <defs>
                  <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="1" height="4" fill={C.engrave} />
                  </pattern>
                </defs>
                <line x1={0} y1={7} x2={ruleW} y2={7} stroke={C.engrave} strokeWidth={1} />
                {ticks.map((t) => (
                  <line key={t} x1={(t / 100) * ruleW} y1={3} x2={(t / 100) * ruleW} y2={12} stroke={C.engrave} strokeOpacity={0.5} strokeWidth={1} />
                ))}
                <rect x={0} y={2} width={Math.max(0, Math.min(1, vested)) * ruleW} height={10} fill="url(#hatch)" />
                <rect x={0} y={5} width={Math.max(0, Math.min(1, released)) * ruleW} height={5} fill={C.engrave} />
                {hasCliff ? <line x1={cliffAt * ruleW} y1={-3} x2={cliffAt * ruleW} y2={17} stroke={C.seal} strokeWidth={1.5} /> : null}
              </svg>
              <div style={{display: "flex", justifyContent: "space-between", fontFamily: UI, fontSize: px(12), color: C.mutedBond, marginTop: px(4)}}>
                <div style={{display: "flex"}}>{whenLabel(d.start, d.durationSeconds)}</div>
                <div style={{display: "flex"}}>{whenLabel(d.start + d.durationSeconds, d.durationSeconds)}</div>
              </div>
            </div>

            <div style={{display: "flex", fontFamily: UI, fontSize: px(12), color: C.mutedBond, width: px(ruleW)}}>
              <div style={{display: "flex"}}>Granted by</div>
              <div style={{display: "flex", fontFamily: MONO, color: C.engrave, marginLeft: px(5)}}>
                {d.grantor ? `${d.grantor.slice(0, 6)}…${d.grantor.slice(-4)}` : ""}
              </div>
              <div style={{display: "flex", marginLeft: px(26)}}>{d.tx ? "Recorded on X Layer in" : "Recorded on X Layer as grant"}</div>
              <div style={{display: "flex", fontFamily: MONO, color: C.engrave, marginLeft: px(5)}}>
                {d.tx ? `${d.tx.slice(0, 6)}…${d.tx.slice(-4)}` : String(d.id)}
              </div>
            </div>
          </div>

          <div style={{position: "absolute", right: px(30), bottom: px(24), width: px(118), height: px(118), display: "flex"}}>
            {seal === "sealed" ? (
              <svg width={px(118)} height={px(118)} viewBox="0 0 118 118" style={{position: "absolute", left: 0, top: 0}}>
                <path d={sealEdge(c, R, a, N)} fill={C.seal} />
                <circle cx={59} cy={59} r={52} fill="none" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1} />
                <circle cx={59} cy={59} r={45} fill="none" stroke={C.bond} strokeOpacity={0.6} strokeWidth={1} />
                <circle cx={59} cy={59} r={41} fill="none" stroke={C.bond} strokeOpacity={0.35} strokeWidth={0.6} />
                <g transform="translate(59 49)" fill="none" stroke={C.bond} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M-10 -13 H4 L10 -7 V13 H-10 Z" />
                  <path d="M4 -13 V-7 H10" />
                  <path d="M-5 -1 H5" />
                  <path d="M-5 4 H2" />
                </g>
              </svg>
            ) : (
              <svg width={px(118)} height={px(118)} viewBox="0 0 118 118" style={{position: "absolute", left: 0, top: 0}}>
                <circle cx={59} cy={59} r={50} fill="none" stroke={C.engrave} strokeWidth={1.2} strokeDasharray="3 4" />
                <circle cx={59} cy={59} r={42} fill="none" stroke={C.engrave} strokeOpacity={0.6} strokeWidth={0.6} />
              </svg>
            )}
            {seal === "sealed" ? (
              <div style={{position: "absolute", left: 0, right: 0, top: px(72), display: "flex", flexDirection: "column", alignItems: "center"}}>
                <div style={{display: "flex", fontFamily: UI, fontWeight: 600, fontSize: px(7.5), letterSpacing: px(1.5), color: C.bond}}>IRREVOCABLE</div>
                <div style={{display: "flex", fontFamily: DISPLAY, fontSize: px(8.5), color: C.bond, opacity: 0.85, marginTop: px(1)}}>{`No. ${no}`}</div>
              </div>
            ) : (
              <div style={{position: "absolute", left: 0, right: 0, top: px(44), display: "flex", flexDirection: "column", alignItems: "center"}}>
                <div style={{display: "flex", fontFamily: DISPLAY, fontStyle: "italic", fontSize: px(13), color: C.engrave}}>
                  {SEAL_WORDS[seal].a}
                </div>
                <div style={{display: "flex", fontFamily: UI, fontSize: px(9), color: C.mutedBond, marginTop: px(2)}}>{SEAL_WORDS[seal].b}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    await withFonts(),
  );
}
