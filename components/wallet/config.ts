"use client";

import {createConfig, http} from "wagmi";
// From @wagmi/core, NOT from "wagmi/connectors". That barrel re-exports every connector,
// including the Coinbase SDK, which drags in a transitive module that does not resolve and
// fails the build. `injected` is a core connector and needs none of it.
import {injected} from "@wagmi/core";
import {xLayer} from "@/lib/chain";
import {okxConnect} from "./okx-connect";

/**
 * One chain. Browser wallets announce themselves through EIP-6963 and are discovered on
 * their own; `injected` catches one that does not. `okxConnect` adds OKX Wallet by QR code
 * — the phone as the wallet — for anyone without the extension, which on a judge's laptop
 * is most people.
 */
export const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors: [okxConnect(), injected()],
  transports: {[xLayer.id]: http(xLayer.rpcUrls.default.http[0])},
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
