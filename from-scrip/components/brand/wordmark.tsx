import { ScripMark } from "./scrip-mark";

/**
 * THE WORDMARK — Scrip, set in Fraunces at a heavy optical size, tight: the engraver's
 * serif of a certificate. Fraunces appears in exactly two places, here and on the title
 * line of a statement; nowhere else. The mark beside it is the stub glyph.
 */
export function Wordmark({ size = 22, withMark = true }: { size?: number; withMark?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
      {withMark ? <ScripMark size={size} /> : null}
      <span className="sp-wordmark" style={{ fontSize: size * 1.05 }}>
        Scrip
      </span>
    </span>
  );
}
