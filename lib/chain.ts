/**
 * X Layer, and the two addresses everything on this rail is denominated in.
 *
 * Every constant below was read from the chain on 19 September 2026, not copied from a
 * blog post. `npm run preflight` reads them again and refuses to agree quietly.
 */
import {defineChain} from "viem";
import {defaultAsset} from "./assets";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: [process.env.NEXT_PUBLIC_XLAYER_RPC ?? "https://rpc.xlayer.tech"]}},
  blockExplorers: {default: {name: "OKLink", url: "https://www.oklink.com/x-layer"}},
});

/** USDT on X Layer. SIX decimals, not eighteen. One dollar is 1_000_000n. */
export const STABLE = {
  address: (process.env.NEXT_PUBLIC_STABLE ??
    "0x1E4a5963aBFD975d8c9021ce480b42188849D41d") as `0x${string}`,
  symbol: "USDT",
  decimals: 6,
} as const;

/**
 * The asset a payment defaults to. xStocks are EIGHTEEN decimals, unlike the stablecoin's
 * six. The list of what Warrant will pay in lives in lib/assets.ts and nowhere else; this
 * re-exports the default so older call sites keep working.
 */
export const DEFAULT_ASSET = defaultAsset();

export const EXPLORER_TX = (hash: string) => `https://www.oklink.com/x-layer/tx/${hash}`;
export const EXPLORER_ADDRESS = (a: string) => `https://www.oklink.com/x-layer/address/${a}`;

/**
 * THE PUBLIC RPC CAPS eth_getLogs AT 100 BLOCKS. Measured on 23 September 2026 against
 * rpc.xlayer.tech: a 2,000-block range is refused with "block range greater than 100 max".
 * It used to accept more, and the indexer was built against a fork that has no limit at
 * all, which is how the wider window survived until the live check found it.
 *
 * The indexer pages in windows of exactly this size. A paid endpoint with a higher cap can
 * raise it through XLAYER_LOG_WINDOW; the default must be what the public endpoint allows.
 */
export const LOG_WINDOW = BigInt(process.env.XLAYER_LOG_WINDOW ?? 100);
