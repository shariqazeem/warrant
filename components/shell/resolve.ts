/**
 * WHAT A TYPED STRING IS, AND WHERE IT GOES.
 *
 * Pure, so it can be tested without a browser. The shapes are unambiguous on this chain:
 * a 32-byte hash is a transaction, a 20-byte one is an address, a short number is a
 * certificate, and a run id is a name somebody chose. Nothing here guesses — a string that
 * is not one of those resolves to the doors, not to a half-matched address that would send
 * a grant to the wrong person.
 */
import {DOORS} from "../site/doors";

export type Destination = {
  kind: "receipt" | "company" | "certificate" | "run" | "page";
  href: string;
  label: string;
  hint: string;
};

/** The nav's four doors, in the nav's order, each said as the thing you came to do. */
const PAGES: Destination[] = DOORS.map((d) => ({kind: "page", href: d.href, label: d.jump, hint: d.hint}));

/** bytes32, left-aligned ASCII with zero padding — how a run id is written. */
function runIdFromName(name: string): string {
  const hex = Array.from(name)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex.padEnd(64, "0")}`;
}

export function resolve(raw: string): Destination[] {
  const q = raw.trim();
  if (q === "") return PAGES;

  const hex = q.startsWith("0x") || q.startsWith("0X") ? q : `0x${q}`;

  if (/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    // 32 bytes is a transaction hash, and also the width of a run id. Offer both, the
    // likelier first — somebody pasting 64 hex characters has copied a transaction.
    return [
      {kind: "receipt", href: `/receipt/${hex}`, label: "Open this transaction", hint: "What it paid or granted, and why"},
      {kind: "run", href: `/run/${hex}`, label: "Open this payroll run", hint: "Everyone paid under this id"},
    ];
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(hex)) {
    return [
      {kind: "company", href: `/@${hex}`, label: "Open this wallet's record", hint: "What it has granted and paid, with reasons"},
    ];
  }

  // A certificate number as it is engraved: "000042", "No. 42", "#42".
  const cert = /^(?:no\.?\s*|#)?(\d{1,6})$/i.exec(q);
  const certN = cert ? Number(cert[1]) : 0;

  // A run people say out loud: "run-260919-143205-k3f9".
  if (/^[\x20-\x7e]{1,32}$/.test(q) && /[a-zA-Z0-9]/.test(q)) {
    const matches = PAGES.filter(
      (p) => p.label.toLowerCase().includes(q.toLowerCase()) || p.href.includes(q.toLowerCase()),
    );
    return [
      ...(certN > 0
        ? [{kind: "certificate" as const, href: `/g/${certN}`, label: `Open certificate No. ${String(certN).padStart(6, "0")}`, hint: "A grant, vesting"}]
        : []),
      {kind: "run", href: `/run/${runIdFromName(q)}`, label: `Open the payroll run “${q}”`, hint: "By the name it was given"},
      ...matches,
    ];
  }

  return PAGES;
}
