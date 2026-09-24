"use client";

/**
 * OKX WALLET BY QR — OKX's own connect SDK, as a wagmi connector.
 *
 * On a desktop with no OKX extension, this shows OKX's QR modal: scan it with the OKX app
 * and the phone becomes the wallet. On a phone it deep-links into the app. It is the same
 * flow OKX's own sites use, which matters here because the people judging this will reach
 * for OKX Wallet first.
 *
 * TWO KINDS OF REQUEST, TWO DESTINATIONS. Anything a wallet must sign or answer — accounts,
 * chain id, transactions, typed data — goes to the phone through OKX Connect. Everything
 * else — eth_call, gas estimates, receipts — goes straight to X Layer's RPC. Sending reads
 * to the phone would prompt nothing and time out; sending signatures to the RPC would fail.
 *
 * The SDK is imported only when someone actually clicks, so a page that never connects
 * never downloads it, and nothing here runs during server rendering.
 */
import {createConnector} from "@wagmi/core";
import {getAddress, numberToHex, type Address} from "viem";
import {xLayer} from "@/lib/chain";
import {OKX_CLOSED} from "./wallet-words";
import {okxParams} from "./okx-params";

const CHAIN = `eip155:${xLayer.id}`;
const RPC = xLayer.rpcUrls.default.http[0]!;

/** Methods only the wallet can answer. Everything else is a read, served by the RPC. */
const WALLET_METHODS = new Set([
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_watchAsset",
]);

type UI = {
  openModal(opts: unknown): Promise<{namespaces?: Record<string, {accounts?: string[]}>} | undefined>;
  request<T = unknown>(args: {method: string; params?: unknown}, chain?: string): Promise<T>;
  disconnect(): Promise<void>;
  connected(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  session?: {namespaces?: Record<string, {accounts?: string[]}>};
};

let uiPromise: Promise<UI> | null = null;

async function getUI(): Promise<UI> {
  if (!uiPromise) {
    uiPromise = (async () => {
      const {OKXUniversalConnectUI, THEME} = await import("@okxconnect/ui");
      const ui = await OKXUniversalConnectUI.init({
        dappMetaData: {
          name: "Warrant",
          // app/icon.tsx — the same mark as the nav, shown on the phone while approving.
          icon: `${window.location.origin}/icon`,
        },
        actionsConfiguration: {returnStrategy: "none", modals: "all"},
        uiPreferences: {theme: THEME.LIGHT},
        language: "en_US",
      });
      return ui as unknown as UI;
    })();
    // A failed init must not be cached forever; let the next click try again.
    uiPromise.catch(() => {
      uiPromise = null;
    });
  }
  return uiPromise;
}

/** "eip155:196:0xabc…" → 0xAbc… */
function accountsOf(ui: UI): Address[] {
  const raw = ui.session?.namespaces?.eip155?.accounts ?? [];
  return raw
    .map((a) => a.split(":").pop() ?? "")
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
    .map((a) => getAddress(a));
}

async function rpc(method: string, params: unknown) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: Date.now(), method, params: params ?? []}),
  });
  const body = (await res.json()) as {result?: unknown; error?: {code: number; message: string}};
  if (body.error) {
    const err = new Error(body.error.message) as Error & {code?: number};
    err.code = body.error.code;
    throw err;
  }
  return body.result;
}

/** An EIP-1193 provider over OKX Connect, which is what wagmi and viem expect to talk to. */
function providerFor(ui: UI) {
  return {
    async request({method, params}: {method: string; params?: unknown}) {
      if (method === "eth_chainId") return numberToHex(xLayer.id);
      if (method === "eth_accounts" || method === "eth_requestAccounts") return accountsOf(ui);
      if (WALLET_METHODS.has(method)) return ui.request({method, params: okxParams(method, params)}, CHAIN);
      return rpc(method, params);
    },
    on: () => {},
    removeListener: () => {},
  };
}

export const OKX_CONNECT_ID = "okx-connect";

/**
 * NOTICE WHEN SOMEONE CLOSES THE QR WINDOW.
 *
 * OKX Connect's openModal() never settles when the modal is dismissed — measured: it stays
 * pending, fires no window event, and leaves every wallet button on the page disabled until
 * a reload. So this watches the modal's own root, `#universal-widget-root`, which holds the
 * modal's markup while it is open and is emptied when it closes. Having seen it open, an
 * empty root means it was closed.
 *
 * A successful scan ALSO closes it, so the caller must not read a close as a cancel on its
 * own — see connect(), which gives the session a moment to land before deciding.
 */
function watchModalClose() {
  let seenOpen = false;
  let done = false;
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));

  const check = () => {
    if (done) return;
    const text = document.getElementById("universal-widget-root")?.textContent?.trim() ?? "";
    if (text.length > 0) seenOpen = true;
    else if (seenOpen) {
      done = true;
      resolve();
    }
  };

  const observer = new MutationObserver(check);
  observer.observe(document.body, {childList: true, subtree: true, characterData: true});
  // Belt and braces: a mutation can be missed, a poll cannot.
  const timer = setInterval(check, 400);

  return {
    closed,
    stop() {
      done = true;
      observer.disconnect();
      clearInterval(timer);
    },
  };
}

/** The sentence shown when someone closes the QR window without scanning it. */
export {OKX_CLOSED};

const OKX_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#000"/>' +
      '<g fill="#fff"><rect x="9" y="9" width="7" height="7"/><rect x="24" y="9" width="7" height="7"/>' +
      '<rect x="16.5" y="16.5" width="7" height="7"/><rect x="9" y="24" width="7" height="7"/>' +
      '<rect x="24" y="24" width="7" height="7"/></g></svg>',
  );

export function okxConnect() {
  return createConnector((config) => ({
    id: OKX_CONNECT_ID,
    name: "OKX Wallet",
    type: "okxConnect",
    icon: OKX_ICON,

    async connect(parameters?: {chainId?: number; isReconnecting?: boolean}) {
      const ui = await getUI();

      if (!ui.connected()) {
        if (parameters?.isReconnecting) throw new Error("No OKX session to restore.");

        const watch = watchModalClose();
        const opening = ui
          .openModal({
            namespaces: {
              eip155: {
                chains: [CHAIN],
                rpcMap: {[String(xLayer.id)]: RPC},
                defaultChain: String(xLayer.id),
              },
            },
          })
          .then(() => "connected" as const);

        try {
          const first = await Promise.race([opening, watch.closed.then(() => "closed" as const)]);
          if (first === "closed") {
            // A scan that succeeded closes the window too. Give the session a moment to
            // land before calling it a cancel.
            await Promise.race([opening, new Promise((r) => setTimeout(r, 1500))]);
            if (!ui.connected()) throw new Error(OKX_CLOSED);
          }
        } finally {
          watch.stop();
        }
      }

      const accounts = accountsOf(ui);
      if (accounts.length === 0) throw new Error("OKX Wallet did not share an account.");

      ui.on("session_delete", () => config.emitter.emit("disconnect"));
      ui.on("session_update", () => {
        const next = accountsOf(ui);
        if (next.length === 0) config.emitter.emit("disconnect");
        else config.emitter.emit("change", {accounts: next});
      });

      return {accounts, chainId: xLayer.id} as never;
    },

    async disconnect() {
      const ui = await getUI();
      if (ui.connected()) await ui.disconnect();
    },

    async getAccounts() {
      const ui = await getUI();
      return accountsOf(ui);
    },

    async getChainId() {
      return xLayer.id;
    },

    async getProvider() {
      const ui = await getUI();
      return providerFor(ui);
    },

    async isAuthorized() {
      // Only restore a session that already exists; never open a modal on page load.
      if (!uiPromise) return false;
      try {
        const ui = await getUI();
        return ui.connected() && accountsOf(ui).length > 0;
      } catch {
        return false;
      }
    },

    async switchChain({chainId}: {chainId: number}) {
      // OKX Connect sessions are opened for X Layer and nothing else.
      if (chainId !== xLayer.id) throw new Error("Warrant only runs on X Layer.");
      return xLayer;
    },

    onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) config.emitter.emit("disconnect");
      else config.emitter.emit("change", {accounts: accounts.map((a) => getAddress(a))});
    },

    onChainChanged() {},

    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
