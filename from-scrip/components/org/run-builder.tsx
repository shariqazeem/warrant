"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { usd } from "@/lib/format";
import { findAccount, fromBase64, signAll, toBase64 } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * A RUN — paste lines, review, sign once, watch the receipts land. Each line is one
 * transaction sharing a run id; the wallet signs them all in one prompt; this sends them in
 * order and shows each signature. Lines that cannot be built are shown and skipped.
 *
 *     handle-or-address, amount, stock%, reason
 *     @amina, 200, 100, September retainer
 *     7xKp…3f9a, 50, 25, bounty: docs page
 */
type Line = { to: string; owner: string | null; handle: string | null; hasBook: boolean; dollars: number; stockBps: number; reason: string; transactionBase64: string | null; releaseId: string | null; mode: "pay" | "gift" | null; error: string | null; units: string | null; symbol: string | null };
type Review = { runId: string; label: string; lines: Line[] };

function parse(text: string): Array<{ to: string; dollars: number; stockBps: number; reason: string }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const parts = l.split(",").map((p) => p.trim());
      const to = (parts[0] ?? "").replace(/^@/, "");
      const dollars = Number(parts[1] ?? "");
      const pct = parts[2] === undefined || parts[2] === "" ? 100 : Number(parts[2]!.replace("%", ""));
      const reason = parts.slice(3).join(", ");
      return { to, dollars, stockBps: Math.round(pct * 100), reason };
    });
}

export function RunBuilder({ owner, cluster }: { owner: string; cluster: string }) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "sending" | "done">("idle");
  useTxToast(why ? "failed" : phase === "sending" ? "confirming" : phase, "Pay the run", { href: review ? `/run/${review.runId}` : undefined, detail: why ?? undefined });
  const [sent, setSent] = useState<Array<{ releaseId: string; signature: string | null; error: string | null }>>([]);
  const items = parse(text);
  const total = items.reduce((n, i) => n + (Number.isFinite(i.dollars) ? i.dollars : 0), 0);

  async function build() {
    setWhy(null);
    setPhase("building");
    const res = await fetch("/api/org/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, items }) });
    const j = (await res.json()) as Review & { error?: string };
    setPhase("idle");
    if (!res.ok) {
      setWhy(j.error ?? "Could not build the run.");
      return;
    }
    setReview(j);
  }

  async function signAndSendAll() {
    if (!review) return;
    const found = findAccount(owner);
    if (!found) {
      setWhy("The wallet that signed in is not connected in this browser.");
      return;
    }
    const ready = review.lines.filter((l) => l.transactionBase64);
    setPhase("signing");
    const signed = await signAll(found.wallet, found.account, ready.map((l) => fromBase64(l.transactionBase64!)), cluster);
    if (!signed.ok) {
      setPhase("idle");
      if (signed.why) setWhy(signed.why);
      return;
    }
    setPhase("sending");
    const out: typeof sent = [];
    for (let i = 0; i < ready.length; i += 1) {
      const line = ready[i]!;
      try {
        const res = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionBase64: toBase64(signed.value[i]!) }) });
        const j = (await res.json()) as { signature?: string; error?: string };
        out.push({ releaseId: line.releaseId!, signature: j.signature ?? null, error: res.ok ? null : (j.error ?? "refused") });
      } catch (err) {
        out.push({ releaseId: line.releaseId!, signature: null, error: err instanceof Error ? err.message : String(err) });
      }
      setSent([...out]);
    }
    setPhase("done");
  }

  const buildable = review?.lines.filter((l) => l.transactionBase64).length ?? 0;
  const failed = review?.lines.filter((l) => l.error).length ?? 0;

  return (
    <div className="sp-org-form" style={{ maxWidth: "none" }}>
      {!review ? (
        <>
          <div className="sp-field">
            <label className="sp-label" htmlFor="label">
              What this run is
            </label>
            <input id="label" className="sp-input" placeholder="September contributors" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="sp-field">
            <label className="sp-label" htmlFor="lines">
              One line per person: handle or address, amount, stock share, reason
            </label>
            <textarea id="lines" className="sp-textarea" placeholder={"@amina, 200, 100, September retainer\n7xKp…3f9a, 50, 25, bounty: docs page"} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="sp-hint">
              {items.length} line{items.length === 1 ? "" : "s"}, {usd(total)} in all. The stock share defaults to 100%. Up to forty lines per run.
            </p>
          </div>
          <div className="sp-actions">
            <button type="button" className="sp-action is-primary is-big" disabled={items.length === 0 || phase === "building"} onClick={() => void build()}>
              {phase === "building" ? "Quoting every line…" : "Review the run"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sp-section-label">
            <span>
              {review.label || "The run"} · {buildable} of {review.lines.length} ready{failed > 0 ? `, ${failed} cannot be built` : ""}
            </span>
            <span className="mono">run {review.runId.slice(0, 8)}</span>
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="sp-run-table">
              <thead>
                <tr>
                  <th>To</th>
                  <th className="num">Amount</th>
                  <th className="num">In stock</th>
                  <th>Lands</th>
                  <th>Reason</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {review.lines.map((l, i) => {
                  const s = sent.find((x) => x.releaseId === l.releaseId);
                  return (
                    <tr key={i}>
                      <td className="mono">{l.handle ? `@${l.handle}` : l.owner ? `${l.owner.slice(0, 6)}…` : l.to}</td>
                      <td className="num">{Number.isFinite(l.dollars) ? usd(l.dollars) : "—"}</td>
                      <td className="num">{l.units && l.symbol ? `${(Number(l.units) / 10 ** 8).toFixed(4)} ${l.symbol}` : `${l.stockBps / 100}%`}</td>
                      <td>{l.error ? "" : l.hasBook ? "now" : "escrow, to claim"}</td>
                      <td>{l.reason}</td>
                      <td className={l.error || s?.error ? "err" : s?.signature ? "ok" : ""}>
                        {l.error ?? s?.error ?? (s?.signature ? <Link href={`/receipt/${s.signature}`}>settled</Link> : phase === "sending" ? "sending…" : "ready")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {phase === "sending" || phase === "done" ? (
            <div className="sp-progress">
              <div className="bar">
                <span style={{ width: `${buildable ? (sent.length / buildable) * 100 : 0}%` }} />
              </div>
              <span>
                {sent.filter((s) => s.signature).length} of {buildable} sent{phase === "done" ? "." : "…"}
              </span>
            </div>
          ) : null}
          <div className="sp-actions">
            {phase !== "done" ? (
              <button type="button" className="sp-action is-primary is-big" disabled={buildable === 0 || phase === "signing" || phase === "sending"} onClick={() => void signAndSendAll()}>
                {phase === "signing" ? "Waiting for your wallet…" : phase === "sending" ? "Sending…" : `Sign ${buildable} payment${buildable === 1 ? "" : "s"} at once`}
              </button>
            ) : (
              <Link href={`/run/${review.runId}`} className="sp-action is-primary is-big">
                Open the run page
              </Link>
            )}
            <button type="button" className="sp-action is-quiet" disabled={phase === "signing" || phase === "sending"} onClick={() => { setReview(null); setSent([]); setPhase("idle"); }}>
              Edit the lines
            </button>
          </div>
          {why ? (
            <p className="sp-why is-err">
              <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
            </p>
          ) : null}
          {phase === "done" ? (
            <p className="sp-why is-ok">
              <Check size={14} strokeWidth={2} aria-hidden /> The run is sent. Receipts appear on the run page as each payment settles.
            </p>
          ) : null}
        </>
      )}
      {why && !review ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
    </div>
  );
}
