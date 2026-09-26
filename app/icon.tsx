import {ImageResponse} from "next/og";
import {MARK_VIEWBOX} from "@/components/brand/mark-geometry";
import {markPaths} from "@/components/brand/mark-paths";
import {OG} from "@/lib/og-theme";

/**
 * The browser tab and the OKX app's approval screen both show this: the W that vests, in bond
 * on the vault green with its fill in foil, the same drawing as the nav and the X profile.
 */
export const size = {width: 512, height: 512};
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 112,
        }}
      >
        <svg width="400" height="400" viewBox={MARK_VIEWBOX}>
          {markPaths(OG.bond, OG.foil)}
        </svg>
      </div>
    ),
    size,
  );
}
