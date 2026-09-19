"use client";

import {Wallet} from "lucide-react";
import {useAccount, useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {xLayer} from "@/lib/chain";
import {short} from "@/lib/format";

/**
 * THE WALLET, AS ONE ROW. Connect, then the address, then the one thing that can be wrong:
 * being on another chain. Each state says what will happen if it is pressed.
 */
export function Connect() {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending, error} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain, isPending: switching} = useSwitchChain();

  const connector = connectors[0];

  if (!isConnected) {
    return (
      <div className="wa-connect">
        <button
          type="button"
          className="wa-btn is-primary"
          disabled={isPending || !connector}
          onClick={() => connector && connect({connector})}
        >
          <Wallet size={16} strokeWidth={2} aria-hidden />
          {isPending ? "Waiting for your wallet" : "Connect a wallet"}
        </button>
        {!connector ? (
          <p className="wa-connect-note">
            No wallet found in this browser. OKX Wallet or MetaMask will appear here once
            installed.
          </p>
        ) : null}
        {error ? <p className="wa-connect-note is-err">{error.message}</p> : null}
      </div>
    );
  }

  if (chainId !== xLayer.id) {
    return (
      <div className="wa-connect">
        <button
          type="button"
          className="wa-btn is-primary"
          disabled={switching}
          onClick={() => switchChain({chainId: xLayer.id})}
        >
          {switching ? "Waiting for your wallet" : "Switch to X Layer"}
        </button>
        <p className="wa-connect-note">
          This wallet is on chain {chainId}. Warrant pays on X Layer, chain {xLayer.id}.
        </p>
      </div>
    );
  }

  return (
    <div className="wa-connect">
      <span className="wa-connect-addr wa-mono">{short(address!)}</span>
      <button type="button" className="wa-linkish" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
