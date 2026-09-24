"use client";

/**
 * WHAT CAN BE DONE TO THIS GRANT, BY WHOEVER IS LOOKING AT IT.
 *
 * Nobody needs a wallet to see a certificate. Once one is connected the page knows who is
 * looking: the grantor may seal it or cancel the part not yet vested; the recipient may
 * claim what is due (no fee) and show the stock in their wallet; anyone may release what is
 * due to them and earn the release fee. Every call is simulated before the wallet is asked,
 * and a refusal is said in words (components/grants/use-grant.ts).
 *
 * The seal presses only after the seal transaction confirms: the page reloads the grant from
 * the chain and plays the press then (`?sealed=1`), never on the promise of one.
 */
import {Check, Loader2} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useMemo, useRef, useState} from "react";
import {useAccount, useConnect, useSwitchChain, useWatchAsset} from "wagmi";
import {CopyText} from "@/components/app/copy-text";
import {useGrantAction, type GrantAction} from "@/components/grants/use-grant";
import {OKX_CONNECT_ID} from "@/components/wallet/okx-connect";
import {TopUp} from "@/components/wallet/top-up";
import {NEEDS_OKB, useWallet} from "@/components/wallet/use-wallet";
import {connectWords, switchWords} from "@/components/wallet/wallet-words";
import {EXPLORER_TX, xLayer} from "@/lib/chain";
import {since} from "@/lib/format";
import {
  formatUnitsFixed,
  releasableUnits,
  releaseFee,
  revokePreview,
  type PoolState,
  type VestingTerms,
} from "@/lib/vesting";
import {settleCertificate} from "@/app/g/[id]/actions";
import {useSecond} from "./use-second";

type Hex = `0x${string}`;

export type CertActionsProps = {
  id: number;
  escrow: Hex;
  grantor: Hex;
  recipient: Hex;
  asset: {address: Hex; symbol: string; decimals: number};
  terms: VestingTerms;
  pool: PoolState;
  tipBps: number;
  sealed: boolean;
  revoked: boolean;
  closed: boolean;
  /** Units released to the recipient so far, from the release events. */
  releasedUnits: bigint;
  keeper: {alive: boolean; lastReleaseAt: number | null};
  initialNow: number;
  /** Arrived from issuing with `&seal=1`: bring "Seal it now" into view. */
  callSeal: boolean;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const DOING: Record<GrantAction, {busy: string; done: string}> = {
  seal: {busy: "Sealing…", done: "Sealed. Nobody can cancel any part of this grant now, including you."},
  revoke: {busy: "Cancelling the unvested part…", done: "Cancelled. What had vested stays theirs."},
  vest: {busy: "Releasing…", done: "Released to their wallet."},
  close: {busy: "Closing…", done: "Closed."},
};

function rank(id: string, name: string): number {
  if (id === OKX_CONNECT_ID) return 0;
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes("okx")) return 1;
  if (s.includes("metamask")) return 2;
  return 3;
}

/** Connect, or switch to X Layer. The only wallet chrome on the page. */
function Connect() {
  const {connect, connectors, isPending, error, variables} = useConnect();
  const wallets = useMemo(() => {
    const named = connectors.filter((c) => c.id !== "injected");
    const list = named.length > 0 ? named : connectors;
    return [...list].sort((a, b) => rank(a.id, a.name) - rank(b.id, b.name));
  }, [connectors]);

  return (
    <div className="wa-cx-connect">
      <p className="wa-cx-lead">
        Connect a wallet to claim, release or seal this grant. Nobody needs one to see it.
      </p>
      <div className="wa-actions">
        {wallets.map((c) => (
          <button
            key={c.uid}
            type="button"
            className={`wa-btn${rank(c.id, c.name) === 0 ? " is-primary" : ""}`}
            disabled={isPending}
            onClick={() => connect({connector: c, chainId: xLayer.id})}
          >
            {isPending && variables?.connector === c ? (
              <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" />
            ) : null}
            {isPending && variables?.connector === c ? "Confirm in your wallet" : `Connect ${c.name}`}
          </button>
        ))}
      </div>
      {error ? (
        <p className="wa-refusal" role="alert">
          {connectWords(error)}
        </p>
      ) : null}
    </div>
  );
}

export function CertActions(p: CertActionsProps) {
  const router = useRouter();
  const wallet = useWallet();
  const {connector} = useAccount();
  const {switchChain, isPending: switching, error: switchError} = useSwitchChain();
  const {watchAssetAsync} = useWatchAsset();
  const {run, phase, action, why, hash, reset} = useGrantAction(p.escrow);
  const at = useSecond(p.initialNow);
  const [confirming, setConfirming] = useState<null | {at: number}>(null);
  const [shown, setShown] = useState<"idle" | "asking" | "shown" | "refused">("idle");
  const sealRef = useRef<HTMLButtonElement>(null);

  const me = wallet.address?.toLowerCase();
  const isGrantor = me === p.grantor.toLowerCase();
  const isRecipient = me === p.recipient.toLowerCase();
  const open = !p.closed;
  const ended = at >= p.terms.start + p.terms.durationSeconds;
  const canSeal = open && !p.sealed && !p.revoked;
  const canCancel = canSeal && !ended;

  const ready = releasableUnits(p.terms, p.pool, at);
  const fmt = (v: bigint, dp = 6) => formatUnitsFixed(v, p.asset.decimals, dp);
  const busy = phase === "signing" || phase === "confirming";

  // Arrived from issuing, asked to seal: bring the button into view, once, when it exists.
  const called = useRef(false);
  useEffect(() => {
    if (!p.callSeal || called.current || !sealRef.current) return;
    called.current = true;
    sealRef.current.scrollIntoView({block: "center", behavior: "smooth"});
    sealRef.current.focus({preventScroll: true});
  });

  const blocker =
    wallet.status === "wrong-chain" ? "Switch to X Layer to continue" : wallet.noGas ? NEEDS_OKB : null;

  async function act(which: GrantAction) {
    if (busy || blocker) return;
    setConfirming(null);
    const tx = await run(p.id, which);
    if (!tx) return;
    await settleCertificate(String(p.id), tx).catch(() => undefined);
    if (which === "seal") {
      // The chain says it is sealed: now, and only now, the seal presses.
      router.replace(`/g/${p.id}?sealed=1`, {scroll: false});
    } else {
      router.refresh();
    }
  }

  async function showInWallet() {
    setShown("asking");
    try {
      const added = await watchAssetAsync({
        type: "ERC20",
        options: {address: p.asset.address, symbol: p.asset.symbol, decimals: p.asset.decimals},
      });
      setShown(added ? "shown" : "refused");
    } catch {
      setShown("refused");
    }
  }

  const walletName = connector?.name && connector.name !== "Injected" ? connector.name : "your wallet";
  const preview = confirming ? revokePreview(p.terms, p.pool, confirming.at) : null;

  if (wallet.status === "disconnected" || wallet.status === "connecting") {
    return (
      <section className="wa-cx" aria-label="What you can do">
        <Connect />
      </section>
    );
  }

  return (
    <section className="wa-cx" aria-label="What you can do">
      <p className="wa-cx-who">
        {isGrantor
          ? "You granted this."
          : isRecipient
            ? "This grant is yours."
            : `Connected as ${wallet.address ? short(wallet.address) : "a wallet"}. Anyone may release what is due to them.`}
      </p>

      {wallet.status === "wrong-chain" ? (
        <div className="wa-actions">
          <button type="button" className="wa-btn is-primary" disabled={switching} onClick={() => switchChain({chainId: xLayer.id})}>
            {switching ? "Confirm in your wallet" : "Switch to X Layer"}
          </button>
          {switchError ? <p className="wa-refusal">{switchWords(switchError)}</p> : null}
        </div>
      ) : null}

      {/* THE RECIPIENT */}
      {isRecipient && open ? (
        <div className="wa-cx-part">
          {p.keeper.alive ? (
            <p className="wa-cx-note">
              <Check size={16} strokeWidth={2} aria-hidden /> Nothing to do: what vests arrives in your wallet on schedule.
              {p.keeper.lastReleaseAt ? ` Last released ${since(p.keeper.lastReleaseAt, at * 1000)}.` : ""}
            </p>
          ) : null}
          <div className="wa-actions">
            <button
              type="button"
              className={`wa-btn is-large${p.keeper.alive ? "" : " is-primary"}`}
              disabled={busy || Boolean(blocker) || ready === 0n}
              onClick={() => void act("vest")}
            >
              {busy && action === "vest" ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {ready === 0n
                ? p.revoked
                  ? "Nothing more will vest"
                  : ended
                    ? "Everything has been released"
                    : "Nothing to claim yet"
                : wallet.noGas
                  ? "Top up a little OKB to claim"
                  : `Claim ${fmt(ready)} ${p.asset.symbol} now`}
            </button>
            <button type="button" className="wa-btn is-large" disabled={shown === "asking"} onClick={() => void showInWallet()}>
              {shown === "shown"
                ? `${p.asset.symbol} is listed in ${walletName}`
                : shown === "asking"
                  ? "Confirm in your wallet"
                  : `Show ${p.asset.symbol} in ${walletName}`}
            </button>
          </div>
          <p className="wa-fine">Claiming it yourself costs no release fee.</p>
          {shown === "refused" ? (
            <p className="wa-fine">
              {walletName} did not add it. Add the token by its address, on X Layer:{" "}
              <code className="wa-mono">{p.asset.address}</code> <CopyText text={p.asset.address} label="Copy address" />
            </p>
          ) : null}
          <p className="wa-fine">
            <Link href="/me" className="wa-linkish">
              Choose how you&rsquo;re paid next time
            </Link>
            : a free signature that sends nothing.
          </p>
        </div>
      ) : null}

      {/* THE GRANTOR */}
      {isGrantor && canSeal ? (
        <div className={`wa-cx-part${p.callSeal ? " is-called" : ""}`}>
          <div className="wa-actions">
            <button
              ref={sealRef}
              type="button"
              className="wa-btn is-seal is-large"
              disabled={busy || Boolean(blocker)}
              onClick={() => void act("seal")}
            >
              {busy && action === "seal" ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {wallet.noGas ? "Top up a little OKB to seal" : "Seal it now"}
            </button>
            {canCancel ? (
              <button
                type="button"
                className="wa-btn is-large"
                disabled={busy || Boolean(blocker)}
                aria-expanded={confirming !== null}
                onClick={() => setConfirming(confirming ? null : {at})}
              >
                Cancel the unvested part
              </button>
            ) : null}
          </div>
          <p className="wa-fine">
            Sealing is permanent. After it, nobody can cancel any part of this grant, including you.
          </p>

          {preview ? (
            <div className="wa-cx-confirm" role="group" aria-label="Cancel the unvested part">
              <p>
                <strong>
                  {fmt(preview.returnedUnits, 4)} {p.asset.symbol} goes back to you
                </strong>{" "}
                ({short(p.grantor)}), as stock, not USD₮0.
              </p>
              <p>
                {preview.vestedShares === 0n
                  ? `Nothing has vested yet, so ${short(p.recipient)} keeps nothing from this grant.`
                  : `What has vested stays ${short(p.recipient)}'s: ${fmt(preview.staysUnits, 4)} ${p.asset.symbol} ready to release to them` +
                    (p.releasedUnits > 0n ? `, on top of ${fmt(p.releasedUnits, 4)} ${p.asset.symbol} already released.` : ".")}{" "}
                Nothing more will vest, and this cannot be undone.
              </p>
              <p className="wa-fine">
                Figures at this second. Each second before your transaction lands vests a little more to them.
              </p>
              <div className="wa-actions">
                <button type="button" className="wa-btn is-primary" disabled={busy || Boolean(blocker)} onClick={() => void act("revoke")}>
                  {busy && action === "revoke" ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
                  Cancel the unvested part
                </button>
                <button type="button" className="wa-btn is-quiet" onClick={() => setConfirming(null)}>
                  Keep the grant
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ANYONE ELSE */}
      {!isRecipient && open ? (
        <div className="wa-cx-part">
          <div className="wa-actions">
            <button
              type="button"
              className={`wa-btn${isGrantor ? "" : " is-primary"}`}
              disabled={busy || Boolean(blocker) || ready === 0n}
              onClick={() => void act("vest")}
            >
              {busy && action === "vest" ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {ready === 0n ? "Nothing is due yet" : wallet.noGas ? "Top up a little OKB to release" : "Release what's due"}
            </button>
          </div>
          <p className="wa-fine">
            {ready === 0n
              ? "Nothing has vested since the last release."
              : `Sends ${fmt(ready)} ${p.asset.symbol} to ${short(p.recipient)}` +
                (p.tipBps > 0
                  ? `, and ${fmt(releaseFee(ready, p.tipBps, false))} ${p.asset.symbol} of it to you, the ${(p.tipBps / 100).toFixed(2)}% release fee.`
                  : ". This grant carries no release fee.")}
          </p>
        </div>
      ) : null}

      {/* No OKB: every action here is a transaction, so say how to get some, the same way the
          forms do. The steps are OKX's own withdrawal, on the X Layer network. */}
      {wallet.noGas && wallet.address ? (
        <TopUp
          address={wallet.address}
          usdMissing={0n}
          okbShort
          purpose={isRecipient ? "claim it yourself" : isGrantor ? "seal or cancel it" : "release what's due"}
        />
      ) : blocker && wallet.status !== "wrong-chain" ? (
        <p className="wa-refusal">{blocker}</p>
      ) : null}

      {/* WHERE THE LAST ACTION STANDS */}
      <div className="wa-cx-status" aria-live="polite">
        {phase === "signing" ? <p>Confirm in your wallet.</p> : null}
        {phase === "confirming" && action ? (
          <p>
            {DOING[action].busy}{" "}
            {hash ? (
              <a href={EXPLORER_TX(hash)} target="_blank" rel="noreferrer">
                See it on OKLink
              </a>
            ) : null}
          </p>
        ) : null}
        {phase === "done" && action ? (
          <p className="wa-cx-done">
            <Check size={16} strokeWidth={2} aria-hidden /> {DOING[action].done}{" "}
            {hash ? (
              <a href={EXPLORER_TX(hash)} target="_blank" rel="noreferrer">
                The transaction
              </a>
            ) : null}
          </p>
        ) : null}
        {phase === "failed" && why ? (
          <p className="wa-refusal">
            {why}{" "}
            <button type="button" className="wa-linkish" onClick={reset}>
              Try again
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}
