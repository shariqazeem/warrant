"use client";

/**
 * WHERE THE PAYER'S WALLET STANDS, IN ONE PLACE.
 *
 * Every money surface asks the same four questions before it will let anyone press Pay:
 * is a wallet connected, is it on X Layer, how much USDT does it hold there, and how much
 * OKB for gas. Answering them in one hook means the pay form, payroll and grants cannot
 * disagree about why a button is disabled.
 *
 * Balances are read from X Layer through this app's own RPC, whatever chain the wallet
 * happens to be pointed at — a wallet sitting on Ethereum still has a USDT balance on X
 * Layer, and that is the only balance that matters here.
 */
import {erc20Abi} from "viem";
import {useAccount, useBalance, useReadContract} from "wagmi";
import {STABLE, xLayer} from "@/lib/chain";

export type WalletStatus = "disconnected" | "connecting" | "wrong-chain" | "ready";

export function useWallet() {
  const {address, isConnected, isConnecting, isReconnecting, chainId, connector} = useAccount();

  const usdt = useReadContract({
    address: STABLE.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: xLayer.id,
    query: {enabled: Boolean(address), refetchInterval: 15_000},
  });

  const okb = useBalance({
    address,
    chainId: xLayer.id,
    query: {enabled: Boolean(address), refetchInterval: 30_000},
  });

  const status: WalletStatus = !isConnected
    ? isConnecting || isReconnecting
      ? "connecting"
      : "disconnected"
    : chainId !== xLayer.id
      ? "wrong-chain"
      : "ready";

  return {
    status,
    address,
    chainId,
    walletName: connector?.name ?? null,
    /** Undefined until read. Never shown as zero while it is still loading. */
    usdt: usdt.data as bigint | undefined,
    okb: okb.data?.value,
    refetch: () => {
      void usdt.refetch();
      void okb.refetch();
    },
  };
}
