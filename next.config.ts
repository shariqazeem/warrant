import type {NextConfig} from "next";

const config: NextConfig = {
  // A deploy builds into a folder of its own while the live server keeps reading .next,
  // then swaps the two (scripts/deploy-vm.sh). The server always runs from .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The OKX client signs requests with credentials and must never reach a browser bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Nothing about the stack is anyone's business.
  poweredByHeader: false,
  // Every public link ever shared keeps working. A grant's page moved to /g/[id]; the old
  // address forwards there. Temporary (307) while the new page settles: flip to
  // `permanent: true` (308) once /g is final, so browsers and crawlers learn the new address
  // for good. Receipts stay at /receipt/[tx], unchanged. Only the page moves: the old
  // /grant/[id]/opengraph-image keeps its own route for as long as it exists.
  async redirects() {
    return [{source: "/grant/:id", destination: "/g/:id", permanent: false}];
  },
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
