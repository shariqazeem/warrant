import {WarrantMark} from "./warrant-mark";

/**
 * THE WORDMARK — Warrant, set in Fraunces at a heavy optical size, tight: the engraver's
 * serif of a certificate. Fraunces appears in exactly two places, here and on the title
 * line of a receipt; nowhere else.
 */
export function Wordmark({size = 22, withMark = true}: {size?: number; withMark?: boolean}) {
  return (
    <span style={{display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.4)}}>
      {withMark ? <WarrantMark size={size} /> : null}
      <span className="wa-wordmark" style={{fontSize: size * 1.05}}>
        Warrant
      </span>
    </span>
  );
}
