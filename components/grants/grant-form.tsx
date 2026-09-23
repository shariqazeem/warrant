"use client";

import {ChevronDown, Loader2} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {buildGrant, type BuiltGrant} from "@/app/grants/actions";
import {MAX_TIP_BPS} from "@/lib/grant-terms";
import {ASSETS, defaultAsset} from "@/lib/assets";
import {AssetNote} from "@/components/pay/asset-note";
import {STABLE} from "@/lib/chain";
import {parseMoney} from "@/lib/csv";
import {held, type Outcome} from "@/lib/outcome";
import {checkAddress, impactText} from "@/lib/payment";
import {QUOTE_LOST} from "@/lib/quote-age";
import {settledUnitPrice, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {WalletPanel} from "@/components/wallet/wallet-panel";
import {useWallet} from "@/components/wallet/use-wallet";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {useOpenGrant} from "./use-open-grant";
import "@/components/pay/pay.css";
import "./grants.css";

const DAY = 86_400;

/** The terms equity grants are actually written in, not arbitrary seconds. */
const TERMS = [
  {label: "1 year", seconds: 365 * DAY},
  {label: "2 years", seconds: 2 * 365 * DAY},
  {label: "3 years", seconds: 3 * 365 * DAY},
  {label: "4 years", seconds: 4 * 365 * DAY},
] as const;

const CLIFFS = [
  {label: "No cliff — starts vesting now", seconds: 0},
  {label: "3 months", seconds: 90 * DAY},
  {label: "6 months", seconds: 180 * DAY},
  {label: "1 year", seconds: 365 * DAY},
] as const;

/**
 * OPEN A GRANT.
 *
 * The asset is bought once, now, and held in an escrow the payer cannot reach into. What
 * the payer keeps is the right to revoke what has not vested — and `seal`, on the grant
 * itself, gives even that up.
 */
export function GrantForm({escrow}: {escrow: `0x${string}` | undefined}) {
  const router = useRouter();
  const wallet = useWallet();

  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(defaultAsset().address);
  const [durationSeconds, setDuration] = useState<number>(TERMS[3].seconds);
  const [cliffSeconds, setCliff] = useState<number>(CLIFFS[3].seconds);
  const [tipBps, setTipBps] = useState(50);
  const [reason, setReason] = useState("");
  const [keeperOpen, setKeeperOpen] = useState(false);

  const [quoted, setQuoted] = useState<{sig: string; value: BuiltGrant} | null>(null);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  /** The price request itself failed — it never came back — rather than being refused. */
  const [quoteLost, setQuoteLost] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [refreshAt, setRefreshAt] = useState(0);

  const {open, phase, why, reset} = useOpenGrant(escrow);

  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();
  // Read as /pay and a run file read it: "2,50" is refused, not taken as $250.
  const amountRead = amount.trim() === "" ? null : parseMoney(amount);
  const usd = amountRead?.ok ? amountRead.value : 0;
  // A mistyped address is named here, by the same check the server runs, and never sent
  // for a price.
  const checkedAddress = beneficiary.length > 0 ? checkAddress(beneficiary, "someone to grant to") : null;
  const addressWhy = checkedAddress && !checkedAddress.ok ? checkedAddress.why : null;
  const ready = beneficiary.length > 0 && !addressWhy && usd > 0 && reason.trim().length > 0;

  // A quote belongs to the terms that produced it. See the note in pay-form.tsx.
  const signature = JSON.stringify([
    beneficiary,
    usd,
    asset,
    durationSeconds,
    cliffSeconds,
    tipBps,
    reason.trim(),
  ]);
  const quote = quoted?.sig === signature ? quoted.value : null;
  const restating = quoted !== null && quoted.sig !== signature;

  useTxToast(phase === "idle" ? "idle" : phase, "Open the grant", {detail: why ?? undefined});

  const seq = useRef(0);
  useEffect(() => {
    if (!ready) {
      // Anything still in flight was asked for terms that no longer stand; drop it.
      seq.current++;
      setQuoted(null);
      setQuoteWhy(null);
      setQuoteLost(false);
      setQuoting(false);
      return;
    }
    const mine = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      let out: Outcome<BuiltGrant>;
      let lost = false;
      try {
        out = await buildGrant({
          beneficiary,
          asset,
          usd,
          cliffSeconds,
          durationSeconds,
          tipBps,
          reason,
        });
      } catch {
        // Never came back. Say so, rather than "Getting the price…" for ever.
        out = held(QUOTE_LOST);
        lost = true;
      }
      if (mine !== seq.current) return;
      setQuoting(false);
      setQuoteLost(lost);
      if (out.ok) {
        setQuoted({sig: signature, value: out.value});
        setQuoteWhy(null);
      } else {
        setQuoted(null);
        setQuoteWhy(out.why);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [ready, beneficiary, usd, asset, cliffSeconds, durationSeconds, tipBps, reason, signature, refreshAt]);

  const send = useCallback(async () => {
    if (!quote) return;
    const tx = await open(quote.terms);
    if (tx) {
      setAmount("");
      setBeneficiary("");
      setReason("");
      setQuoted(null);
      router.refresh();
    }
  }, [open, quote, router]);

  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  const price =
    quote && quote.expectedUnits !== "0"
      ? settledUnitPrice(BigInt(quote.terms.stableAmount), BigInt(quote.expectedUnits), chosen.decimals)
      : null;

  return (
    <div className="wa-pay">
      <form
        className="wa-pay-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <WalletPanel need={quote ? BigInt(quote.terms.stableAmount) : undefined} />

        <label className="wa-field">
          <span className="k">Their wallet</span>
          <input
            className="wa-input wa-mono"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value.trim())}
            placeholder="0x… their X Layer address"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="wa-field">
          <span className="k">Grant value</span>
          <span className="wa-money">
            <span className="wa-money-sign">$</span>
            <input
              className="wa-input is-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0"
              inputMode="decimal"
            />
            <span className="wa-money-unit">in USDT, turned into {chosen.symbol} today</span>
          </span>
        </label>

        <label className="wa-field">
          <span className="k">They receive</span>
          <span className="wa-field-v">
            <select className="wa-input" value={asset} onChange={(e) => setAsset(e.target.value as typeof asset)}>
              {ASSETS.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.name} ({a.symbol})
                </option>
              ))}
            </select>
            <AssetNote symbol={chosen.symbol} name={chosen.name} />
          </span>
        </label>

        <label className="wa-field">
          <span className="k">Vesting over</span>
          <select
            className="wa-input"
            value={durationSeconds}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {TERMS.map((t) => (
              <option key={t.seconds} value={t.seconds}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="wa-field">
          <span className="k">Nothing vests before</span>
          <select className="wa-input" value={cliffSeconds} onChange={(e) => setCliff(Number(e.target.value))}>
            {CLIFFS.filter((c) => c.seconds <= durationSeconds).map((c) => (
              <option key={c.seconds} value={c.seconds}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="wa-field">
          <span className="k">Note</span>
          <span className="wa-field-v">
            <input
              className="wa-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Founding engineer, four year grant"
              maxLength={200}
            />
            <span className="wa-field-help">Shown on the grant. Required.</span>
          </span>
        </label>

        <div className="wa-fold">
          <button
            type="button"
            className="wa-fold-toggle"
            aria-expanded={keeperOpen}
            onClick={() => setKeeperOpen((v) => !v)}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={keeperOpen ? "is-open" : ""} />
            Automatic release
          </button>
          {keeperOpen ? (
            <>
              <label className="wa-field is-nested">
                <span className="k">Release fee</span>
                <span className="wa-money">
                  <input
                    className="wa-input is-amount"
                    value={(tipBps / 100).toFixed(2)}
                    onChange={(e) =>
                      setTipBps(
                        Math.max(
                          0,
                          Math.min(MAX_TIP_BPS, Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100)),
                        ),
                      )
                    }
                    inputMode="decimal"
                  />
                  <span className="wa-money-unit">%</span>
                </span>
              </label>
              <p className="wa-quote-aside" style={{marginTop: "var(--s-3)"}}>
                Anyone can release what is due on this grant and earns this small fee for
                doing it — so it pays out on schedule even if nobody remembers. The
                recipient pays nothing when they claim it themselves, and the fees can never
                add up to more than this share of the grant.
              </p>
            </>
          ) : null}
        </div>

        <div className="wa-pay-act">
          {(() => {
            const blocker =
              wallet.status === "disconnected" || wallet.status === "connecting"
                ? "Connect a wallet to create a grant"
                : wallet.status === "wrong-chain"
                  ? "Switch to X Layer to continue"
                  : beneficiary.length === 0
                    ? "Add their wallet address"
                    : addressWhy
                      ? "Fix the problem above"
                      : amountRead !== null && !amountRead.ok
                        ? amountRead.why
                        : !(usd > 0)
                          ? "Enter the grant value"
                          : reason.trim().length === 0
                            ? "Add a note"
                            : quoteLost
                              ? "Could not get the price — try again"
                              : quoteWhy
                                ? "Fix the problem above"
                                : !quote
                                  ? "Getting the price…"
                                  : wallet.usdt !== undefined && wallet.usdt < BigInt(quote.terms.stableAmount)
                                    ? `Not enough USDT — you have ${usdt(wallet.usdt)}`
                                    : null;
            return (
              <button
                type="submit"
                className={`wa-btn is-primary is-wide${blocker ? " is-blocked" : ""}`}
                disabled={Boolean(blocker) || busy}
              >
                {busy ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
                {phase === "signing"
                  ? "Confirm in your wallet…"
                  : phase === "confirming"
                    ? "Creating the grant…"
                    : (blocker ??
                      `Create a ${humanDuration(durationSeconds)} grant · ${usdt(BigInt(quote!.terms.stableAmount))}`)}
              </button>
            );
          })()}
          {phase === "failed" && why ? (
            <p className="wa-refusal">
              {why}{" "}
              <button type="button" className="wa-linkish" onClick={reset}>
                Try again
              </button>
            </p>
          ) : null}
        </div>
      </form>

      <aside className="wa-quote" aria-live="polite">
        {addressWhy ? (
          <p className="wa-refusal">{addressWhy}</p>
        ) : quoteWhy ? (
          // The price service's refusals can pass — a busy minute, a thin market that
          // refills — so the same terms can always be asked again.
          <p className="wa-refusal">
            {quoteWhy}{" "}
            <button
              type="button"
              className="wa-linkish"
              disabled={quoting || busy}
              onClick={() => setRefreshAt(Date.now())}
            >
              {quoting ? "Trying again…" : "Try again"}
            </button>
          </p>
        ) : quote ? (
          <>
            <p className="wa-quote-lead">Held for them in escrow</p>
            <p className="wa-units">
              {unitsFromRaw(BigInt(quote.expectedUnits), chosen.decimals)}
              <span className="sym">{chosen.symbol}</span>
            </p>
            <dl className="wa-quote-rows">
              <div>
                <dt>Price</dt>
                {/* A price that cannot be computed is not zero. See the note in pay-form. */}
                <dd>
                  {price === null
                    ? "not available"
                    : `1 ${chosen.symbol} = $${price.toFixed(2)}`}
                </dd>
              </div>
              {/* Only the aggregator's own figure; no row at all when it gives none. */}
              {quote.priceImpactPercent !== null ? (
                <div>
                  <dt>Price impact</dt>
                  <dd>{impactText(quote.priceImpactPercent)}</dd>
                </div>
              ) : null}
              <div>
                <dt>At least</dt>
                <dd>
                  {unitsFromRaw(BigInt(quote.minUnits), chosen.decimals)} {chosen.symbol} — the
                  contract refuses less
                  <span className="wa-quote-aside">
                    If the price moves and the escrow would get less, the grant is not opened
                    and no USDT leaves your wallet.
                  </span>
                </dd>
              </div>
              <div>
                <dt>When it vests</dt>
                <dd>
                  {cliffSeconds === 0 ? "immediately, and then continuously" : `after ${humanDuration(cliffSeconds)}`}
                  <span className="wa-quote-aside">
                    {cliffSeconds === 0
                      ? "there is no cliff on this grant"
                      : `the whole elapsed share lands at once, then it vests continuously to ${humanDuration(durationSeconds)}`}
                  </span>
                </dd>
              </div>
              {quote.hops.length > 0 ? (
                <div>
                  <dt>Through</dt>
                  <dd>{quote.hops.join(" → ")}</dd>
                </div>
              ) : null}
            </dl>

          </>
        ) : quoting || restating ? (
          <p className="wa-quote-waiting">
            {restating ? "The terms changed. Updating the price…" : "Getting the live price from OKX DEX…"}
          </p>
        ) : (
          <p className="wa-quote-waiting">
            The stock is bought today and held in escrow. What vests is theirs; until you
            make the grant irrevocable, you can cancel the part that has not vested. Fill in
            the form to see exactly how much it will hold.
          </p>
        )}
      </aside>
    </div>
  );
}
