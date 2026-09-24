import {SEAL_EDGE, sealEdge} from "@/lib/guilloche";
import {SEAL_WORDS, type SealState} from "./cert-text";

/**
 * THE SEAL, in both of its lives.
 *
 * Unsealed, it is a dashed outline that says what is still possible: "Revocable, until
 * sealed" (or "To be sealed, after issuing" on a specimen the grantor chose to seal).
 * Sealed, it is oxblood with a scalloped edge, carrying the Warrant mark, "IRREVOCABLE" and
 * the certificate's number — drawn only when the escrow says `isSealed`, so the seal on a
 * certificate is a fact about the chain, not a design choice.
 *
 * Two sizes, as the design draws them: 118 on the landscape certificate, 96 on the portrait.
 * Colours come in as a palette so the share card (which has no stylesheet) can draw the
 * same seal with literal values; on a page they are the tokens.
 */
export type SealPalette = {seal: string; bond: string; engrave: string; muted: string; ring: string; ringSoft: string; ringFaint: string};

export const SEAL_TOKENS: SealPalette = {
  seal: "var(--seal)",
  bond: "var(--bond)",
  engrave: "var(--engrave)",
  muted: "var(--muted-bond)",
  ring: "color-mix(in srgb, var(--bond) 60%, transparent)",
  ringSoft: "color-mix(in srgb, var(--bond) 35%, transparent)",
  ringFaint: "color-mix(in srgb, var(--surface) 16%, transparent)",
};

/** The Warrant mark as the seal carries it: a sheet with its corner turned, ruled twice. */
function Mark({size, stroke}: {size: 118 | 96; stroke: string}) {
  const big = size === 118;
  return (
    <g
      transform={big ? "translate(59 49)" : "translate(48 40)"}
      style={{fill: "none", stroke, strokeWidth: big ? 1.4 : 1.3, strokeLinecap: "round", strokeLinejoin: "round"}}
    >
      {big ? (
        <>
          <path d="M-10 -13 H4 L10 -7 V13 H-10 Z" />
          <path d="M4 -13 V-7 H10" />
          <path d="M-5 -1 H5" />
          <path d="M-5 4 H2" />
        </>
      ) : (
        <>
          <path d="M-8 -10.5 H3 L8 -5.5 V10.5 H-8 Z" />
          <path d="M3 -10.5 V-5.5 H8" />
          <path d="M-4 -1 H4" />
          <path d="M-4 3.5 H1.5" />
        </>
      )}
    </g>
  );
}

/** The pressed seal: oxblood, scalloped, the mark, IRREVOCABLE and the number. */
export function SealedSvg({size, no, palette = SEAL_TOKENS, withText = true}: {size: 118 | 96; no: string; palette?: SealPalette; withText?: boolean}) {
  const [c, R, a, N] = SEAL_EDGE[size];
  const big = size === 118;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={`Sealed and irrevocable, certificate No. ${no}`}
      className="wa-seal-svg"
    >
      <path d={sealEdge(c, R, a, N)} style={{fill: palette.seal}} />
      <circle cx={c} cy={c} r={big ? 52 : 42} style={{fill: "none", stroke: palette.ringFaint, strokeWidth: 1}} />
      <circle cx={c} cy={c} r={big ? 45 : 36} style={{fill: "none", stroke: palette.ring, strokeWidth: 1}} />
      <circle cx={c} cy={c} r={big ? 41 : 32.5} style={{fill: "none", stroke: palette.ringSoft, strokeWidth: 0.6}} />
      <Mark size={size} stroke={palette.bond} />
      {withText ? (
        <>
          <text
            x={c}
            y={big ? 79 : 65}
            className="wa-seal-word"
            style={{fontSize: big ? 7.5 : 6.5, fontWeight: 700, letterSpacing: "0.2em", fill: palette.bond, textAnchor: "middle"}}
          >
            IRREVOCABLE
          </text>
          <text
            x={c}
            y={big ? 90 : 75}
            className="wa-seal-no"
            style={{fontSize: big ? 8.5 : 7, fill: palette.ring, textAnchor: "middle"}}
          >
            {`No. ${no}`}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** The outline an unsealed certificate carries where its seal will go. */
export function OutlineSvg({state, palette = SEAL_TOKENS, withText = true}: {state: Exclude<SealState, "sealed">; palette?: SealPalette; withText?: boolean}) {
  const words = SEAL_WORDS[state];
  return (
    <svg viewBox="0 0 118 118" width="100%" height="100%" role="img" aria-label={words.label} className="wa-seal-svg">
      <circle cx={59} cy={59} r={50} style={{fill: "none", stroke: palette.engrave, strokeWidth: 1.2, strokeDasharray: "3 4"}} />
      <circle cx={59} cy={59} r={42} style={{fill: "none", stroke: palette.engrave, strokeWidth: 0.6, opacity: 0.6}} />
      {withText ? (
        <>
          <text
            x={59}
            y={57}
            className="wa-seal-outline-a"
            style={{fontSize: state === "vested" || state === "pending" ? 12 : 13.5, fontStyle: "italic", fill: palette.engrave, textAnchor: "middle"}}
          >
            {words.a}
          </text>
          <text x={59} y={73} className="wa-seal-outline-b" style={{fontSize: 9, fill: palette.muted, textAnchor: "middle"}}>
            {words.b}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/**
 * The seal as a certificate places it. `press` plays the landing — only ever passed when the
 * chain has just confirmed the seal, never on the promise of one.
 */
export function Seal({size, state, no, press = false}: {size: 118 | 96; state: SealState; no: string; press?: boolean}) {
  const sealed = state === "sealed";
  return (
    <div className={`wa-seal is-${size}${sealed ? " is-sealed" : " is-outline"}${press && sealed ? " is-pressing" : ""}`}>
      {press && sealed ? <span className="wa-seal-ripple" aria-hidden /> : null}
      <div className="wa-seal-body">
        {sealed ? <SealedSvg size={size} no={no} /> : <OutlineSvg state={state} />}
      </div>
    </div>
  );
}
