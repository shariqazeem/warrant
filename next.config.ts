import type {NextConfig} from "next";

const config: NextConfig = {
  // A deploy builds into a folder of its own while the live server keeps reading .next,
  // then swaps the two (scripts/deploy-vm.sh). The server always runs from .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The OKX client signs requests with credentials and must never reach a browser bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Nothing about the stack is anyone's business.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {key: "X-Content-Type-Options", value: "nosniff"},
          {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
          // A page that asks for a signature must not be framed by someone else's page.
          {key: "X-Frame-Options", value: "SAMEORIGIN"},
          {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()"},
        ],
      },
    ];
  },
};

export default config;
