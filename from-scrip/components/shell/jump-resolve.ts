/**
 * ⌘K RESOLUTION — what a typed string opens, decided from its SHAPE in the browser. Nothing
 * is looked up until the page opens, so a wrong guess is an honest "not found" on the page
 * it reached, never a fabricated match. Every page listed here exists; a test reads the
 * filesystem to say so.
 */
export const JUMP_PAGES: ReadonlyArray<readonly [href: string, name: string, what: string]> = [
  ["/app", "Home", "your register, live"],
  ["/app/rule", "Rule", "how much of every payment becomes stock"],
  ["/app/holdings", "Holdings", "what the rule bought, held or not"],
  ["/app/receipts", "Receipts", "every stub, one per arrival"],
  ["/app/statements", "Statements", "a month, as a document that prints"],
  ["/app/settings", "Settings", "allowance, float, the public page, Telegram"],
  ["/app/org", "Pay in stock", "one person, a whole team, a grant that vests"],
  ["/app/org/pay", "Pay one person", "a handle, an amount, a reason"],
  ["/app/org/runs", "Runs", "a payroll run is one file and one signature"],
  ["/app/org/grants", "Grants", "vesting from an escrow the payer cannot spend"],
  ["/floor", "The floor", "every stub as it prints, the world over"],
  ["/ledger", "Ledger", "everything that has settled"],
  ["/keepers", "Keepers", "who runs the sweeps, and how to"],
  ["/assets", "Assets", "what a rule can buy, issuer powers on every row"],
  ["/security", "Security", "what a stranger can check"],
  ["/bounties", "Bounties", "paid in stock, on Scrip's own page"],
  ["/docs", "Docs", "how it works, in six pages"],
  ["/changelog", "Changelog", "what changed, with signatures"],
];

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** A path, or null when the text has no shape Scrip knows. */
export function resolveJump(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("/")) return s;
  if (s.startsWith("@")) {
    const slug = s.slice(1).toLowerCase().replace(/[^a-z0-9]/g, "");
    return slug ? `/@${slug}` : null;
  }
  if (/^[0-9a-f]{32}$/i.test(s)) return `/run/${s.toLowerCase()}`;
  if (BASE58.test(s) && s.length >= 86 && s.length <= 88) return `/receipt/${s}`;
  if (BASE58.test(s) && s.length >= 32 && s.length <= 44) return `/grant/${s}`;
  if (/^[a-z0-9]{3,20}$/i.test(s)) {
    const page = JUMP_PAGES.find(([, name]) => name.toLowerCase() === s.toLowerCase());
    return page ? page[0] : `/@${s.toLowerCase()}`;
  }
  return null;
}

/** The one-line answer to "what would that open". */
export function whatJumpOpens(href: string): string {
  if (href.startsWith("/m/")) return "a moment, with the receipt that crossed it";
  if (href.startsWith("/@")) return "a person's or an organisation's page";
  if (href.startsWith("/receipt/")) return "a receipt, read from the chain";
  if (href.startsWith("/run/")) return "a payroll run, every line a receipt";
  if (href.startsWith("/grant/")) return "a grant, and what has vested";
  return "a page";
}
