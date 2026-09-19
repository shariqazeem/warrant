/**
 * THE ONE SCRIP MARK — a pay stub: a sheet with a perforated edge and two ruled lines,
 * drawn in the same line register as the lucide icons beside it.
 *
 * Stroke-on-currentColor, not an image: the rail, the landing nav, the receipt header and
 * the docs all tint it from their own text colour.
 */
export function ScripMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", display: "block" }}
    >
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      {/* the perforation */}
      <path d="M8.25 5v14" strokeDasharray="1.4 2.1" />
      {/* two ruled lines: the amount and the units */}
      <path d="M11.5 9.75h5.25" />
      <path d="M11.5 14.25h3.25" />
    </svg>
  );
}
