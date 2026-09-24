import "./brand.css";

/**
 * THE MARK. A warrant is a document that grants a right, and it is sealed: a sheet with its
 * corner folded, one ruled line of entitlement, and an oxblood seal pressed over the edge.
 *
 * The sheet is stroked on `currentColor`, so the nav and the footer tint it from their own
 * text colour. The seal is always oxblood, ringed in the vault's light text colour so it
 * cuts cleanly across the sheet's lines. Colours come from tokens, through brand.css.
 */
export function WarrantMark({size = 28, className}: {size?: number; className?: string}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      className={className ? `wa-mark ${className}` : "wa-mark"}
      aria-hidden
      focusable="false"
    >
      <g className="wa-mark-sheet">
        {/* the sheet, with its corner folded */}
        <path d="M6 3 H18 L24 9 V19" />
        <path d="M6 3 V27 H16" />
        <path d="M18 3 V9 H24" />
        {/* the right it grants, ruled */}
        <path d="M10 13 H19" />
      </g>
      {/* the seal, pressed over the edge */}
      <circle className="wa-mark-seal" cx="22" cy="24" r="5.5" />
    </svg>
  );
}
