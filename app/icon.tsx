import {ImageResponse} from "next/og";

/**
 * The browser tab and the OKX app's approval screen both show this. The same mark as the
 * nav — a sheet with its corner turned down and a seal pressed over the edge — drawn in
 * the document blue on white, because a tab with a generic globe reads as unfinished.
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
          background: "#ffffff",
          borderRadius: 112,
        }}
      >
        <svg
          width="360"
          height="360"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2b4acb"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 3h9l5 5v8" />
          <path d="M5 3v16h6" />
          <path d="M14 3v5h5" />
          <path d="M8.5 12h6" />
          <circle cx="16" cy="18" r="3.25" />
        </svg>
      </div>
    ),
    size,
  );
}
