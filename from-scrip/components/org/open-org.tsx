"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { normalizeSlug, validateSlug } from "@/lib/handle";
import { signRuleAction } from "@/components/app/sign-rule";

/**
 * OPEN AN ORGANISATION'S REGISTER: a handle of kind "org". One signature, one account; no rule
 * is turned on. The public page at /@handle says "pays in stock since …" from the first
 * payment on.
 */
export function OpenOrg({ owner }: { owner: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const check = validateSlug(slug);

  async function open() {
    setBusy(true);
    setWhy(null);
    const out = await signRuleAction(owner, { action: "open", slug, kind: "org", termsVersion: 1 });
    setBusy(false);
    if (!out.ok) {
      if (out.why) setWhy(out.why);
      return;
    }
    setDone(true);
    setTimeout(() => router.refresh(), 2_000);
  }

  return (
    <div className="sp-org-form">
      <p className="sp-register-empty">An organisation register gives this wallet a handle, a public page that lists everyone it paid in stock, and a place its runs and grants live. It is one account on chain and one signature.</p>
      <label className="sp-q-row">
        <span className="k">Handle</span>
        <span className="v">
          <span className="sp-q-at">@</span>
          <input className="sp-input is-mono" placeholder="yourorg" value={slug} onChange={(e) => setSlug(normalizeSlug(e.target.value))} />
        </span>
        <span className="note">{!check.ok && slug ? check.why : `Your page: /@${slug || "yourorg"}. One per wallet, cannot be changed.`}</span>
      </label>
      <label className="sp-check">
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
        <span>This organisation is not a US person, and understands xStocks are tracker certificates issued by Backed whose issuer can freeze and move them.</span>
      </label>
      <div className="sp-actions">
        <button type="button" className="sp-action is-primary is-big" disabled={busy || !check.ok || !attest || done} onClick={() => void open()}>
          {busy ? "Waiting for your wallet…" : done ? "Opened" : "Open the organisation register"}
        </button>
      </div>
      {why ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {done ? (
        <p className="sp-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Opened. Your page is /@{slug}.
        </p>
      ) : null}
    </div>
  );
}
