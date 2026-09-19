"use client";

import {createConfig, http} from "wagmi";
// From @wagmi/core, NOT from "wagmi/connectors". That barrel re-exports every connector,
// including the Coinbase SDK, which drags in a transitive module that does not resolve and
// fails the build. `injected` is a core connector and needs none of it.
import {injected} from "@wagmi/core";
import {xLayer} from "@/lib/chain";

/**
 * One chain and one kind of connector. OKX Wallet, MetaMask and anything else that injects
 * itself all arrive through `injected`, which is the whole list on purpose: a wallet picker
 * with six logos is a thing to configure, not a thing anyone needed.
 */
export const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors: [injected()],
  transports: {[xLayer.id]: http(xLayer.rpcUrls.default.http[0])},
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
