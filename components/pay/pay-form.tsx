"use client";

import {ChevronDown, Loader2} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {buildPayment, type BuiltPayment} from "@/app/pay/actions";
import {syncFromChain} from "@/app/sync/actions";
import {ASSETS, defaultAsset} from "@/lib/assets";
import {STABLE} from "@/lib/chain";
import {parseMoney} from "@/lib/csv";
import {held, type Outcome} from "@/lib/outcome";
import {checkLine, impactText} from "@/lib/payment";
import {settledUnitPrice, unitsFromRaw, usdt} from "@/lib/format";
import {singlePayRunId} from "@/lib/run-id";
import {QUOTE_FRESH_MS, QUOTE_LOST, freshness, quoteAge} from "@/lib/quote-age";
import {WalletPanel} from "@/components/wallet/wallet-panel";
import {NEEDS_OKB, useWallet} from "@/components/wallet/use-wallet";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {AssetNote} from "./asset-note";
import {usePay} from "./use-pay";
import "./pay.css";

/**
 * PAY ONE PERSON.
 *
 * Laid out the way a money transfer is: what you send, what they receive, what it costs,
 * and one button that always says what it will do — or exactly what is stopping it. The
 * earlier version disabled the button without saying why, and a greyed button with no
 * reason is how a product feels broken even when it is working.
 *
 * Nothing on this page is a number Warrant made up. The amount they receive, the price,
 * the price impact and the minimum all come from the aggregator's own answer, and the
 * minimum is enforced by the contract: below it the payment is cancelled and no USDT
 * leaves the payer's wallet.
 */
export function PayForm({payroll}: {payroll: `0x${string}` | undefined}) {
  const router = useRouter();
  const wallet = useWallet();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(defaultAsset().address);
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);

  const [quoted, setQuoted] = useState<{sig: string; value: BuiltPayment; at: number} | null>(null);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  /** The price request itself failed — it never came back — rather than being refused. */
  const [quoteLost, setQuoteLost] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [refreshAt, setRefreshAt] = useState(0);
  const [, setTick] = useState(0);

  const {pay, phase, why, reset} = usePay(payroll);

  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();
  // Read the way a file's amounts are read: a comma only between thousands, so "2,50" is
  // refused rather than becoming $250.
  const amountRead = amount.trim() === "" ? null : parseMoney(amount);
  const usd = amountRead?.ok ? amountRead.value : 0;
  const cashRead = splitOpen && cash.trim() !== "" ? parseMoney(cash) : null;
  const cashUsd = cashRead?.ok ? cashRead.value : 0;
  /** An amount that was typed but cannot be read — said as a refusal, not a hint. */
  const typedWrong =
    amountRead !== null && !amountRead.ok
      ? amountRead.why
      : cashRead !== null && !cashRead.ok
        ? cashRead.why
        : null;

  // What is missing, in the order a person fills the form in.
  const missing: string | null =
    recipient.trim().length === 0
      ? "Add their wallet address"
      : amountRead !== null && !amountRead.ok
        ? amountRead.why
        : !(usd > 0)
          ? "Enter an amount"
          : reason.trim().length === 0
            ? "Add a note for their receipt"
            : cashRead !== null && !cashRead.ok
              ? cashRead.why
              : null;

  // What can be decided without asking anyone is decided here, by the same function the
  // server runs, so a mistyped address is named at once and never sent for a price.
  const checked = missing ? null : checkLine({recipient, usd, cashUsd, asset, reason});
  const lineWhy = checked && !checked.ok ? checked.why : null;

  // A QUOTE BELONGS TO THE INPUTS THAT PRODUCED IT, NOT TO THE CLOCK. An edit makes it
  // stale instantly; a timed refresh does not — the old price stays on screen, and the
  // button stays live, until the new one lands. Only age can retire a quote whose inputs
  // still match, and `age` below is what does that.
  const signature = JSON.stringify([recipient, usd, cashUsd, asset, reason.trim()]);
  const quote = quoted?.sig === signature ? quoted.value : null;
  const age = quoted && quote ? freshness(quoted.at) : null;

  useTxToast(phase === "idle" ? "idle" : phase, `Pay ${usd > 0 ? usdt(BigInt(Math.round(usd * 1e6))) : ""}`.trim(), {
    detail: why ?? undefined,
  });

  // Keep the age on screen true.
  useEffect(() => {
    if (!quote) return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [quote]);

  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  // Once paid, this quote is spent. The button stays down while the receipt opens and never
  // falls back to "Pay $X" on the same price.
  const paid = phase === "done";
  // While a payment is in flight or done, the form shows exactly what is being paid.
  const locked = busy || paid;

  // Ask for a price once the line is complete, not on every keystroke.
  const seq = useRef(0);
  useEffect(() => {
    if (missing || lineWhy) {
      // Anything still in flight was asked for inputs that no longer stand; drop it.
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
      let out: Outcome<BuiltPayment>;
      let lost = false;
      try {
        out = await buildPayment({recipient, usd, cashUsd, asset, reason});
      } catch {
        // The request never came back: the connection dropped or the server failed. That
        // is not a refusal, and it must not leave "Getting the price…" on screen for ever.
        out = held(QUOTE_LOST);
        lost = true;
      }
      if (mine !== seq.current) return;
      setQuoting(false);
      setQuoteLost(lost);
      if (out.ok) {
        setQuoted({sig: signature, value: out.value, at: Date.now()});
        setQuoteWhy(null);
      } else {
        setQuoted(null);
        setQuoteWhy(out.why);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [missing, lineWhy, recipient, usd, cashUsd, asset, reason, signature, refreshAt]);

  // A price is a moment. Refresh it before it goes stale while the payer is reading — but
  // not once it has been paid; that price is finished.
  useEffect(() => {
    if (!quoted || quoting || paid) return;
    const due = quoted.at + QUOTE_FRESH_MS - Date.now();
    const t = setTimeout(() => setRefreshAt(Date.now()), Math.max(1_000, due));
    return () => clearTimeout(t);
  }, [quoted, quoting, paid]);

  const total = quote ? BigInt(quote.totalStable) : BigInt(Math.round((usd > 0 ? usd : 0) * 1e6));

  const send = useCallback(async () => {
    if (!quote) return;
    const result = await pay([quote.line], quote.asset, singlePayRunId(), BigInt(quote.totalStable));
    if (result) {
      // The receipt reads its own transaction, so it is true the moment it opens: go there
      // first. Bringing the company page and the tape up to date follows without holding
      // the payer here, and a sync that fails costs nothing — the indexer catches up.
      router.push(`/receipt/${result.hash}`);
      void syncFromChain().catch(() => undefined);
    }
  }, [pay, quote, router]);

  // THE BUTTON ALWAYS SAYS WHAT IT WILL DO, OR WHAT IS STOPPING IT.
  const blocker: string | null =
    wallet.status === "disconnected" || wallet.status === "connecting"
      ? "Connect a wallet to pay"
      : wallet.status === "wrong-chain"
        ? "Switch to X Layer to pay"
        : wallet.noGas
          ? NEEDS_OKB
          : missing
            ? missing
            : lineWhy
              ? "Fix the problem above"
              : quoteLost
                ? "Could not get the price — try again"
                : quoteWhy
                  ? "Fix the problem above"
                  : !quote
                    ? "Getting the price…"
                    : age === "stale"
                      ? "Price is out of date — refresh it"
                      : wallet.usdt !== undefined && wallet.usdt < total
                        ? `Not enough USDT — you have ${usdt(wallet.usdt)}`
                        : null;

  const label = paid
    ? "Paid — opening the receipt…"
    : phase === "signing"
      ? "Confirm in your wallet…"
      : phase === "confirming"
        ? "Sending…"
        : phase === "building"
          ? "Preparing…"
          : (blocker ?? `Pay ${usdt(total)}`);

  const price =
    quote && quote.expectedOut !== "0"
      ? settledUnitPrice(
          BigInt(quote.line.stableAmount) - BigInt(quote.line.cashAmount),
          BigInt(quote.expectedOut),
          chosen.decimals,
        )
      : null;

  return (
    <div className="wa-pay">
      <form
        className="wa-pay-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocker && !locked) void send();
        }}
      >
        <WalletPanel need={quote ? total : undefined} />

        <label className="wa-field">
          <span className="k">Their wallet</span>
          <span className="wa-field-v">
            <input
              className="wa-input wa-mono"
              value={recipient}
              disabled={locked}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x… their X Layer address"
              spellCheck={false}
              autoComplete="off"
            />
          </span>
        </label>

        <label className="wa-field">
          <span className="k">Amount</span>
          <span className="wa-money">
            <span className="wa-money-sign">$</span>
            <input
              className="wa-input is-amount"
              value={amount}
              disabled={locked}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0"
              inputMode="decimal"
            />
            <span className="wa-money-unit">paid in USDT</span>
          </span>
        </label>

        <label className="wa-field">
          <span className="k">They receive</span>
          <span className="wa-field-v">
            <select
              className="wa-input"
              value={asset}
              disabled={locked}
              onChange={(e) => setAsset(e.target.value as typeof asset)}
            >
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
          <span className="k">Note</span>
          <span className="wa-field-v">
            <input
              className="wa-input"
              value={reason}
              disabled={locked}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Design review, week 38"
              maxLength={200}
            />
            <span className="wa-field-help">Shown on their receipt. Required.</span>
          </span>
        </label>

        <div className="wa-fold">
          <button
            type="button"
            className="wa-fold-toggle"
            aria-expanded={splitOpen}
            disabled={locked}
            onClick={() => setSplitOpen((v) => !v)}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={splitOpen ? "is-open" : ""} />
            Pay part of it as USDT instead
          </button>
          {splitOpen ? (
            <label className="wa-field is-nested">
              <span className="k">Keep as USDT</span>
              <span className="wa-money">
                <span className="wa-money-sign">$</span>
                <input
                  className="wa-input is-amount"
                  value={cash}
                  disabled={locked}
                  onChange={(e) => setCash(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0"
                  inputMode="decimal"
                />
                <span className="wa-money-unit">the rest becomes {chosen.symbol}</span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="wa-pay-act">
          <button
            type="submit"
            className={`wa-btn is-primary is-wide${blocker && !locked ? " is-blocked" : ""}`}
            disabled={Boolean(blocker) || locked}
          >
            {locked ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
            {label}
          </button>
          {phase === "failed" && why ? (
            <p className="wa-refusal">
              {why}{" "}
              <button type="button" className="wa-linkish" onClick={reset}>
                Try again
              </button>
            </p>
          ) : null}
          <p className="wa-fine">
            One signature approves and pays in a single transaction. Warrant never holds
            the money.
          </p>
        </div>
      </form>

      <aside className="wa-quote" aria-live="polite">
        <p className="wa-quote-title">Summary</p>

        <dl className="wa-sum">
          <div>
            <dt>You send</dt>
            <dd className="wa-mono">{usd > 0 ? usdt(total) : "—"} <span className="u">USDT</span></dd>
          </div>
          <div className="is-big">
            <dt>They receive</dt>
            <dd className="wa-mono">
              {quote && quote.expectedOut !== "0" ? (
                <>
                  {unitsFromRaw(BigInt(quote.expectedOut), chosen.decimals)} <span className="u">{chosen.symbol}</span>
                </>
              ) : quote ? (
                <>
                  {usdt(BigInt(quote.line.cashAmount))} <span className="u">USDT</span>
                </>
              ) : (
                "—"
              )}
            </dd>
            {quote && BigInt(quote.line.cashAmount) > 0n && quote.expectedOut !== "0" ? (
              <dd className="wa-sum-plus wa-mono">+ {usdt(BigInt(quote.line.cashAmount))} USDT</dd>
            ) : null}
          </div>
        </dl>

        {lineWhy ? (
          <p className="wa-refusal">{lineWhy}</p>
        ) : quoteWhy ? (
          // A refusal from the price service can pass — a busy minute, a thin market that
          // refills — so it can always be asked again with the same inputs.
          <p className="wa-refusal">
            {quoteWhy}{" "}
            <button
              type="button"
              className="wa-linkish"
              disabled={quoting || locked}
              onClick={() => setRefreshAt(Date.now())}
            >
              {quoting ? "Trying again…" : "Try again"}
            </button>
          </p>
        ) : quote && quote.expectedOut !== "0" ? (
          <dl className="wa-quote-rows">
            <div>
              <dt>Price</dt>
              <dd>{price === null ? "not available" : `1 ${chosen.symbol} = $${price.toFixed(2)}`}</dd>
            </div>
            {/* The aggregator's own figure. When it gives none, the row is left out rather
                than showing a zero it never said. */}
            {quote.priceImpactPercent !== null ? (
              <div>
                <dt>Price impact</dt>
                <dd>{impactText(quote.priceImpactPercent)}</dd>
              </div>
            ) : null}
            <div>
              <dt>At least</dt>
              <dd>
                {unitsFromRaw(BigInt(quote.minOut), chosen.decimals)} {chosen.symbol} — the
                contract refuses less
                <span className="wa-quote-aside">
                  If the price moves and they would get less, the payment is cancelled and no
                  USDT leaves your wallet.
                </span>
              </dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>
                Best price via OKX DEX
                {quote.hops.length > 0 ? (
                  <span className="wa-quote-aside">{quote.hops.join(" → ")}</span>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="wa-quote-waiting">
            {missing
              ? missing === typedWrong
                ? `${missing}.`
                : `${missing} to see what they will receive.`
              : quoting
                ? "Getting the live price from OKX DEX…"
                : ""}
          </p>
        )}

        {quoted && quote ? (
          <p className={`wa-quote-age${age === "stale" ? " is-stale" : ""}`}>
            Price from {quoteAge(quoted.at)}.{" "}
            <button
              type="button"
              className="wa-linkish"
              onClick={() => setRefreshAt(Date.now())}
              disabled={quoting || locked}
            >
              {quoting ? "Refreshing…" : "Refresh"}
            </button>
          </p>
        ) : null}

        <p className="wa-quote-foot">
          {STABLE.symbol} and {chosen.symbol} on X Layer. Network fees are paid in OKB and
          are typically a fraction of a cent.
        </p>
      </aside>
    </div>
  );
}
