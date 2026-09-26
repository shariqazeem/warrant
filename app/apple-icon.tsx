import {ImageResponse} from "next/og";
import {MARK_VIEWBOX} from "@/components/brand/mark-geometry";
import {markPaths} from "@/components/brand/mark-paths";
import {OG} from "@/lib/og-theme";

/** Home-screen icon on iOS, for anyone who saves a certificate to their phone. iOS rounds it. */
export const size = {width: 180, height: 180};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: OG.vault,
        }}
      >
        <svg width="132" height="132" viewBox={MARK_VIEWBOX}>
          {markPaths(OG.bond, OG.foil)}
        </svg>
      </div>
    ),
    size,
  );
}
