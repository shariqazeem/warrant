"use client";

import {Loader2} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import {useAccount, useSignTypedData, useSwitchChain} from "wagmi";
import {readChoice, saveChoice} from "@/app/me/actions";
import {AssetNote} from "@/components/pay/asset-note";
import {ASSETS, assetByAddress} from "@/lib/assets";
import {xLayer} from "@/lib/chain";
import {
  ELIGIBILITY_STATEMENT,
  MAX_BPS,
  ZERO_ADDRESS,
  checkChoice,
  choiceParts,
  choiceTypedData,
  exampleWords,
  type ChoiceMessage,
  type StoredChoice,
} from "@/lib/choice";
import {bps, short, stampUTC} from "@/lib/format";
import {held, type Outcome} from "@/lib/outcome";
import {ChoiceWallet} from "./choice-wallet";
import {STALE_PAGE, isStaleBuild} from "@/components/app/report";
import {switchWords} from "@/components/wallet/wallet-words";
import "@/components/pay/pay.css";
import "./choice.css";
import {CopyText} from "@/components/app/copy-text";

/**
 * HOW YOU GET PAID — the person being paid chooses, once.
 *
 * How much of each payment becomes stock, and which stock. It is signed, not sent: an
 * EIP-712 signature moves nothing and costs no network fee, and every company that pays
 * this wallet through Warrant follows it. The form checks the choice with the same rules
 * the server uses before it asks the wallet, so nobody signs something that will be refused.
 *
 * No figure here is a price or a projection. The one worked example is arithmetic on $100
 * and says so.
 */
const PRESETS = [0, 10, 25, 50, 75, 100] as const;

type Share = number | "custom" | null;
type Phase = "idle" | "signing" | "saving" | "failed" | "wrong-chain";

/** A whole percent from 0 to 100, as typed, or null. */
function wholePercent(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

export function ChoiceForm() {
  const {address, chainId, status} = useAccount();
  const {signTypedDataAsync} = useSignTypedData();
  const {switchChain, isPending: switching, error: switchError, reset: resetSwitch} = useSwitchChain();

  // The choice standing for the connected wallet, as the server read it. `null` until read.
  const [loaded, setLoaded] = useState<{address: string; choice: StoredChoice | null} | null>(null);
  const [loadWhy, setLoadWhy] = useState<string | null>(null);
  // How far this browser's clock is behind the server's, in seconds.
  const [skew, setSkew] = useState(0);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [share, setShare] = useState<Share>(null);
  const [customText, setCustomText] = useState("");
  const [asset, setAsset] = useState<`0x${string}` | null>(null);
  const [eligible, setEligible] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  const attemptSeq = useRef(0);

  // Read the choice standing for whichever wallet is connected, and start over when the
  // wallet changes: a form half-filled for one wallet must never be signed by another.
  useEffect(() => {
    attemptSeq.current++;
    setEditing(false);
    setJustSaved(false);
    setPhase("idle");
    setWhy(null);
    setShare(null);
    setCustomText("");
    setAsset(null);
    setEligible(false);
    setLoaded(null);
    setLoadWhy(null);
    if (!address) return;
    let live = true;
    readChoice(address)
      .catch(
        (err): Outcome<never> =>
          held(isStaleBuild(err) ? STALE_PAGE : "Your current choice could not be read: the connection dropped."),
      )
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setSkew(r.value.now - Math.floor(Date.now() / 1000));
          setLoaded({address, choice: r.value.choice});
        } else {
          setLoadWhy(r.why);
          setLoaded({address, choice: null});
        }
      });
    return () => {
      live = false;
    };
  }, [address]);

  const current = loaded && address && loaded.address === address ? loaded.choice : null;
  const reading = Boolean(address) && (!loaded || loaded.address !== address);

  const percent = share === "custom" ? wholePercent(customText) : share;
  const stockBps = percent === null ? null : percent * 100;
  const wantsStock = stockBps !== null && stockBps > 0;
  const picked = asset ? assetByAddress(asset) : undefined;

  const unchanged =
    current !== null &&
    stockBps !== null &&
    current.stockBps === stockBps &&
    (stockBps === 0 || current.asset === asset?.toLowerCase());

  const busy = phase === "signing" || phase === "saving";

  // THE BUTTON ALWAYS SAYS WHAT IT WILL DO, OR WHAT IS STOPPING IT.
  const blocker: string | null =
    share === null
      ? "Choose how much becomes stock"
      : percent === null
        ? "Enter a whole percent from 0 to 100"
        : wantsStock && !picked
          ? "Pick a stock"
          : wantsStock && !eligible
            ? "Tick the statement to choose stock"
            : unchanged
              ? "This is already your choice"
              : null;

  const label =
    phase === "signing"
      ? "Check your wallet…"
      : phase === "saving"
        ? "Saving your choice…"
        : (blocker ?? "Sign my choice — free, no network fee");

  const sign = useCallback(async () => {
    if (!address || stockBps === null || blocker || busy) return;
    const mine = ++attemptSeq.current;

    // By the server's clock, and always later than the choice it replaces, so a browser
    // whose clock is wrong still signs a time the server will take.
    const issuedAt = Math.max(Math.floor(Date.now() / 1000) + skew, (current?.issuedAt ?? 0) + 1);
    const message: ChoiceMessage = {
      person: address,
      stockBps,
      asset: stockBps > 0 && asset ? asset : ZERO_ADDRESS,
      // Only stated when stock is chosen; at 0% the statement was never shown, so it is not
      // signed as made.
      eligible: stockBps > 0 ? eligible : false,
      issuedAt,
    };
    const pre = checkChoice(message);
    if (!pre.ok) {
      setPhase("failed");
      setWhy(pre.why);
      return;
    }

    setPhase("signing");
    setWhy(null);
    resetSwitch();
    let signature: `0x${string}`;
    try {
      signature = await signTypedDataAsync({account: address, ...choiceTypedData(message)});
    } catch (err) {
      if (mine !== attemptSeq.current) return;
      const read = readSignError(err);
      setPhase(read.kind === "chain" ? "wrong-chain" : "failed");
      setWhy(read.kind === "chain" ? null : read.text);
      return;
    }
    if (mine !== attemptSeq.current) return;

    setPhase("saving");
    let saved: Outcome<StoredChoice>;
    try {
      saved = await saveChoice(message, signature);
    } catch (err) {
      saved = held(
        isStaleBuild(err)
          ? `${STALE_PAGE} Your choice was not saved.`
          : "The connection dropped before your choice was saved. Nothing changed; sign again.",
      );
    }
    if (mine !== attemptSeq.current) return;
    if (saved.ok) {
      setLoaded({address, choice: saved.value});
      setEditing(false);
      setJustSaved(true);
      setPhase("idle");
    } else {
      setPhase("failed");
      setWhy(saved.why);
    }
  }, [address, stockBps, blocker, busy, skew, current, asset, eligible, signTypedDataAsync, resetSwitch]);

  const startChange = () => {
    if (current) {
      const p = current.stockBps / 100;
      if ((PRESETS as readonly number[]).includes(p)) {
        setShare(p);
        setCustomText("");
      } else if (Number.isInteger(p)) {
        setShare("custom");
        setCustomText(String(p));
      } else {
        setShare(null);
      }
      setAsset(current.stockBps > 0 && assetByAddress(current.asset) ? current.asset : null);
    }
    // The statement is made again with every signature, never carried over.
    setEligible(false);
    setEditing(true);
    setJustSaved(false);
    setPhase("idle");
    setWhy(null);
  };

  const stopWaiting = () => {
    attemptSeq.current++;
    setPhase("idle");
  };

  // ── not connected ─────────────────────────────────────────────────────────────────

  if (status !== "connected" || !address) {
    return (
      <div className="wa-me">
        <Steps at={1} />
        <ChoiceWallet />
        <p className="wa-me-lead-note">
          Connect the wallet you want to be paid to. Next you choose how much of each payment
          becomes stock and sign it — which is free, and moves nothing — and then you get your
          link.
        </p>
      </div>
    );
  }

  if (reading) {
    return (
      <div className="wa-me">
        <Steps at={address ? 2 : 1} />
        <ChoiceWallet />
        <p className="wa-me-reading">Reading your current choice…</p>
      </div>
    );
  }

  // ── the choice standing, shown first ─────────────────────────────────────────────

  if (current && !editing) {
    const parts = choiceParts(current);
    const stock = current.stockBps > 0 ? assetByAddress(current.asset) : undefined;
    return (
      <div className="wa-me">
        <Steps at={3} />
        <ChoiceWallet />
        <YourLink address={address!} justSaved={justSaved} />
        <section className="wa-me-current" aria-live="polite">
          <p className="wa-kicker">Your choice</p>
          <p className="wa-me-now">
            <span className="wa-me-now-share">{parts.share}</span> {parts.rest}
          </p>
          <p className="wa-me-when">Signed {stampUTC(current.issuedAt)}</p>
          {stock ? (
            <div className="wa-me-note">
              <AssetNote symbol={stock.symbol} name={stock.name} audience="anyone" />
            </div>
          ) : null}
          <div className="wa-actions">
            <button type="button" className="wa-btn" onClick={startChange}>
              Change your split
            </button>
          </div>
          <p className="wa-fine wa-me-fine">
            Your public page shows this choice with its signature, so anyone — a company
            paying you included — can check it came from your wallet.
          </p>
        </section>
      </div>
    );
  }

  // ── the form ──────────────────────────────────────────────────────────────────────

  // The choice in words as it is being made; before a stock is picked, it says so.
  const preview =
    stockBps === null
      ? null
      : stockBps === 0 || picked
        ? choiceParts({stockBps, asset: picked?.address ?? ZERO_ADDRESS})
        : {
            share: bps(stockBps),
            rest: `of each payment into the stock you pick${stockBps === MAX_BPS ? "" : ", the rest as USDT"}`,
          };
  const offNetwork = chainId !== undefined && chainId !== xLayer.id;

  return (
    <div className="wa-me">
      <Steps at={2} />
      <ChoiceWallet />
      {loadWhy ? (
        <p className="wa-me-reading">
          {loadWhy} You can still sign a new choice; it replaces any older one.
        </p>
      ) : null}

      <div className="wa-pay">
        <form
          className="wa-pay-form wa-me-form"
          onSubmit={(e) => {
            e.preventDefault();
            void sign();
          }}
        >
          <fieldset className="wa-me-q" disabled={busy}>
            <legend className="wa-me-legend">How much of each payment becomes stock?</legend>
            <div className="wa-me-presets">
              {PRESETS.map((p) => (
                <label key={p} className={`wa-me-chip${share === p ? " is-on" : ""}`}>
                  <input
                    type="radio"
                    name="share"
                    value={p}
                    checked={share === p}
                    onChange={() => setShare(p)}
                  />
                  {p}%
                </label>
              ))}
              <label className={`wa-me-chip${share === "custom" ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="share"
                  value="custom"
                  checked={share === "custom"}
                  onChange={() => setShare("custom")}
                />
                Other
              </label>
              {share === "custom" ? (
                <span className="wa-me-custom">
                  <input
                    className="wa-input wa-mono"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    inputMode="numeric"
                    aria-label="Percent of each payment that becomes stock"
                    placeholder="30"
                    autoFocus
                  />
                  %
                </span>
              ) : null}
            </div>
            <p className="wa-fine">
              The rest of each payment arrives as USDT, a digital dollar, in the same wallet.
            </p>
          </fieldset>

          {wantsStock ? (
            <fieldset className="wa-me-q" disabled={busy}>
              <legend className="wa-me-legend">Which stock?</legend>
              <div className="wa-me-stocks">
                {ASSETS.map((a) => (
                  <div key={a.address} className={`wa-me-stock${asset === a.address ? " is-on" : ""}`}>
                    <label className="wa-me-stock-pick">
                      <input
                        type="radio"
                        name="stock"
                        value={a.address}
                        checked={asset === a.address}
                        onChange={() => setAsset(a.address)}
                      />
                      <span className="wa-me-stock-name">{a.name}</span>
                      <span className="wa-me-stock-sym wa-mono">{a.symbol}</span>
                    </label>
                    <AssetNote symbol={a.symbol} name={a.name} audience="anyone" />
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}

          {wantsStock ? (
            <div className="wa-me-q">
              <label className="wa-me-attest">
                <input
                  type="checkbox"
                  checked={eligible}
                  disabled={busy}
                  onChange={(e) => setEligible(e.target.checked)}
                />
                <span>{ELIGIBILITY_STATEMENT}</span>
              </label>
              <p className="wa-fine">
                Tokenized stocks are not offered to US persons, or to people living in those
                three countries. This is your own statement, and it is part of what you sign.
              </p>
            </div>
          ) : null}

          <div className="wa-pay-act">
            <button
              type="submit"
              className={`wa-btn is-primary is-wide${blocker && !busy ? " is-blocked" : ""}`}
              disabled={Boolean(blocker) || busy}
            >
              {busy ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {label}
            </button>

            {phase === "signing" ? (
              <p className="wa-fine">
                Your wallet is showing the choice to sign.{" "}
                <button type="button" className="wa-linkish" onClick={stopWaiting}>
                  Stop waiting
                </button>
              </p>
            ) : null}

            {phase === "failed" && why ? <p className="wa-refusal">{why}</p> : null}

            {phase === "wrong-chain" ? (
              <div className="wa-wallet is-warn">
                <p className="wa-wallet-note">
                  Your wallet will only sign for the network it is set to, and this choice is
                  for X Layer. Switch it to X Layer — switching is free and sends nothing —
                  then sign again.
                </p>
                <div className="wa-wallet-row">
                  <button
                    type="button"
                    className="wa-btn is-primary"
                    disabled={switching}
                    onClick={() => switchChain({chainId: xLayer.id}, {onSuccess: () => setPhase("idle")})}
                  >
                    {switching ? "Check your wallet…" : "Switch to X Layer"}
                  </button>
                </div>
              </div>
            ) : offNetwork && !busy ? (
              <p className="wa-fine">
                Your wallet is set to another network. Some wallets only sign for the network
                they are on; if yours is one,{" "}
                <button
                  type="button"
                  className="wa-linkish"
                  disabled={switching}
                  onClick={() => switchChain({chainId: xLayer.id})}
                >
                  {switching ? "check your wallet…" : "switch it to X Layer"}
                </button>{" "}
                first. Switching is free and sends nothing.
              </p>
            ) : null}
            {switchError && (phase === "wrong-chain" || offNetwork) ? (
              <p className="wa-refusal">{switchWords(switchError)}</p>
            ) : null}

            {editing && current ? (
              <p className="wa-fine">
                <button type="button" className="wa-linkish" disabled={busy} onClick={() => setEditing(false)}>
                  Keep my current choice
                </button>
              </p>
            ) : null}

            <p className="wa-fine">
              Signing is not a payment: it sends nothing, moves no money and costs no network
              fee. You can change your choice any time.
            </p>
          </div>
        </form>

        <aside className="wa-quote" aria-live="polite">
          <p className="wa-quote-title">What you are signing</p>
          {preview && stockBps !== null ? (
            <>
              <p className="wa-me-share">{preview.share}</p>
              <p className="wa-me-rest">{preview.rest}</p>
              <p className="wa-me-example">
                <span className="k">A worked example — arithmetic, not a price</span>
                {exampleWords({stockBps, asset: picked?.address ?? ZERO_ADDRESS})}
              </p>
              <dl className="wa-quote-rows wa-me-fields">
                <div>
                  <dt>In your wallet it reads</dt>
                  <dd>
                    <span className="wa-mono">person</span> {short(address)} — you
                    <br />
                    <span className="wa-mono">stockBps</span> {stockBps} — {preview.share}, in
                    hundredths of a percent
                    <br />
                    <span className="wa-mono">asset</span>{" "}
                    {stockBps === 0
                      ? `${short(ZERO_ADDRESS)} — none`
                      : picked
                        ? `${short(picked.address)} — ${picked.symbol}`
                        : "the stock you pick"}
                    <br />
                    <span className="wa-mono">eligible</span>{" "}
                    {stockBps > 0
                      ? `${String(eligible)} — your statement`
                      : "false — no statement is needed when nothing becomes stock"}
                    <br />
                    <span className="wa-mono">issuedAt</span> the moment you sign
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="wa-quote-waiting">
              Choose how much of each payment becomes stock to see your choice in words.
            </p>
          )}
          <p className="wa-quote-foot">
            Signed for Warrant on X Layer. Nothing moves until a company pays you, and then
            only as you chose.
          </p>
        </aside>
      </div>
    </div>
  );
}

/**
 * WHAT A WALLET MEANT WHEN IT DID NOT SIGN. A dismissal, a wallet that only signs for the
 * network it is on, or something else, said in its own first line.
 */
function readSignError(err: unknown): {kind: "rejected" | "chain" | "other"; text: string} {
  const said: string[] = [];
  let code: number | undefined;
  let e: unknown = err;
  for (let depth = 0; typeof e === "object" && e !== null && depth < 6; depth++) {
    const o = e as {shortMessage?: unknown; details?: unknown; message?: unknown; code?: unknown; cause?: unknown};
    if (code === undefined && typeof o.code === "number") code = o.code;
    for (const s of [o.shortMessage, o.details, o.message]) if (typeof s === "string" && s.trim()) said.push(s);
    e = o.cause;
  }
  const text = said.join(" ");
  if (code === 4001 || /reject|denied|cancel/i.test(text)) {
    return {kind: "rejected", text: "You closed the request in your wallet, so nothing was signed and nothing changed."};
  }
  if (/chain ?id/i.test(text) && /match|active|differ/i.test(text)) return {kind: "chain", text: ""};
  if (/already pending/i.test(text)) return {kind: "other", text: "Your wallet already has a request open. Check it."};
  const first = (said[0] ?? "no reason given").split("\n")[0]!.slice(0, 200);
  return {kind: "other", text: `Your wallet did not sign (${first}). Nothing changed.`};
}


/** Three steps, and where you are: connect, choose, share. */
function Steps({at}: {at: 1 | 2 | 3}) {
  const steps = ["Connect your wallet", "Choose your split", "Share your link"];
  return (
    <ol className="wa-steps" aria-label="Getting your link">
      {steps.map((s, i) => (
        <li key={s} className={i + 1 === at ? "is-on" : i + 1 < at ? "is-done" : ""} aria-current={i + 1 === at ? "step" : undefined}>
          <span className="n">{i + 1}</span> {s}
        </li>
      ))}
    </ol>
  );
}

/**
 * YOUR LINK — WHAT THIS PAGE IS FOR. Whoever pays through it gets the split you signed:
 * a client, an employer, a friend, from any wallet on X Layer.
 */
function YourLink({address, justSaved}: {address: string; justSaved: boolean}) {
  const [origin, setOrigin] = useState("https://warrant.world");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  const link = `${origin}/@${address}`;
  const shown = `${origin.replace(/^https?:\/\//, "")}/@${short(address)}`;
  return (
    <section className="wa-me-link" aria-live="polite">
      {justSaved ? <p className="wa-me-saved">Saved. Your link is ready.</p> : null}
      <p className="wa-kicker">Your link</p>
      <p className="wa-me-link-url wa-mono">{shown}</p>
      <div className="wa-actions">
        <CopyText text={link} label="Copy your link" />
        {canShare ? (
          <button
            type="button"
            className="wa-btn"
            onClick={() => void navigator.share({title: "Pay me on Warrant", url: link}).catch(() => undefined)}
          >
            Share
          </button>
        ) : null}
        <Link href={`/@${address}`} className="wa-btn">
          Open your page
        </Link>
      </div>
      <p className="wa-fine">
        Send it to whoever pays you. They pay in dollars from any wallet on X Layer and never
        pick your stock — you get your split, with a receipt for every payment.
      </p>
    </section>
  );
}
