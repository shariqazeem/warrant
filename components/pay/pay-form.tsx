"use client";

import {ChevronDown, Loader2} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {buildPayment, type BuiltPayment, readChoices, type ChoiceView} from "@/app/pay/actions";
import {syncFromChain} from "@/app/sync/actions";
import {choiceLine} from "@/components/link/pay-link";
import {STALE_PAGE, isStaleBuild} from "@/components/app/report";
import {ASSETS, assetByAddress, defaultAsset} from "@/lib/assets";
import {STABLE} from "@/lib/chain";
import {parseMoney} from "@/lib/csv";
import {held, type Outcome} from "@/lib/outcome";
import {checkLine, impactText} from "@/lib/payment";
import {settledUnitPrice, unitsFromRaw, usdt, dateUTC} from "@/lib/format";
import {singlePayRunId} from "@/lib/run-id";
import {QUOTE_FRESH_MS, QUOTE_LOST, freshness, quoteAge} from "@/lib/quote-age";
import {WalletPanel} from "@/components/wallet/wallet-panel";
import {NEEDS_OKB, useWallet} from "@/components/wallet/use-wallet";
import {ceilCents, STABLE_NAME} from "@/lib/grant-terms";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {AssetNote} from "./asset-note";
import {usePay} from "./use-pay";
import "./pay.css";
import {zeroAddress} from "viem";

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
 *
 * WITH `to`, THE RECIPIENT IS FIXED: a person's pay link (`/@0x…`) or `/pay?to=0x…`. The
 * form shows who is being paid instead of asking, and there is no field that could send the
 * payment anywhere else. Everything else — the quote, the blockers, the permit or the
 * approval, the receipt — is the same form.
 */

/** A recipient the page has already settled: the person whose pay link this is. */
export type FixedRecipient = {
  /** Their wallet. The page checks it (lib/payment.ts, checkAddress) before fixing it,
   *  because the payer cannot correct it here. */
  address: `0x${string}`;
  /** Their signed choice as the page read it, so the form opens on it rather than on the
   *  stock picker. null: they have none. Left out: looked up, as for a typed address. */
  choice?: ChoiceView | null;
};

export function PayForm({payroll, to}: {payroll: `0x${string}` | undefined; to?: FixedRecipient}) {
  const router = useRouter();
  const wallet = useWallet();

  const [typed, setTyped] = useState("");
  // A fixed recipient is read from the prop on every render, never from state: nothing the
  // payer does on this form can point the payment at another wallet.
  const recipient = to ? to.address : typed;
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
  /** The person's signed choice: undefined until looked up, null when they have none. A page
   *  that fixed the recipient may already have read it. */
  const [their, setTheir] = useState<ChoiceView | null | undefined>(to?.choice);
  const [, setTick] = useState(0);

  const {pay, phase, why, note, reset} = usePay(payroll);

  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();
  // The stock they chose, when Warrant still lists it. A choice naming one since taken off the
  // list says so in its words (choiceLine), and has no note to open.
  const theirStock = their?.asset ? assetByAddress(their.asset) : undefined;

  // WHO DECIDES THE SPLIT. Look up the person as soon as the address is whole: if they have
  // signed a choice, it is what they get, and the stock picker below is not the payer's to use.
  // Asked again even when the page read it, since a page can be seconds old — but a lookup
  // that fails is not an answer, so it never replaces the page's reading with "no choice".
  const pageRead = to?.choice !== undefined;
  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      setTheir(undefined);
      return;
    }
    let live = true;
    readChoices([recipient])
      .then((m) => {
        if (live) setTheir(m[recipient.toLowerCase()] ?? null);
      })
      .catch(() => {
        if (live && !pageRead) setTheir(null);
      });
    return () => {
      live = false;
    };
  }, [recipient, pageRead]);
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
  const signature = JSON.stringify([recipient, usd, cashUsd, asset, reason.trim(), their?.issuedAt ?? null]);
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
      } catch (err) {
        // The request never came back: the connection dropped or the server failed. That
        // is not a refusal, and it must not leave "Getting the price…" on screen for ever.
        // A tab older than the site can never get a price until it reloads, so it says so.
        out = held(isStaleBuild(err) ? STALE_PAGE : QUOTE_LOST);
        lost = !isStaleBuild(err);
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
    const result = await pay([quote.line], singlePayRunId(), BigInt(quote.totalStable));
    if (result) {
      // The receipt reads its own transaction, so it is true the moment it opens: go there
      // first. Bringing the company page and the tape up to date follows without holding
      // the payer here, and a sync that fails costs nothing — the indexer catches up.
      router.push(`/receipt/${result.hash}`);
      void syncFromChain(result.hash).catch(() => undefined);
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
                        ? `Top up ${ceilCents(total - wallet.usdt)} ${STABLE_NAME}`
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

  // What this payment actually buys: their choice when they made one, the picker otherwise.
  // Before a price arrives, a known choice already names the stock.
  const bought =
    quote && quote.asset !== zeroAddress
      ? (ASSETS.find((a) => a.address.toLowerCase() === quote.asset.toLowerCase()) ?? chosen)
      : (theirStock ?? chosen);

  const price =
    quote && quote.expectedOut !== "0"
      ? settledUnitPrice(
          BigInt(quote.line.stableAmount) - BigInt(quote.line.cashAmount),
          BigInt(quote.expectedOut),
          bought.decimals,
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
        <WalletPanel need={quote ? total : undefined} purpose="make this payment" />

        {to ? (
          // Fixed by the page: who is being paid, shown in full rather than asked for.
          <div className="wa-field">
            <span className="k">Their wallet</span>
            <span className="wa-field-v">
              <span className="wa-fixed-to wa-mono">{to.address}</span>
            </span>
          </div>
        ) : (
          <label className="wa-field">
            <span className="k">Their wallet</span>
            <span className="wa-field-v">
              <input
                className="wa-input wa-mono"
                value={typed}
                disabled={locked}
                onChange={(e) => setTyped(e.target.value.trim())}
                placeholder="0x… their X Layer address"
                spellCheck={false}
                autoComplete="off"
              />
            </span>
          </label>
        )}

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
            <span className="wa-money-unit">paid in USD₮0</span>
          </span>
        </label>

        {their ? (
          <div className="wa-field">
            <span className="k">They chose</span>
            <span className="wa-field-v">
              <span className="wa-their-choice">{choiceLine(their)}</span>
              <span className="wa-field-help">
                Signed by them on {dateUTC(their.issuedAt)}. Every payment to them follows it, so
                there is nothing for you to pick.
              </span>
              {theirStock ? <AssetNote symbol={theirStock.symbol} name={theirStock.name} /> : null}
            </span>
          </div>
        ) : (
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
              {their === null ? (
                <span className="wa-field-help">
                  They haven&rsquo;t chosen how they&rsquo;re paid yet, so you decide for this
                  payment. They can choose any time at warrant.world/me.
                </span>
              ) : null}
              <AssetNote symbol={chosen.symbol} name={chosen.name} />
            </span>
          </label>
        )}

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

        {their ? null : (
        <div className="wa-fold">
          <button
            type="button"
            className="wa-fold-toggle"
            aria-expanded={splitOpen}
            disabled={locked}
            onClick={() => setSplitOpen((v) => !v)}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={splitOpen ? "is-open" : ""} />
            Pay part of it as USD₮0 instead
          </button>
          {splitOpen ? (
            <label className="wa-field is-nested">
              <span className="k">Keep as USD₮0</span>
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
        )}

        <div className="wa-pay-act">
          <button
            type="submit"
            className={`wa-btn is-primary is-wide${blocker && !locked ? " is-blocked" : ""}`}
            disabled={Boolean(blocker) || locked}
          >
            {locked ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
            {label}
          </button>
          {note && busy ? <p className="wa-fine">{note}</p> : null}
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
            <dd className="wa-mono">{usd > 0 ? usdt(total) : "—"} <span className="u">USD₮0</span></dd>
          </div>
          <div className="is-big">
            <dt>They receive</dt>
            <dd className="wa-mono">
              {quote && quote.expectedOut !== "0" ? (
                <>
                  {unitsFromRaw(BigInt(quote.expectedOut), bought.decimals)} <span className="u">{bought.symbol}</span>
                </>
              ) : quote ? (
                <>
                  {usdt(BigInt(quote.line.cashAmount))} <span className="u">USD₮0</span>
                </>
              ) : (
                "—"
              )}
            </dd>
            {quote && BigInt(quote.line.cashAmount) > 0n && quote.expectedOut !== "0" ? (
              <dd className="wa-sum-plus wa-mono">+ {usdt(BigInt(quote.line.cashAmount))} USD₮0</dd>
            ) : null}
          </div>
        </dl>
        {quote ? (
          <p className="wa-quote-aside wa-whose">
            {quote.tooSmall
              ? "Their stock share of this payment is under $0.50, too small to buy, so it is paid in dollars."
              : quote.decidedBy === "their-choice"
                ? "Split the way they chose."
                : "Split the way you chose, because they haven't chosen yet."}
          </p>
        ) : null}

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
              <dd>{price === null ? "not available" : `1 ${bought.symbol} = $${price.toFixed(2)}`}</dd>
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
                {unitsFromRaw(BigInt(quote.minOut), bought.decimals)} {bought.symbol} — the
                contract refuses less
                <span className="wa-quote-aside">
                  If the price moves and they would get less, the payment is cancelled and no
                  USD₮0 leaves your wallet.
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
          {STABLE_NAME} and {bought.symbol} on X Layer. Network fees are paid in OKB and
          are typically a fraction of a cent.
        </p>
      </aside>
    </div>
  );
}
