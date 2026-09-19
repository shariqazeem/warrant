"use client";

import {ChevronDown, Loader2} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {buildPayment, type BuiltPayment} from "@/app/pay/actions";
import {ASSETS, ISSUER_NOTE, defaultAsset} from "@/lib/assets";
import {STABLE} from "@/lib/chain";
import {settledUnitPrice, unitsFromRaw, usdt} from "@/lib/format";
import {singlePayRunId} from "@/lib/run-id";
import {QUOTE_FRESH_MS, freshness, quoteAge} from "@/lib/quote-age";
import {Connect} from "@/components/wallet/connect";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {usePay} from "./use-pay";
import "./pay.css";

/**
 * ONE FORM, ONE CONFIRM, ONE RECEIPT.
 *
 * The fields are ruled rows and the quote sits beside them, updating as the line changes.
 * The split is folded away, because most payments do not use it and a field nobody needs
 * is a field everyone reads.
 *
 * NOTHING ON THIS PAGE IS A NUMBER WARRANT MADE UP. The units, the floor and the route all
 * come from the aggregator's own answer, and the floor shown is the one the contract will
 * enforce — if the route moves further than that between signing and settling, the payment
 * reverts rather than delivering less.
 */
export function PayForm({payroll}: {payroll: `0x${string}` | undefined}) {
  const router = useRouter();
  const {isConnected} = useAccount();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(defaultAsset().address);
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);

  /**
   * A QUOTE BELONGS TO THE LINE IT WAS BUILT FOR.
   *
   * Held with the exact inputs that produced it, so an edit makes it stale INSTANTLY —
   * before the requote comes back. Without this, changing $100 to $60 leaves the $100
   * figures on screen with the button still live, and a payer who is quick pays the old
   * amount while reading the new one. The numbers and the button must never describe a
   * line that is not the one on screen.
   */
  const [quoted, setQuoted] = useState<{sig: string; value: BuiltPayment; at: number} | null>(null);
  /** Ticks so the age on screen stays true without the quote changing under it. */
  const [, setTick] = useState(0);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  /** Bumped to force a requote without changing a single field. */
  const [refreshAt, setRefreshAt] = useState(0);

  const {pay, phase, why, reset} = usePay(payroll);

  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();
  const usd = Number(amount);
  const cashUsd = splitOpen ? Number(cash || 0) : 0;
  const ready = recipient.length > 0 && usd > 0 && reason.trim().length > 0;

  const signature = JSON.stringify([recipient, usd, cashUsd, asset, reason.trim()]);
  /** The quote for THIS line, or nothing. A stale one is not a quote. */
  const quote = quoted?.sig === signature ? quoted.value : null;
  const restating = quoted !== null && quoted.sig !== signature;
  const age = quoted && quote ? freshness(quoted.at) : null;

  useTxToast(phase === "idle" ? "idle" : phase, `Pay ${usd > 0 ? usdt(BigInt(Math.round(usd * 1e6))) : ""}`.trim(), {
    detail: why ?? undefined,
  });

  // Quote as the line settles, not on every keystroke.
  // A PRICE IS A MOMENT. Left alone, this refreshes itself rather than letting the button
  // stay live on a quote from ten minutes ago. The contract would refuse to settle below
  // the floor anyway, so a stale quote costs a revert rather than money — but a revert in
  // front of an audience is its own kind of expensive.
  useEffect(() => {
    if (!quote) return;
    const tick = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(tick);
  }, [quote]);

  const seq = useRef(0);
  useEffect(() => {
    if (!ready) {
      setQuoted(null);
      setQuoteWhy(null);
      return;
    }
    const mine = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      const out = await buildPayment({recipient, usd, cashUsd, asset, reason});
      if (mine !== seq.current) return; // a later edit already won
      setQuoting(false);
      if (out.ok) {
        setQuoted({sig: signature, value: out.value, at: Date.now()});
        setQuoteWhy(null);
      } else {
        setQuoted(null);
        setQuoteWhy(out.why);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [ready, recipient, usd, cashUsd, asset, reason, signature, refreshAt]);

  const send = useCallback(async () => {
    if (!quote) return;
    const result = await pay(
      [quote.line],
      quote.asset,
      singlePayRunId(),
      BigInt(quote.totalStable),
    );
    if (result) router.push(`/receipt/${result.hash}`);
  }, [pay, quote, router]);

  // Re-price automatically once it is no longer fresh, while the payer is still reading.
  useEffect(() => {
    if (!quoted || quoting) return;
    const due = quoted.at + QUOTE_FRESH_MS - Date.now();
    const t = setTimeout(() => setRefreshAt(Date.now()), Math.max(1_000, due));
    return () => clearTimeout(t);
  }, [quoted, quoting]);

  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  const buttonWord =
    phase === "signing"
      ? "Waiting for your wallet"
      : phase === "confirming"
        ? "Confirming"
        : quote
          ? `Pay ${usdt(BigInt(quote.totalStable))}`
          : "Pay";

  return (
    <div className="wa-pay">
      <form
        className="wa-pay-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="wa-field">
          <span className="k">Who</span>
          <input
            className="wa-input wa-mono"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="wa-field">
          <span className="k">How much</span>
          <span className="wa-money">
            <span className="wa-money-sign">$</span>
            <input
              className="wa-input is-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="25"
              inputMode="decimal"
            />
            <span className="wa-money-unit">{STABLE.symbol}</span>
          </span>
        </label>

        <label className="wa-field">
          <span className="k">In what</span>
          <select className="wa-input" value={asset} onChange={(e) => setAsset(e.target.value as typeof asset)}>
            {ASSETS.map((a) => (
              <option key={a.address} value={a.address}>
                {a.symbol} — {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="wa-field">
          <span className="k">Why</span>
          <input
            className="wa-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Design review, week 38"
            maxLength={200}
          />
        </label>

        <div className="wa-fold">
          <button
            type="button"
            className="wa-fold-toggle"
            aria-expanded={splitOpen}
            onClick={() => setSplitOpen((v) => !v)}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={splitOpen ? "is-open" : ""} />
            Pay part as cash
          </button>
          {splitOpen ? (
            <label className="wa-field is-nested">
              <span className="k">Of which cash</span>
              <span className="wa-money">
                <span className="wa-money-sign">$</span>
                <input
                  className="wa-input is-amount"
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0"
                  inputMode="decimal"
                />
                <span className="wa-money-unit">stays {STABLE.symbol}</span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="wa-pay-act">
          {isConnected ? (
            <button type="submit" className="wa-btn is-primary" disabled={!quote || busy || age === "stale"}>
              {busy ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {buttonWord}
            </button>
          ) : (
            <Connect />
          )}
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
        {quoteWhy ? (
          <p className="wa-refusal">{quoteWhy}</p>
        ) : quote && quote.expectedOut !== "0" ? (
          <>
            <p className="wa-quote-lead">They receive</p>
            <p className="wa-units">
              {unitsFromRaw(BigInt(quote.expectedOut), chosen.decimals)}
              <span className="sym">{chosen.symbol}</span>
            </p>
            <dl className="wa-quote-rows">
              <div>
                <dt>At</dt>
                <dd>
                  {/*
                    NOT `?? 0`. A price that cannot be computed is not a price of zero, and
                    "$0.00 per whole SPYx" is a figure nothing can confirm — which is the
                    one thing no surface here is allowed to print.
                  */}
                  {(() => {
                    const price = settledUnitPrice(
                      BigInt(quote.line.stableAmount) - BigInt(quote.line.cashAmount),
                      BigInt(quote.expectedOut),
                      chosen.decimals,
                    );
                    return price === null
                      ? "not computable from this quote"
                      : `$${price.toFixed(2)} per whole ${chosen.symbol}`;
                  })()}
                </dd>
              </div>
              <div>
                <dt>At least</dt>
                <dd>
                  {unitsFromRaw(BigInt(quote.minOut), chosen.decimals)} {chosen.symbol}
                  <span className="wa-quote-aside">
                    the floor the contract enforces; below it the payment reverts
                  </span>
                </dd>
              </div>
              {BigInt(quote.line.cashAmount) > 0n ? (
                <div>
                  <dt>Stays cash</dt>
                  <dd>{usdt(BigInt(quote.line.cashAmount))}</dd>
                </div>
              ) : null}
              {quote.priceImpactPercent ? (
                <div>
                  <dt>Impact</dt>
                  <dd>{Math.abs(Number(quote.priceImpactPercent)).toFixed(2)}%</dd>
                </div>
              ) : null}
              {quote.hops.length > 0 ? (
                <div>
                  <dt>Through</dt>
                  <dd>{quote.hops.join(" → ")}</dd>
                </div>
              ) : null}
            </dl>
            {quoted ? (
              <p className={`wa-quote-age${age === "stale" ? " is-stale" : ""}`}>
                Priced {quoteAge(quoted.at)}
                {age === "stale" ? ", which is too long ago to sign. " : ". "}
                <button
                  type="button"
                  className="wa-linkish"
                  onClick={() => setRefreshAt(Date.now())}
                  disabled={quoting}
                >
                  {quoting ? "Repricing…" : "Reprice"}
                </button>
              </p>
            ) : null}
            <p className="wa-quote-issuer">
              {chosen.symbol} — {ISSUER_NOTE}
            </p>
          </>
        ) : quote ? (
          <>
            <p className="wa-quote-lead">They receive</p>
            <p className="wa-units">
              {usdt(BigInt(quote.line.cashAmount))}
              <span className="sym">{STABLE.symbol}</span>
            </p>
            <p className="wa-quote-aside">
              All of it stays cash, so no route is built and nothing is bought.
            </p>
          </>
        ) : quoting || restating ? (
          <p className="wa-quote-waiting">
            {restating ? "The line changed. Repricing…" : "Asking the aggregator for a route…"}
          </p>
        ) : (
          <p className="wa-quote-waiting">
            A live quote appears here once there is an address, an amount and a reason.
            Nothing is shown before that, because there would be nothing real to show.
          </p>
        )}
      </aside>
    </div>
  );
}
