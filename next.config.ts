import type {NextConfig} from "next";

const config: NextConfig = {
  // The OKX client signs requests with credentials and must never reach a browser bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default config;
