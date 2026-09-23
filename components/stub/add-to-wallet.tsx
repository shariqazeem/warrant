"use client";

import {useEffect, useState} from "react";
import {CopyText} from "@/components/app/copy-text";
import {xLayer} from "@/lib/chain";

/**
 * "WHERE IS IT?" — the first thing a person paid in stock asks.
 *
 * The stock is already in the wallet it was paid to; nothing here moves it. Many wallets
 * only list a token once they have been told about it, so the person opening their stub
 * sees their pay nowhere and assumes it never came. This answers that in the moment that
 * decides whether they share the stub: a button that asks their wallet to show the token
 * (when the page is open inside a wallet's own browser), and always the address to add by
 * hand. It never asks to connect, and never asks for anything but to show a token.
 */
type Eip1193 = {request: (a: {method: string; params?: unknown}) => Promise<unknown>};

const CHAIN_HEX = `0x${xLayer.id.toString(16)}`;

export function AddToWallet({address, symbol, decimals}: {address: `0x${string}`; symbol: string; decimals: number}) {
  const [wallet, setWallet] = useState<Eip1193 | null>(null);
  const [state, setState] = useState<"idle" | "asking" | "shown" | "refused">("idle");

  useEffect(() => {
    const w = window as unknown as {okxwallet?: Eip1193; ethereum?: Eip1193};
    setWallet(w.okxwallet ?? w.ethereum ?? null);
  }, []);

  async function show() {
    if (!wallet) return;
    setState("asking");
    try {
      // A token is listed on the chain the wallet is on, so be on X Layer first.
      await wallet
        .request({method: "wallet_switchEthereumChain", params: [{chainId: CHAIN_HEX}]})
        .catch(async (err: {code?: number}) => {
          if (err?.code !== 4902) throw err;
          await wallet.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN_HEX,
                chainName: "X Layer",
                nativeCurrency: xLayer.nativeCurrency,
                rpcUrls: xLayer.rpcUrls.default.http,
                blockExplorerUrls: [xLayer.blockExplorers?.default.url],
              },
            ],
          });
        });
      const added = await wallet.request({
        method: "wallet_watchAsset",
        params: {type: "ERC20", options: {address, symbol, decimals}},
      });
      setState(added === false ? "refused" : "shown");
    } catch {
      setState("refused");
    }
  }

  return (
    <div className="wa-addwallet">
      {wallet ? (
        <button type="button" className="wa-btn" onClick={() => void show()} disabled={state === "asking"}>
          {state === "shown"
            ? `${symbol} is listed in your wallet`
            : state === "asking"
              ? "Asking your wallet…"
              : `Show ${symbol} in my wallet`}
        </button>
      ) : null}
      <p className="wa-fine">
        It is already in the wallet it was paid to, on X Layer. If your wallet does not list it,
        add the token by its address:
      </p>
      <p className="wa-addwallet-addr">
        <code className="wa-mono">{address}</code> <CopyText text={address} label="Copy address" />
      </p>
      {state === "refused" ? (
        <p className="wa-fine">Your wallet did not add it. The address above works in any wallet.</p>
      ) : null}
    </div>
  );
}
