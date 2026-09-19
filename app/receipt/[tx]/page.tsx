import type {Metadata} from "next";
import {createPublicClient, erc20Abi, http} from "viem";
import {Stub} from "@/components/stub/stub";
import {CopyText} from "@/components/app/copy-text";
import {EXPLORER_ADDRESS, EXPLORER_TX, STABLE, xLayer} from "@/lib/chain";
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
        Only the hash of the reason is on chain. The text was not written to this
        installation&rsquo;s cache, so it cannot be shown here.
      </p>
    );
  }
  if (!stored.verified) {
    return (
      <p className="wa-r-note is-err">
        The stored text does not hash to the reason on this transaction, so it is not shown.
        The payment is real; the reason recorded beside it is not the one that was signed.
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
            <Line k="Stayed cash">{usdt(r.cashAmount)}, untouched</Line>
            <Line k="Became ownership">{usdt(swapped)}</Line>
          </>
        ) : null}
        <Line k="Arrived">
          {unitsFromRaw(r.assetAmount, decimals)} {symbol}
        </Line>
        <Line k="At">
          {price === null ? "not computable" : `$${price.toFixed(2)} per whole ${symbol}`}
          <span className="wa-r-aside">
            arithmetic on this payment, not a quote and not a mark
          </span>
        </Line>
        <Line k="To">
          <Address value={r.recipient} />
        </Line>
        <Line k="From">
          <Address value={r.payer} />
        </Line>
      </Sheet>

      <Sheet title="Why">
        <Reason hash={r.reasonHash} />
        <p className="wa-r-hashline">
          <span className="k">On chain</span>
          <span className="v wa-mono">{r.reasonHash}</span>
        </p>
      </Sheet>

      <Sheet title="Where it is anchored">
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
        <Line k="Run">
          <span className="wa-mono">{runLabel(r.runId)}</span>
        </Line>
      </Sheet>

      <p className="wa-r-issuer">
        {symbol} is a tokenized stock issued by a third party, not by Warrant. It gives
        economic exposure to the underlying share price. It does not make the holder a
        shareholder and carries no voting rights.
      </p>
    </article>
  );
}

export default async function ReceiptPage({params}: Params) {
  const {tx} = await params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return (
      <main className="wa-receipt">
        <p className="wa-r-held">
          That is not a transaction hash. A stub is anchored to one, and its address is the
          hash of the transaction that settled it.
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
          <a href={EXPLORER_TX(tx)}>Open the transaction on X Layer</a> to see it for
          yourself.
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
          {found.value.length} people were paid in this one transaction. Every stub below
          shares its run.
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
