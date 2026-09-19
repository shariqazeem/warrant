"use client";

import { Printer } from "lucide-react";

/** A statement or a receipt you can hold. */
export function PrintButton() {
  return (
    <button type="button" className="wa-action" onClick={() => window.print()}>
      <Printer size={14} strokeWidth={2} aria-hidden /> Print
    </button>
  );
}
