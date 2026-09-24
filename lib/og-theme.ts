/**
 * The token values a share card needs, in Warrant's palette.
 *
 * next/og renders without a stylesheet, so these cannot come from styles/tokens.css the
 * way every other colour in the product does. They are copied here ONCE, and every card
 * reads them from here: one copy to keep in step with the token contract, not one per card.
 * `lib/og-theme.test.ts` holds each value to the same name in styles/tokens.css.
 *
 * The first eight keys are the roles older cards were written against (a sheet on a ground,
 * text, rules, a settled mark, one accent); they now carry the vault palette, so every card
 * changed with them. Certificates use the named materials below.
 */
export const OG = {
  /** Body text: --ink. */
  ink: "#0F1A15",
  /** The ground a sheet sits on: --canvas. */
  paper: "#EEF2EE",
  /** A plain sheet, like a payslip: --surface. */
  sheet: "#FFFFFF",
  /** Secondary text: --muted. */
  muted: "#45544C",
  /** Tertiary text; the palette has no fainter pair that passes, so it is --muted too. */
  faint: "#45544C",
  /** A rule: --rule. */
  line: "#C5D0CA",
  /** Success: --settled. */
  ok: "#0F7A4F",
  /** The one accent a card may carry: --vault. There is no blue. */
  accent: "#0B2A21",

  vault: "#0B2A21",
  vaultLine: "#24493B",
  onVault: "#F2ECDC",
  onVault2: "#C9D3CC",
  bond: "#F2ECDC",
  engrave: "#173B2F",
  mutedBond: "#4A5E54",
  seal: "#8C1D1D",
  foil: "#B38B3E",
} as const;

export const OG_SIZE = {width: 1200, height: 630} as const;
export const OG_TYPE = "image/png" as const;
