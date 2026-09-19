"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {WagmiProvider} from "wagmi";
import {wagmiConfig} from "./config";

/**
 * Wraps the interactive leaves only. Everything above it is a server component, so a
 * receipt still ships no wallet code at all — which is the point of the receipt being
 * openable by a stranger with no session.
 */
export function WalletProvider({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
