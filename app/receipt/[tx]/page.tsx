import type {Metadata} from "next";
import Link from "next/link";
import {createPublicClient, erc20Abi, http} from "viem";
import {Stub} from "@/components/stub/stub";
import {CopyText} from "@/components/app/copy-text";
import {PrintButton} from "@/components/app/print-button";
import {EXPLORER_ADDRESS, EXPLORER_TX, STABLE, xLayer} from "@/lib/chain";
import {ISSUER_NOTE, ISSUER_OWNER_NOTE, assetByAddress} from "@/lib/assets";
import {paidInTransaction, type Receipt} from "@/lib/receipts";
import {reasonFor} from "@/lib/db";
import {runLabel, settledUnitPrice, short, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import "./receipt.css";

/**
 * THE STUB. What was paid, to whom, in what, at what price, why, and where it is anchored.
 *
 * Unshelled and print-like on purpose: this is the page a stranger opens from a link with
 * no session, and the page a judge is handed on a phone. It reads the transaction
 * directly, so it needs no indexer and no cursor — a receipt is anchored to a transaction,
 * so the transaction is where it is read from.
 *
 * THE PRICE ON THIS PAGE IS ARITHMETIC ON A SETTLED PAYMENT: what was paid divided by what
 * arrived. It is not a quote, not a mark, and not what the asset is worth now.
 */
export const revalidate = 30;

type Params = {params: Promise<{tx: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {tx} = await params;
  return {
    title: `Stub ${short(tx)} — Warrant`,
    description: "A payment in ownership, with the reason it was paid.",
  };
}

async function assetFacts(address: `0x${string}`) {
  const rpc = createPublicClient({chain: xLayer, transport: http()});
  try {
    const [symbol, decimals] = await Promise.all([
      rpc.readContract({address, abi: erc20Abi, functionName: "symbol"}),
      rpc.readContract({address, abi: erc20Abi, functionName: "decimals"}),
    ]);
    return {symbol, decimals};
  } catch {
    // An asset that will not answer is still a payment that happened. Say the units
    // without a symbol rather than refuse to print the stub.
    return {symbol: "units", decimals: 18};
  }
}

function Reason({hash}: {hash: string}) {
  const stored = reasonFor(hash);

  if (!stored.found) {
    return (
      <p className="wa-r-note">
        The note for this payment is not available here. Only its fingerprint is stored on
        chain, shown below.
      </p>
    );
  }
  if (!stored.verified) {
    return (
      <p className="wa-r-note is-err">
        The note stored for this payment does not match its on-chain fingerprint, so it is
        not shown. The payment itself is real.
      </p>
    );
  }
  return <p className="wa-r-reason">{stored.text}</p>;
}

function Sheet({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section className="wa-r-sheet">
      <p className="wa-r-sheet-title">{title}</p>
      {children}
    </section>
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
 */
function AssetIdentity({address, symbol}: {address: `0x${string}`; symbol: string}) {
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
      </span>
    </span>
  );
}

/**
 * An address, SHOWN. A copy button on its own reads "To: Copy", which is not a receipt —
 * the whole point of the page is that a stranger can see who was paid.
 */
function Address({value}: {value: `0x${string}`}) {
  return (
    <span className="wa-r-addr">
      <a href={EXPLORER_ADDRESS(value)} className="wa-mono">
        {value}
      </a>
      <CopyText text={value} />
    </span>
  );
}

function Line({k, children}: {k: string; children: React.ReactNode}) {
  return (
    <p className="wa-r-line">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </p>
  );
}

function One({r, symbol, decimals}: {r: Receipt; symbol: string; decimals: number}) {
  const price = settledUnitPrice(r.stableAmount - r.cashAmount, r.assetAmount, decimals);
  const swapped = r.stableAmount - r.cashAmount;

  return (
    <article className="wa-r-one">
      <Stub
        landed={<><strong>{usdt(r.stableAmount)}</strong> paid</>}
        became={r.cashAmount > 0n ? `${usdt(swapped)} of it became` : "which became"}
        units={unitsFromRaw(r.assetAmount, decimals)}
        symbol={symbol}
        when={r.timestamp === null ? "settled on X Layer" : stampUTC(r.timestamp)}
        where="in their own wallet"
        whereName={short(r.recipient)}
        printing
      />

      <Sheet title="What was paid">
        <Line k="Paid">{usdt(r.stableAmount)} in {STABLE.symbol}</Line>
        {r.cashAmount > 0n ? (
          <>
            <Line k="Kept as USDT">{usdt(r.cashAmount)}</Line>
            <Line k="Turned into stock">{usdt(swapped)}</Line>
          </>
        ) : null}
        <Line k="Received">
          {unitsFromRaw(r.assetAmount, decimals)} {symbol}
        </Line>
        <Line k="Asset">
          <AssetIdentity address={r.asset} symbol={symbol} />
        </Line>
        <Line k="Price paid">
          {price === null ? "not available" : `1 ${symbol} = $${price.toFixed(2)}`}
          <span className="wa-r-aside">what this payment actually paid per unit</span>
        </Line>
        <Line k="Paid to">
          <Address value={r.recipient} />
        </Line>
        <Line k="Paid by">
          <Address value={r.payer} />
        </Line>
      </Sheet>

      <Sheet title="Note">
        <Reason hash={r.reasonHash} />
        <p className="wa-r-hashline">
          <span className="k">On-chain fingerprint</span>
          <span className="v wa-mono">{r.reasonHash}</span>
        </p>
      </Sheet>

      <Sheet title="Proof on X Layer">
        <Line k="Transaction">
          <a href={EXPLORER_TX(r.txHash)} className="wa-mono">
            {r.txHash}
          </a>
        </Line>
        <Line k="Block">{r.blockNumber.toString()}</Line>
        <Line k="Chain">X Layer, 196</Line>
        <Line k="Asset">
          <a href={EXPLORER_ADDRESS(r.asset)} className="wa-mono">
            {r.asset}
          </a>
        </Line>
        <Line k="Payroll batch">
          <Link href={`/run/${r.runId}`} className="wa-mono">
            {runLabel(r.runId)}
          </Link>
        </Line>
      </Sheet>

      {/* A stub is a document. It should print like one, and nothing else on the page
          should print at all. */}
      <div className="wa-r-print">
        <PrintButton />
      </div>


    </article>
  );
}

export default async function ReceiptPage({params}: Params) {
  const {tx} = await params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return (
      <main className="wa-receipt">
        <p className="wa-r-held">
          That is not a transaction hash. A receipt&rsquo;s address is the hash of the
          transaction that paid it — 0x followed by 64 characters.
        </p>
      </main>
    );
  }

  const found = await paidInTransaction(tx as `0x${string}`);

  if (!found.ok) {
    return (
      <main className="wa-receipt">
        <p className="wa-r-held">{found.why}</p>
        <p className="wa-r-note">
          <a href={EXPLORER_TX(tx)}>Look it up on the X Layer explorer</a>.
        </p>
      </main>
    );
  }

  const assets = new Map<string, {symbol: string; decimals: number}>();
  for (const r of found.value) {
    if (!assets.has(r.asset)) assets.set(r.asset, await assetFacts(r.asset));
  }

  return (
    <main className="wa-receipt">
      {found.value.length > 1 ? (
        <p className="wa-r-many">
          {found.value.length} people were paid in this one transaction. Here is each
          receipt.
        </p>
      ) : null}
      {found.value.map((r) => {
        const facts = assets.get(r.asset)!;
        return (
          <One
            key={`${r.txHash}-${r.logIndex}`}
            r={r}
            symbol={facts.symbol}
            decimals={facts.decimals}
          />
        );
      })}
    </main>
  );
}
