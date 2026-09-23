"use client";

import {useState} from "react";
import {ELIGIBILITY_NOTE, ISSUER, ISSUER_POWERS} from "@/lib/assets";

/**
 * WHAT THE ASSET IS, ON THE ROW WHERE SOMEONE CHOOSES IT.
 *
 * Folded, because most people do not need it every time — but one click away, because
 * the issuer's powers are real and belong beside the choice, never in a banner. The
 * wording is plain; the facts are the ones `npm run check-issuer` read off the chain.
 */
export function AssetNote({symbol, name}: {symbol: string; name: string}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="wa-assetnote">
      <button type="button" className="wa-linkish" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide" : `What is ${symbol}?`}
      </button>
      {open ? (
        <span className="wa-assetnote-body">
          {name} ({symbol}) is a tokenized stock: it tracks the price of the real thing, and
          it is issued by a third party — not by Warrant and not by OKX. It is not a share:
          it carries no voting rights. Its issuer can {ISSUER_POWERS[0]}, {ISSUER_POWERS[1]},
          and upgrade the contract; Warrant cannot prevent that. Checked on X Layer on{" "}
          {ISSUER.checkedOn}. {ELIGIBILITY_NOTE}
        </span>
      ) : null}
    </span>
  );
}
