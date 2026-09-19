/**
 * THE MARK. A warrant is a document that entitles the holder to something, and it is
 * countersigned and sealed — so the mark is a sheet with its corner turned down and a seal
 * pressed over the edge.
 *
 * Drawn in stroke on `currentColor`, in the same line register as the Lucide icons beside
 * it, so the rail, the nav and a receipt header each tint it from their own text colour.
 * That is why there is no fill and no hard-coded colour anywhere in this file.
 *
 * Deliberately NOT Scrip's stub glyph. Same design system, different company.
 */
export function WarrantMark({size = 20, className}: {size?: number; className?: string}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* the sheet, with the corner turned down */}
      <path d="M5 3h9l5 5v8" />
      <path d="M5 3v16h6" />
      <path d="M14 3v5h5" />
      {/* the entitlement, ruled */}
      <path d="M8.5 12h6" />
      {/* the seal, pressed over the edge */}
      <circle cx="16" cy="18" r="3.25" />
    </svg>
  );
}
