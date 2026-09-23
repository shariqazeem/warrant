import {ImageResponse} from "next/og";

/** Home-screen icon on iOS, for anyone who saves a receipt page to their phone. */
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
          background: "#ffffff",
        }}
      >
        <svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#2b4acb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
