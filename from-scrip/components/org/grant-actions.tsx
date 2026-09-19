"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findAccount, fromBase64, signAndSend } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/** Revoke (unvested returns) or close (rent and float return) a grant, from the payer's wallet. */
export function GrantActions({ owner, cluster, pda, state, revocable, sealed }: { owner: string; cluster: string; pda: string; state: string; revocable: boolean; sealed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useTxToast(why ? "failed" : busy ? "signing" : "idle", busy === "close" ? "Close the grant" : "Revoke the unvested", { detail: why ?? undefined });
  const canRevoke = sealed && state === "active" && revocable;
  const canClose = !sealed || state !== "active";

  async function act(action: "revoke" | "close") {
    const found = findAccount(owner);
    if (!found) {
      setWhy("The wallet that signed in is not connected in this browser.");
      return;
    }
    setBusy(action);
    setWhy(null);
    const res = await fetch("/api/org/grant/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pda, action }) });
    const j = (await res.json()) as { transactionBase64?: string; error?: string };
    if (!res.ok || !j.transactionBase64) {
      setBusy(null);
      setWhy(j.error ?? "Could not build it.");
      return;
    }
    const sig = await signAndSend(found.wallet, found.account, fromBase64(j.transactionBase64), cluster);
    setBusy(null);
    if (!sig.ok) {
      if (sig.why) setWhy(sig.why);
      return;
    }
    setTimeout(() => router.refresh(), 2_500);
  }

  if (!canRevoke && !canClose) return <span className="when">vesting</span>;
  return (
    <span className="sp-actions" style={{ justifySelf: "end" }}>
      {canRevoke ? (
        <button type="button" className="sp-action is-quiet" disabled={busy !== null} onClick={() => void act("revoke")}>
          {busy === "revoke" ? "Waiting…" : "Revoke the unvested"}
        </button>
      ) : null}
      {canClose ? (
        <button type="button" className="sp-action is-quiet" disabled={busy !== null} onClick={() => void act("close")}>
          {busy === "close" ? "Waiting…" : "Close, reclaim rent"}
        </button>
      ) : null}
      {why ? <span className="sp-why is-err">{why}</span> : null}
    </span>
  );
}
