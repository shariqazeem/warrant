import {CopyText} from "@/components/app/copy-text";
import {EXPLORER_ADDRESS} from "@/lib/chain";
import {ELIGIBILITY_NOTE, ISSUER_NOTE, ISSUER_OWNER_NOTE, assetByAddress} from "@/lib/assets";
import {reasonFor} from "@/lib/db";
import {short} from "@/lib/format";
import "./parts.css";

/**
 * THE SHEETS UNDER A STUB, and the rows they are ruled into.
 *
 * One copy for every document that prints a stub: a payment's receipt, a grant moment's
 * receipt, and a grant's own record at /grant/[id]. Two copies would be two looks within a
 * week, and a reader comparing a grant with its receipt would find them disagreeing about
 * something as small as how an address is written.
 */

export function Sheet({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section className="wa-r-sheet">
      <p className="wa-r-sheet-title">{title}</p>
      {children}
    </section>
  );
}

export function Line({k, children}: {k: string; children: React.ReactNode}) {
  return (
    <p className="wa-r-line">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </p>
  );
}

/**
 * An address, SHOWN. A copy button on its own reads "To: Copy", which is not a receipt —
 * the whole point of the page is that a stranger can see who was paid.
 */
export function Address({value}: {value: `0x${string}`}) {
  return (
    <span className="wa-r-addr">
      <a href={EXPLORER_ADDRESS(value)} className="wa-mono">
        {value}
      </a>
      <CopyText text={value} />
    </span>
  );
}

/**
 * The same address, short on screen: in full on hover, in full when copied, and in full on
 * paper, where there is no hover and a shortened address identifies nobody.
 */
export function ShortAddress({value}: {value: `0x${string}`}) {
  return (
    <span className="wa-r-addr">
      <a href={EXPLORER_ADDRESS(value)} className="wa-mono" title={value}>
        <span className="wa-r-addr-short">{short(value)}</span>
        <span className="wa-r-addr-full">{value}</span>
      </a>
      <CopyText text={value} />
    </span>
  );
}

/**
 * THE ASSET, IDENTIFIED BY ITS ADDRESS AND NOT BY ITS SYMBOL.
 *
 * X Layer carries wrapped and unwrapped twins of the same stock, at different addresses
 * and different prices — NVDAx quotes around $222.21 and wNVDAx around $222.58. A reader
 * who checks a symbol and finds the other one has found what looks like a pricing
 * discrepancy on a receipt, which is the last thing a receipt should produce. So the
 * address sits beside the symbol, and the issuer disclosure sits beside both, on the row
 * where it matters rather than as a banner at the foot of the page.
 *
 * `eligibility` adds who may not hold it. A grant is still being decided on — it can be
 * cancelled, and the person can be asked whether they may hold what is vesting to them.
 */
export function AssetIdentity({
  address,
  symbol,
  eligibility = false,
}: {
  address: `0x${string}`;
  symbol: string;
  eligibility?: boolean;
}) {
  const known = assetByAddress(address);
  return (
    <span className="wa-r-asset">
      <span className="wa-r-asset-line">
        <strong>{symbol}</strong>
        {known ? <span className="wa-r-asset-name">{known.name}</span> : null}
      </span>
      <a href={EXPLORER_ADDRESS(address)} className="wa-mono wa-r-asset-addr">
        {address}
      </a>
      <span className="wa-r-asset-note">
        {ISSUER_NOTE} {ISSUER_OWNER_NOTE}
        {eligibility ? ` ${ELIGIBILITY_NOTE}` : null}
      </span>
    </span>
  );
}

function Reason({hash, of}: {hash: string; of: "payment" | "grant"}) {
  const stored = reasonFor(hash);

  if (!stored.found) {
    return (
      <p className="wa-r-note">
        The note for this {of} is not available here. Only its fingerprint is stored on
        chain, shown below.
      </p>
    );
  }
  if (!stored.verified) {
    return (
      <p className="wa-r-note is-err">
        The note stored for this {of} does not match its on-chain fingerprint, so it is
        not shown. The {of} itself is real.
      </p>
    );
  }
  return <p className="wa-r-reason">{stored.text}</p>;
}

/**
 * Why the money moved. Only the hash is on chain; the text is shown only when it hashes to
 * it, and the page says which of the three cases it is in rather than going quiet.
 */
export function Note({hash, of = "payment"}: {hash: string; of?: "payment" | "grant"}) {
  return (
    <Sheet title="Note">
      <Reason hash={hash} of={of} />
      <p className="wa-r-hashline">
        <span className="k">On-chain fingerprint</span>
        <span className="v wa-mono">{hash}</span>
      </p>
    </Sheet>
  );
}
