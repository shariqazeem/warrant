import {MARK_LEVEL, MARK_VESTED, MARK_VESTING} from "./mark-geometry";

/**
 * THE W'S THREE SHAPES, in its 100 x 100 box: the vesting V (an outline, drawn evenodd), how
 * far it has filled (the accent), and the vested V in front.
 *
 * A plain function returning the elements, not a component, and plain attributes with no class
 * names: next/og draws an <svg>'s children only when they are elements it can read directly
 * (a component inside one rendered nothing on the favicon). Call it as {markPaths(ink, accent)}.
 */
export function markPaths(ink: string, accent: string) {
  return [
    <path key="vesting" d={MARK_VESTING} fill={ink} fillRule="evenodd" />,
    <path key="level" d={MARK_LEVEL} fill={accent} />,
    <path key="vested" d={MARK_VESTED} fill={ink} />,
  ];
}
