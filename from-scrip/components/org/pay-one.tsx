"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { bps, units as fmtUnits, usd } from "@/lib/format";
import { MAX_REASON_LEN } from "@/lib/intake/memo";
import { findAccount, fromBase64, signAndSend } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * PAY ONE — a handle or an address, an amount, the split, a reason. The stock part becomes
 * their register's asset with a receipt; the cash part lands as USDC at their address in the
 * same transaction. One signature.
 */
type Built = {
  transactionBase64: string;
  releaseId: string;
  mode: "pay" | "gift";
  to: { owner: string; handle: string | null; hasBook: boolean };
  asset: { symbol: string; decimals: number };
  stockUsdc: string;
  cashUsdc: string;
  quote: { outAmountRaw: string; minOutRaw: string; impliedPrice: number; priceImpactPct: string };
  error?: string;
};

export function PayOne({ owner, cluster, site }: { owner: string; cluster: string; site: string }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [stockPct, setStockPct] = useState(100);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Built | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "quoting" | "signing" | "confirming" | "done">("idle");
  const [done, setDone] = useState<{ sig: string; mode: "pay" | "gift"; releaseId: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dollars = Number(amount);
  // The same words as the button, where a person can still see them after scrolling away.
  useTxToast(why ? "failed" : phase === "quoting" ? "building" : phase, dollars > 0 ? `Pay ${usd(dollars)}` : "Pay in stock", { href: done ? `/receipt/${done.sig}` : undefined, detail: why ?? undefined });
  const valid = Number.isFinite(dollars) && dollars >= 1 && to.trim().length >= 3;

  async function build(): Promise<Built | null> {
    const res = await fetch("/api/org/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: to.trim(), dollars, stockBps: stockPct * 100, reason }) });
    const j = (await res.json()) as Built;
    if (!res.ok) {
      setWhy(j.error ?? "Could not build the payment.");
      return null;
    }
    setWhy(null);
    return j;
  }

  // A preview as the form settles: who, what lands, what stays cash.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!valid) {
      setPreview(null);
      return;
    }
    setPhase("quoting");
    timer.current = setTimeout(async () => {
      const b = await build();
      setPreview(b);
      setPhase("idle");
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, amount, stockPct, reason]);

  async function pay() {
    const found = findAccount(owner);
    if (!found) {
      setWhy("The wallet that signed in is not connected in this browser.");
      return;
    }
    setPhase("quoting");
    const b = await build();
    if (!b) {
      setPhase("idle");
      return;
    }
    setPhase("signing");
    const sig = await signAndSend(found.wallet, found.account, fromBase64(b.transactionBase64), cluster);
    if (!sig.ok) {
      setPhase("idle");
      if (sig.why) setWhy(sig.why);
      return;
    }
    setPhase("done");
    setDone({ sig: sig.value, mode: b.mode, releaseId: b.releaseId });
    if (b.mode === "pay") setTimeout(() => router.push(`/receipt/${sig.value}`), 2_500);
  }

  const stockUnits = preview ? Number(preview.quote.outAmountRaw) / 10 ** preview.asset.decimals : 0;

  return (
    <div className="sp-org-two">
      <form
        className="sp-org-form"
        onSubmit={(e) => {
          e.preventDefault();
          void pay();
        }}
      >
        <div className="sp-field">
          <label className="sp-label" htmlFor="to">
            To
          </label>
          <input id="to" className="sp-input is-mono" placeholder="@handle, or an address" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
          <p className="sp-hint">A handle with a register receives it now. An address with no register gets a claim link and a first share waiting.</p>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="amount">
            Amount, in USDC
          </label>
          <div className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input id="amount" className="sp-input is-mono" inputMode="decimal" placeholder="200" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </div>
        <div className="sp-field sp-split">
          <span className="sp-label">The split</span>
          <div className="sp-split-row">
            <input type="range" min={1} max={100} step={1} value={stockPct} className="sp-range" onChange={(e) => setStockPct(Number(e.target.value))} aria-label="Share paid in stock" />
            <span className="mono">{stockPct}%</span>
          </div>
          <p className="sp-split-line">
            <span>{valid ? usd((dollars * stockPct) / 100) : "$0"} in stock</span>
            <span>{valid ? usd(dollars - (dollars * stockPct) / 100) : "$0"} in USDC</span>
          </p>
          <p className="sp-hint">All in stock, or a slice; the rest lands as USDC at their address in the same transaction. If they have a rule, their rule may take its own slice of the cash part.</p>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="reason">
            For what <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(optional, on the receipt forever)</span>
          </label>
          <input id="reason" className="sp-input" placeholder="September retainer" value={reason} maxLength={MAX_REASON_LEN} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="sp-actions">
          <button type="submit" className="sp-action is-primary is-big" disabled={!valid || !preview || phase === "signing" || phase === "confirming" || phase === "done"}>
            {phase === "signing" ? "Waiting for your wallet…" : phase === "done" ? "Paid" : valid ? `Pay ${usd(dollars)}` : "Pay"}
          </button>
        </div>
        {why ? (
          <p className="sp-why is-err">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
          </p>
        ) : null}
        {done ? (
          <p className="sp-why is-ok">
            <Check size={14} strokeWidth={2} aria-hidden />{" "}
            {done.mode === "pay" ? "Paid. Opening the receipt…" : (
              <>
                Paid into escrow. Their claim link: <span className="mono">{`${site}/claim/${owner}/${done.releaseId}`}</span>
              </>
            )}
          </p>
        ) : null}
      </form>

      <aside className="sp-quote" aria-live="polite">
        <div className="sp-quote-head">What lands</div>
        {preview ? (
          <>
            <div className="sp-quote-units">
              {fmtUnits(stockUnits)}
              <span className="sym">{preview.asset.symbol}</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">To</span>
              <span className="v">{preview.to.handle ? `@${preview.to.handle}` : `${preview.to.owner.slice(0, 6)}…`}</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">In stock</span>
              <span className="v">{usd(Number(preview.stockUsdc) / 1e6)} at {usd(preview.quote.impliedPrice)} per unit</span>
            </div>
            {Number(preview.cashUsdc) > 0 ? (
              <div className="sp-quote-row">
                <span className="k">In USDC</span>
                <span className="v">{usd(Number(preview.cashUsdc) / 1e6)} to their address</span>
              </div>
            ) : null}
            <div className="sp-quote-row">
              <span className="k">Lands</span>
              <span className="v">{preview.to.hasBook ? "now, with a receipt" : "in escrow; they claim it"}</span>
            </div>
            <div className="sp-quote-row">
              <span className="k">Price impact</span>
              <span className="v">{(Number(preview.quote.priceImpactPct) * 100).toFixed(2)}%</span>
            </div>
          </>
        ) : (
          <div className="sp-quote-units is-waiting">{phase === "quoting" ? "Quoting…" : "A handle and an amount, and the quote appears."}</div>
        )}
        <div className="sp-quote-foot">Split {bps(stockPct * 100)} in stock. Slippage 0.5%; a route moving the price more than 1% is refused. You never hold the stock; it lands in their account.</div>
      </aside>
    </div>
  );
}
