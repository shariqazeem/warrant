import {ImageResponse} from "next/og";
import {CertificateCard, DISPLAY, UI} from "@/components/cert/cert-card";
import {parseGrantId} from "@/lib/grants";
import {ogFonts} from "@/lib/og-fonts";
import {OG_CERT as C, OG_SIZE, OG_TYPE} from "@/lib/og-theme";
import {readCertificate} from "./read";

/**
 * THE SHARE CARD IS THE CERTIFICATE: the same engraving from the same seed, the same fields
 * from the same read of the chain, the same seal — drawn by Satori at 1200×630 on the vault.
 * No animation and no ticking figure: a picture of a moment says only what stays true.
 * A card that cannot show a grant says why, in words.
 */
export const runtime = "nodejs";
export const alt = "A certificate of grant: stock that vests every second, on X Layer";
export const size = OG_SIZE;
export const contentType = OG_TYPE;


/** The card's faces; with none (the fetch failed), next/og's own default face draws it. */
async function withFonts() {
  const fonts = await ogFonts();
  return fonts.length > 0 ? {...size, fonts} : {...size};
}

async function inWords(title: string, body: string) {
  return new ImageResponse(
    (
      <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: C.vault, padding: 72}}>
        <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 500, fontSize: 56, color: C.onVault}}>{title}</div>
        <div style={{display: "flex", fontFamily: UI, fontSize: 26, color: C.onVault2, marginTop: 20, maxWidth: 960}}>{body}</div>
      </div>
    ),
    await withFonts(),
  );
}

export default async function Image({params}: {params: {id: string} | Promise<{id: string}>}) {
  const {id: raw} = await Promise.resolve(params);
  const id = parseGrantId(raw);
  if (id === null) return inWords("Warrant", "A certificate's address is its number, counting from 1.");

  const found = await readCertificate(id);
  if (!found.ok) return inWords("Warrant", found.why);
  if (found.value === null) return inWords("Warrant", `There is no grant ${id}.`);

  return new ImageResponse(
    <CertificateCard d={found.value.data} escrow={found.value.escrow} now={Math.floor(Date.now() / 1000)} />,
    await withFonts(),
  );
}
