import {MARK_LEVEL, MARK_VESTED, MARK_VESTING, MARK_VIEWBOX} from "./mark-geometry";
import "./brand.css";

/**
 * THE MARK: the W that vests. A Bodoni W is two Vs; in Warrant's the first is solid (what has
 * vested, theirs for good) and the second is engraved as an outline still filling from the
 * bottom (what is vesting, every second). Drawn from components/brand/mark-geometry.ts, which
 * ~/projects/warrant-brand/mark.py generates, so the site, the X profile and the films match.
 *
 * The W takes `currentColor`, so the nav and the footer tint it from their own text colour.
 * The fill is the one accent: foil on the vault, the seal's oxblood on a light ground.
 */
export function WarrantMark({size = 28, className}: {size?: number; className?: string}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      className={className ? `wa-mark ${className}` : "wa-mark"}
      aria-hidden
      focusable="false"
    >
      <path d={MARK_VESTING} fill="currentColor" fillRule="evenodd" />
      <path d={MARK_LEVEL} className="wa-mark-level" />
      <path d={MARK_VESTED} fill="currentColor" />
    </svg>
  );
}
