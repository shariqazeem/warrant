"use client";

import {ChevronDown, Loader2} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {buildGrant, type BuiltGrant} from "@/app/grants/actions";
import {MAX_TIP_BPS} from "@/lib/grant-terms";
import {ASSETS, ISSUER_NOTE, defaultAsset} from "@/lib/assets";
import {STABLE} from "@/lib/chain";
import {settledUnitPrice, unitsFromRaw, usdt} from "@/lib/format";
import {humanDuration} from "@/lib/schedule";
import {Connect} from "@/components/wallet/connect";
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
  {label: "No cliff", seconds: 0},
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
  const {isConnected} = useAccount();

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
  const [quoting, setQuoting] = useState(false);

  const {open, phase, why, reset} = useOpenGrant(escrow);

  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();
  const usd = Number(amount);
  const ready = beneficiary.length > 0 && usd > 0 && reason.trim().length > 0;

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
      setQuoted(null);
      setQuoteWhy(null);
      return;
    }
    const mine = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      const out = await buildGrant({
        beneficiary,
        asset,
        usd,
        cliffSeconds,
        durationSeconds,
        tipBps,
        reason,
      });
      if (mine !== seq.current) return;
      setQuoting(false);
      if (out.ok) {
        setQuoted({sig: signature, value: out.value});
        setQuoteWhy(null);
      } else {
        setQuoted(null);
        setQuoteWhy(out.why);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [ready, beneficiary, usd, asset, cliffSeconds, durationSeconds, tipBps, reason, signature]);

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
        <label className="wa-field">
          <span className="k">To</span>
          <input
            className="wa-input wa-mono"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="wa-field">
          <span className="k">Worth</span>
          <span className="wa-money">
            <span className="wa-money-sign">$</span>
            <input
              className="wa-input is-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="12000"
              inputMode="decimal"
            />
            <span className="wa-money-unit">of {chosen.symbol}, bought now</span>
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
          <span className="k">With a cliff of</span>
          <select className="wa-input" value={cliffSeconds} onChange={(e) => setCliff(Number(e.target.value))}>
            {CLIFFS.filter((c) => c.seconds <= durationSeconds).map((c) => (
              <option key={c.seconds} value={c.seconds}>
                {c.label}
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
            placeholder="Founding engineer, four year grant"
            maxLength={200}
          />
        </label>

        <div className="wa-fold">
          <button
            type="button"
            className="wa-fold-toggle"
            aria-expanded={keeperOpen}
            onClick={() => setKeeperOpen((v) => !v)}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={keeperOpen ? "is-open" : ""} />
            The keeper&rsquo;s share
          </button>
          {keeperOpen ? (
            <>
              <label className="wa-field is-nested">
                <span className="k">Of each release</span>
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
                Anyone may release what is due on this grant, and whoever does is paid this
                share of it. That is what makes the grant vest whether or not anyone
                remembers. The beneficiary pays nothing to release it themselves, and the
                total ever paid to keepers cannot exceed this share of the grant.
              </p>
            </>
          ) : null}
        </div>

        <div className="wa-pay-act">
          {isConnected ? (
            <button type="submit" className="wa-btn is-primary" disabled={!quote || busy}>
              {busy ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {phase === "signing"
                ? "Waiting for your wallet"
                : phase === "confirming"
                  ? "Confirming"
                  : quote
                    ? `Open a ${humanDuration(durationSeconds)} grant, ${usdt(BigInt(quote.terms.stableAmount))}`
                    : "Open the grant"}
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
        ) : quote ? (
          <>
            <p className="wa-quote-lead">The escrow buys and holds</p>
            <p className="wa-units">
              {unitsFromRaw(BigInt(quote.expectedUnits), chosen.decimals)}
              <span className="sym">{chosen.symbol}</span>
            </p>
            <dl className="wa-quote-rows">
              <div>
                <dt>At</dt>
                {/* A price that cannot be computed is not zero. See the note in pay-form. */}
                <dd>
                  {price === null
                    ? "not computable from this quote"
                    : `$${price.toFixed(2)} per whole ${chosen.symbol}`}
                </dd>
              </div>
              <div>
                <dt>At least</dt>
                <dd>
                  {unitsFromRaw(BigInt(quote.minUnits), chosen.decimals)} {chosen.symbol}
                  <span className="wa-quote-aside">
                    below this the grant is not opened at all
                  </span>
                </dd>
              </div>
              <div>
                <dt>First vests</dt>
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
            <p className="wa-quote-issuer">
              {chosen.symbol} — {ISSUER_NOTE}
            </p>
          </>
        ) : quoting || restating ? (
          <p className="wa-quote-waiting">
            {restating ? "The terms changed. Repricing…" : "Asking the aggregator for a route…"}
          </p>
        ) : (
          <p className="wa-quote-waiting">
            A grant buys its asset once, now, and holds it in an escrow you cannot reach
            into. What it would buy appears here once there is someone to grant to, an
            amount and a reason.
          </p>
        )}
      </aside>
    </div>
  );
}
