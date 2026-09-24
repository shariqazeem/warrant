"use client";

import {Check, Wallet} from "lucide-react";
import {useMemo} from "react";
import {useAccount, useConnect, useDisconnect} from "wagmi";
import {OKX_CONNECT_ID} from "@/components/wallet/okx-connect";
import {connectWords} from "@/components/wallet/wallet-words";
import {short} from "@/lib/format";
import "@/components/wallet/wallet.css";

/**
 * THE WALLET YOU ARE PAID TO, AS ONE PANEL.
 *
 * The same connectors as WalletPanel, in the same order (OKX Wallet first, by QR if there is
 * no extension), in the same styles — but for the person being paid, not the payer.
 * WalletPanel says "Pay from your wallet" and warns when a wallet has no USDT to pay with or
 * no OKB for the fee; nothing is paid here and signing costs nothing, so on this page those
 * warnings would be false.
 *
 * It connects without asking the wallet to change network: a choice is signed for X Layer
 * whatever network the wallet is on. A wallet that refuses to sign for a network it is not on
 * is asked to switch at that moment, by the form.
 */
function rank(id: string, name: string): number {
  if (id === OKX_CONNECT_ID) return 0;
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes("okx") || s.includes("okex")) return 1;
  if (s.includes("metamask")) return 2;
  return 3;
}

export function ChoiceWallet() {
  const {address, status, connector} = useAccount();
  const {connect, connectors, isPending, error, variables} = useConnect();
  const {disconnect} = useDisconnect();

  // EIP-6963 announces each installed wallet by name. The generic "Injected" fallback only
  // matters when a wallet does not announce itself.
  const wallets = useMemo(() => {
    const named = connectors.filter((c) => c.id !== "injected");
    if (named.length > 0) return [...named].sort((a, b) => rank(a.id, a.name) - rank(b.id, b.name));
    const hasInjected =
      typeof window !== "undefined" && Boolean((window as unknown as {ethereum?: unknown}).ethereum);
    return hasInjected ? connectors.filter((c) => c.id === "injected") : [];
  }, [connectors]);

  if (status === "connected" && address) {
    return (
      <div className="wa-wallet">
        <div className="wa-wallet-row">
          <span className="wa-wallet-title">
            <Check size={16} strokeWidth={2} aria-hidden className="wa-wallet-ok" />
            {connector?.name ?? "Wallet"} <span className="wa-mono">{short(address)}</span>
          </span>
          <button type="button" className="wa-linkish" onClick={() => disconnect()}>
            Use a different wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-wallet">
      <p className="wa-wallet-title">
        <Wallet size={16} strokeWidth={2} aria-hidden /> Connect the wallet you are paid to
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
                disabled={isPending || status === "reconnecting"}
                onClick={() => connect({connector: c})}
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
      <p className="wa-wallet-note">
        Connecting shows this page your wallet&rsquo;s address and nothing else. Nothing is sent
        and nothing is charged.
      </p>
      {error ? <p className="wa-wallet-note is-err">{connectWords(error)}</p> : null}
    </div>
  );
}
