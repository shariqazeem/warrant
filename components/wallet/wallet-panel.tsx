"use client";

import {AlertCircle, Check, Wallet} from "lucide-react";
import {useMemo} from "react";
import {formatEther} from "viem";
import {useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {OKX_CONNECT_ID} from "./okx-connect";
import {connectWords, switchWords} from "./wallet-words";
import {OTHER_STABLE, STABLE, xLayer} from "@/lib/chain";
import {short, usdt as fmtUsdt} from "@/lib/format";
import {STABLE_NAME} from "@/lib/grant-terms";
import {TopUp} from "./top-up";
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
  if (id === OKX_CONNECT_ID) return 0;
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes("okx") || s.includes("okex")) return 1;
  if (s.includes("metamask")) return 2;
  return 3;
}

export function WalletPanel({
  need,
  okbShort,
  purpose = "pay",
}: {
  /** What the action costs in USD₮0 base units, once it is known. */
  need?: bigint;
  /** Whether the OKB balance is short of this action's fee; by default, only when it is zero. */
  okbShort?: boolean;
  /** Finishes "before you can …" in the top-up helper: "issue this grant". */
  purpose?: string;
}) {
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
            No wallet found. Install{" "}
            <a href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
              OKX Wallet
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
                  <span>
                    {busy
                      ? c.id === OKX_CONNECT_ID
                        ? "Scan the code with the OKX app…"
                        : "Check your wallet…"
                      : c.id === OKX_CONNECT_ID
                        ? "OKX Wallet"
                        : c.name === "Injected"
                          ? "Browser wallet"
                          : c.name}
                  </span>
                  {c.id === OKX_CONNECT_ID ? <span className="wa-wallet-tag">QR or app</span> : null}
                </button>
              );
            })}
          </div>
        )}
        {error ? <p className="wa-wallet-note is-err">{connectWords(error)}</p> : null}
      </div>
    );
  }

  if (w.status === "wrong-chain") {
    return (
      <div className="wa-wallet is-short">
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
        {switchError ? <p className="wa-wallet-note is-err">{switchWords(switchError)}</p> : null}
      </div>
    );
  }

  // What the wallet still needs, read from the chain: null while the wallet is empty and the
  // cost is not known yet, 0n once it holds enough (or holds some and nothing is priced).
  const usdMissing: bigint | null =
    w.usdt === undefined ? 0n : need !== undefined ? (w.usdt < need ? need - w.usdt : 0n) : w.usdt === 0n ? null : 0n;
  const lowOkb = okbShort ?? w.noGas;
  const older = w.usdt === 0n && w.otherUsdt !== undefined && w.otherUsdt > 0n;
  const warn = lowOkb || usdMissing === null || usdMissing > 0n;

  return (
    <div className={`wa-wallet${warn ? " is-short" : ""}`}>
      <div className="wa-wallet-row">
        <span className="wa-wallet-title">
          <Check size={16} strokeWidth={2} aria-hidden className="wa-wallet-ok" />
          {w.walletName ?? "Wallet"} <span className="wa-mono">{short(w.address!)}</span>
        </span>
        <span className="wa-wallet-bal wa-mono">
          <span>
            {w.usdt === undefined ? "…" : fmtUsdt(w.usdt)} {STABLE_NAME}
          </span>
          <span>{w.okb === undefined ? "…" : Number(formatEther(w.okb)).toFixed(4)} OKB</span>
        </span>
        <button type="button" className="wa-linkish" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
      {older ? (
        <p className="wa-wallet-note">
          This wallet holds {fmtUsdt(w.otherUsdt!)} of {OTHER_STABLE.label} on X Layer (
          <span className="wa-mono">{short(OTHER_STABLE.address)}</span>). Warrant pays with
          USD₮0 (<span className="wa-mono">{short(STABLE.address)}</span>), the USDT most
          wallets now hold. Swap it to USD₮0 in your wallet first; it costs a fraction of a cent.
        </p>
      ) : null}
      {warn ? <TopUp address={w.address!} usdMissing={usdMissing} okbShort={lowOkb} purpose={purpose} /> : null}
    </div>
  );
}

