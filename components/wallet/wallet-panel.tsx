"use client";

import {AlertCircle, Check, Wallet} from "lucide-react";
import {useMemo} from "react";
import {formatEther} from "viem";
import {useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {xLayer} from "@/lib/chain";
import {short, usdt as fmtUsdt} from "@/lib/format";
import {useWallet} from "./use-wallet";
import "./wallet.css";

/**
 * THE PAYER'S WALLET, AS ONE HONEST PANEL.
 *
 * It lists every wallet the browser has, OKX Wallet first — the earlier version took
 * whichever one the browser offered first, which in practice was MetaMask, and there was
 * no way to choose. Once connected it says which address is paying and what that address
 * holds ON X LAYER, because "connected" is not the same as "able to pay", and a disabled
 * button that does not say why is how a product feels broken.
 */
function rank(id: string, name: string): number {
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes("okx") || s.includes("okex")) return 0;
  if (s.includes("metamask")) return 1;
  return 2;
}

export function WalletPanel({need}: {need?: bigint}) {
  const w = useWallet();
  const {connect, connectors, isPending, error, variables} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain, isPending: switching, error: switchError} = useSwitchChain();

  // EIP-6963 announces each installed wallet by name. Prefer those; the generic
  // "Injected" fallback only matters when a wallet does not announce itself.
  const wallets = useMemo(() => {
    const named = connectors.filter((c) => c.id !== "injected");
    if (named.length > 0) {
      return [...named].sort((a, b) => rank(a.id, a.name) - rank(b.id, b.name));
    }
    // The generic fallback is only worth offering when there is actually something
    // injected to talk to. Otherwise it is a button that can only fail.
    const hasInjected =
      typeof window !== "undefined" && Boolean((window as unknown as {ethereum?: unknown}).ethereum);
    return hasInjected ? connectors.filter((c) => c.id === "injected") : [];
  }, [connectors]);

  if (w.status === "disconnected" || w.status === "connecting") {
    return (
      <div className="wa-wallet">
        <p className="wa-wallet-title">
          <Wallet size={16} strokeWidth={2} aria-hidden /> Pay from your wallet
        </p>
        {wallets.length === 0 ? (
          <p className="wa-wallet-note">
            No wallet found in this browser.{" "}
            <a href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
              Install OKX Wallet
            </a>
            , then reload this page.
          </p>
        ) : (
          <div className="wa-wallet-choices">
            {wallets.map((c) => {
              const busy = isPending && variables?.connector === c;
              return (
                <button
                  key={c.uid}
                  type="button"
                  className="wa-wallet-choice"
                  disabled={isPending}
                  onClick={() => connect({connector: c, chainId: xLayer.id})}
                >
                  {c.icon ? <img src={c.icon} alt="" width={20} height={20} /> : <Wallet size={16} strokeWidth={2} aria-hidden />}
                  <span>{busy ? "Check your wallet…" : c.name === "Injected" ? "Browser wallet" : c.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {error ? <p className="wa-wallet-note is-err">{readable(error.message)}</p> : null}
      </div>
    );
  }

  if (w.status === "wrong-chain") {
    return (
      <div className="wa-wallet is-warn">
        <p className="wa-wallet-title">
          <AlertCircle size={16} strokeWidth={2} aria-hidden /> Your wallet is on another network
        </p>
        <p className="wa-wallet-note">
          Warrant runs on X Layer. Switching adds it to your wallet if it is not there yet.
        </p>
        <div className="wa-wallet-row">
          <button
            type="button"
            className="wa-btn is-primary"
            disabled={switching}
            onClick={() => switchChain({chainId: xLayer.id})}
          >
            {switching ? "Check your wallet…" : "Switch to X Layer"}
          </button>
          <button type="button" className="wa-linkish" onClick={() => disconnect()}>
            Use a different wallet
          </button>
        </div>
        {switchError ? <p className="wa-wallet-note is-err">{readable(switchError.message)}</p> : null}
      </div>
    );
  }

  const shortOf = need !== undefined && w.usdt !== undefined && w.usdt < need;
  const empty = w.usdt === 0n;

  return (
    <div className={`wa-wallet${shortOf || empty ? " is-warn" : ""}`}>
      <div className="wa-wallet-row">
        <span className="wa-wallet-title">
          <Check size={16} strokeWidth={2} aria-hidden className="wa-wallet-ok" />
          {w.walletName ?? "Wallet"} <span className="wa-mono">{short(w.address!)}</span>
        </span>
        <span className="wa-wallet-bal wa-mono">
          {w.usdt === undefined ? "…" : fmtUsdt(w.usdt)} USDT
          <span className="wa-wallet-sep">·</span>
          {w.okb === undefined ? "…" : Number(formatEther(w.okb)).toFixed(4)} OKB
        </span>
        <button type="button" className="wa-linkish" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
      {empty ? (
        <p className="wa-wallet-note">
          This wallet has no USDT on X Layer, so there is nothing to pay with yet. Send
          USDT on the X Layer network to <span className="wa-mono">{short(w.address!)}</span>.
        </p>
      ) : shortOf ? (
        <p className="wa-wallet-note">
          This payment needs {fmtUsdt(need!)} USDT and the wallet holds {fmtUsdt(w.usdt!)}.
        </p>
      ) : null}
    </div>
  );
}

/** A wallet's own error, reduced to the sentence that matters. */
function readable(message: string): string {
  if (/rejected|denied/i.test(message)) return "The request was dismissed in your wallet.";
  if (/already pending/i.test(message)) return "Your wallet already has a request open. Check it.";
  return message.split("\n")[0] ?? message;
}
