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
 * decides whether they share the stub.
 *
 * ONE BUTTON PER WALLET, BY NAME. A browser can hold several wallets, and asking "the"
 * wallet asked whichever one grabbed `window.ethereum` — the first person paid through
 * Warrant held their stock in MetaMask and the button asked OKX Wallet. Every wallet in the
 * page announces itself (EIP-6963), so each gets its own button. The address to add by hand
 * is always there. Nothing here asks to connect, or for anything but to show a token.
 */
type Eip1193 = {request: (a: {method: string; params?: unknown}) => Promise<unknown>};
type Announced = {info: {uuid: string; name: string; rdns: string}; provider: Eip1193};

const CHAIN_HEX = `0x${xLayer.id.toString(16)}`;

async function show(wallet: Eip1193, token: {address: string; symbol: string; decimals: number}) {
  // A token is listed on the chain the wallet is on, so be on X Layer first.
  await wallet.request({method: "wallet_switchEthereumChain", params: [{chainId: CHAIN_HEX}]}).catch(async (err: {code?: number}) => {
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
  return wallet.request({method: "wallet_watchAsset", params: {type: "ERC20", options: token}});
}

export function AddToWallet({address, symbol, decimals}: {address: `0x${string}`; symbol: string; decimals: number}) {
  const [wallets, setWallets] = useState<Announced[]>([]);
  const [state, setState] = useState<Record<string, "asking" | "shown" | "refused">>({});

  useEffect(() => {
    const found = new Map<string, Announced>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      if (!d?.info?.uuid || !d.provider) return;
      found.set(d.info.rdns || d.info.uuid, d);
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // A wallet too old to announce itself: fall back to whatever sits on window.ethereum.
    const t = setTimeout(() => {
      if (found.size > 0) return;
      const w = window as unknown as {ethereum?: Eip1193 & {isMetaMask?: boolean}};
      if (w.ethereum) {
        setWallets([{info: {uuid: "injected", name: w.ethereum.isMetaMask ? "MetaMask" : "your wallet", rdns: "injected"}, provider: w.ethereum}]);
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(t);
    };
  }, []);

  async function ask(w: Announced) {
    const key = w.info.rdns || w.info.uuid;
    setState((s) => ({...s, [key]: "asking"}));
    try {
      const added = await show(w.provider, {address, symbol, decimals});
      setState((s) => ({...s, [key]: added === false ? "refused" : "shown"}));
    } catch {
      setState((s) => ({...s, [key]: "refused"}));
    }
  }

  const refused = Object.values(state).includes("refused");

  return (
    <div className="wa-addwallet">
      {wallets.length > 0 ? (
        <div className="wa-addwallet-buttons">
          {wallets.map((w) => {
            const s = state[w.info.rdns || w.info.uuid];
            return (
              <button key={w.info.uuid} type="button" className="wa-btn" onClick={() => void ask(w)} disabled={s === "asking"}>
                {s === "shown"
                  ? `${symbol} is listed in ${w.info.name}`
                  : s === "asking"
                    ? `Asking ${w.info.name}…`
                    : `Show ${symbol} in ${w.info.name}`}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="wa-fine">
        It is already in the wallet it was paid to, on X Layer. If your wallet does not list it,
        add the token by its address (in MetaMask: choose X Layer, then Import tokens):
      </p>
      <p className="wa-addwallet-addr">
        <code className="wa-mono">{address}</code> <CopyText text={address} label="Copy address" />
      </p>
      {refused ? <p className="wa-fine">That wallet did not add it. The address above works in any wallet.</p> : null}
    </div>
  );
}
