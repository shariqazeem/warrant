/**
 * The few token values a share card needs.
 *
 * next/og renders without a stylesheet, so these cannot come from styles/tokens.css the
 * way every other colour in the product does. They are copied here ONCE, and every card
 * reads them from here — so there is one copy to keep in step with the palette rather
 * than one per card.
 */
export const OG = {
  ink: "#14161c",
  paper: "#f7f5ef",
  sheet: "#ffffff",
  muted: "#5a5d66",
  faint: "#8b8e97",
  line: "#e4dfd3",
  ok: "#15803d",
  accent: "#2b4acb",
} as const;

export const OG_SIZE = {width: 1200, height: 630} as const;
export const OG_TYPE = "image/png" as const;

/**
 * The certificate's own colours, for the certificate share card (app/g/[id]/opengraph-image).
 * The same values as the bond, engrave, muted-bond, seal and vault tokens in tokens.css.
 */
export const OG_CERT = {
  vault: "#0B2A21",
  bond: "#F2ECDC",
  engrave: "#173B2F",
  mutedBond: "#4A5E54",
  seal: "#8C1D1D",
  onVault: "#F2ECDC",
  onVault2: "#C9D3CC",
} as const;
