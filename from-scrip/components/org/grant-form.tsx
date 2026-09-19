"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { sol, usd } from "@/lib/format";
import { MAX_REASON_LEN } from "@/lib/intake/memo";
import { findAccount, fromBase64, signAndSend } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * A GRANT — recipient, amount, asset, cliff, duration, revocable, reason. The stock is bought
 * now and vests on the schedule; keepers vest it; the recipient sees it in their register
 * under "vesting". One signature opens, routes and seals it.
 */
type AssetOpt = { mint: string; symbol: string; name: string };

export function GrantForm({ owner, cluster, assets }: { owner: string; cluster: string; assets: AssetOpt[] }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [assetMint, setAssetMint] = useState(assets[0]?.mint ?? "");
  const [cliffDays, setCliffDays] = useState("30");
  const [durationDays, setDurationDays] = useState("180");
  const [revocable, setRevocable] = useState(true);
  const [reason, setReason] = useState("");
  const [floatSol, setFloatSol] = useState("0.05");
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "done">("idle");
  const [why, setWhy] = useState<string | null>(null);
  // The same words as the button, where a person can still see them after scrolling away.
  useTxToast(why ? "failed" : phase, "Open the grant", { detail: why ?? undefined });
  const dollars = Number(amount);
  const cliff = Math.max(0, Math.round(Number(cliffDays || 0)));
  const duration = Math.max(0, Math.round(Number(durationDays || 0)));
  const valid = Number.isFinite(dollars) && dollars >= 1 && to.trim().length >= 3 && cliff + duration > 0;
  const asset = assets.find((a) => a.mint === assetMint) ?? assets[0];

  async function grant() {
    const found = findAccount(owner);
    if (!found) {
      setWhy("The wallet that signed in is not connected in this browser.");
      return;
    }
    setWhy(null);
    setPhase("building");
    const res = await fetch("/api/org/grant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: to.trim(), dollars, assetMint, cliffSecs: cliff * 86_400, durationSecs: duration * 86_400, revocable, reason, floatLamports: String(Math.round(Number(floatSol || 0) * 1e9)) }),
    });
    const j = (await res.json()) as { transactionBase64?: string; grantId?: string; error?: string };
    if (!res.ok || !j.transactionBase64) {
      setPhase("idle");
      setWhy(j.error ?? "Could not build the grant.");
      return;
    }
    setPhase("signing");
    const sig = await signAndSend(found.wallet, found.account, fromBase64(j.transactionBase64), cluster);
    if (!sig.ok) {
      setPhase("idle");
      if (sig.why) setWhy(sig.why);
      return;
    }
    setPhase("done");
    setTimeout(() => router.refresh(), 2_500);
  }

  return (
    <form
      className="sp-org-form"
      onSubmit={(e) => {
        e.preventDefault();
        void grant();
      }}
    >
      <div className="sp-field">
        <label className="sp-label" htmlFor="gto">
          To
        </label>
        <input id="gto" className="sp-input is-mono" placeholder="@handle, or an address" value={to} onChange={(e) => setTo(e.target.value)} />
        <p className="sp-hint">Anyone with a wallet. Their own account for the stock is created now, so every vest is one instruction.</p>
      </div>
      <div className="sp-field">
        <label className="sp-label" htmlFor="gamount">
          Amount, in USDC, bought now
        </label>
        <div className="sp-input-wrap">
          <span className="sp-input-prefix">$</span>
          <input id="gamount" className="sp-input is-mono" inputMode="decimal" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
      </div>
      <div className="sp-field">
        <span className="sp-label">Becomes</span>
        <div className="sp-choices">
          {assets.map((a) => (
            <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={a.name}>
              {a.symbol}
            </button>
          ))}
        </div>
        <p className="sp-hint">{asset?.name}. Any listed company on the registry; a retention grant is usually the index.</p>
      </div>
      <div className="sp-org-two" style={{ gap: "var(--s-4)" }}>
        <div className="sp-field">
          <label className="sp-label" htmlFor="cliff">
            Cliff, in days
          </label>
          <input id="cliff" className="sp-input is-mono" inputMode="numeric" value={cliffDays} onChange={(e) => setCliffDays(e.target.value.replace(/[^0-9]/g, ""))} />
          <p className="sp-hint">Nothing vests before it. 0 for none.</p>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="duration">
            Then vesting over, in days
          </label>
          <input id="duration" className="sp-input is-mono" inputMode="numeric" value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/[^0-9]/g, ""))} />
          <p className="sp-hint">Linear. 0 for everything at the cliff.</p>
        </div>
      </div>
      <label className="sp-check">
        <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} />
        <span>Revocable: what has not vested can be taken back; what has accrued stays theirs.</span>
      </label>
      <div className="sp-field">
        <label className="sp-label" htmlFor="greason">
          For what <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(on every vest&rsquo;s receipt)</span>
        </label>
        <input id="greason" className="sp-input" placeholder="retention: keeper for a quarter" value={reason} maxLength={MAX_REASON_LEN} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="sp-field">
        <label className="sp-label" htmlFor="gfloat">
          Float, in SOL
        </label>
        <div className="sp-input-wrap">
          <span className="sp-input-prefix">◎</span>
          <input id="gfloat" className="sp-input is-mono" inputMode="decimal" value={floatSol} onChange={(e) => setFloatSol(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <p className="sp-hint">Pays each vest&rsquo;s receipt and the keeper&rsquo;s tip, about 0.0034 SOL a vest; {sol(BigInt(Math.round(Number(floatSol || 0) * 1e9)))} covers about {Math.floor((Number(floatSol || 0) * 1e9) / 3_400_000)} vests. What is left comes back when the grant closes.</p>
      </div>
      <div className="sp-actions">
        <button type="submit" className="sp-action is-primary is-big" disabled={!valid || phase !== "idle"}>
          {phase === "building" ? "Quoting…" : phase === "signing" ? "Waiting for your wallet…" : phase === "done" ? "Granted" : valid ? `Grant ${usd(dollars)} of ${asset?.symbol ?? "stock"}` : "Grant"}
        </button>
      </div>
      {why ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {phase === "done" ? (
        <p className="sp-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Granted. It appears below once the indexer sees it, and on their register under vesting.
        </p>
      ) : null}
    </form>
  );
}
