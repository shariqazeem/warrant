import type {Metadata} from "next";
import Link from "next/link";
import {Stub} from "@/components/stub/stub";
import {AddToWallet} from "@/components/stub/add-to-wallet";
import {assetByAddress} from "@/lib/assets";
import {PrintButton} from "@/components/app/print-button";
import {EXPLORER_ADDRESS, EXPLORER_TX, STABLE} from "@/lib/chain";
import {paidInTransaction, type Receipt} from "@/lib/receipts";
import {readGrantMoments} from "@/lib/grant-receipts";
import {escrowAddress} from "@/lib/grants";
import {runLabel, settledUnitPrice, short, stampUTC, unitsFromRaw, usdt} from "@/lib/format";
import {GrantMomentReceipt} from "./grant-stubs";
import {Address, AssetIdentity, Line, Note, Sheet} from "./parts";
import "./receipt.css";

/**
 * THE STUB. What was paid, to whom, in what, at what price, why, and where it is anchored.
 *
 * Unshelled and print-like on purpose: this is the page a stranger opens from a link with
 * no session, and the page a judge is handed on a phone. It reads the transaction
 * directly, so it needs no indexer and no cursor — a receipt is anchored to a transaction,
 * so the transaction is where it is read from.
 *
 * A GRANT'S TRANSACTIONS ARE RECEIPTS TOO. Opening one, each release, a cancel, sealing and
 * closing: when a transaction is not a payment, it is read for the escrow's events
 * (lib/grant-receipts.ts), and each one prints its own stub. A payment is read first and
 * exactly as it always was, so a payment's receipt costs nothing extra.
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

/**
 * What the asset is called and how its units divide. Only a listed stock ever reaches a
 * stub — lib/confirm.ts refuses anything else before a payment or a grant is shown — so the
 * list answers this without a read, and a shared stub opened by a crowd costs the chain
 * nothing. The fallback is never expected; it keeps a stub printable if it ever is.
 */
async function assetFacts(address: `0x${string}`) {
  const known = assetByAddress(address);
  return known ? {symbol: known.symbol, decimals: known.decimals} : {symbol: "units", decimals: 18};
}

const NO_STOCK = "0x0000000000000000000000000000000000000000";

/**
 * A PAYMENT TAKEN ALL IN DOLLARS. The person chose no stock, so the line named none and
 * bought none: the receipt says what arrived, in dollars, and shows no stock, no price and
 * no wallet button — a stub never names a stock that was not bought.
 */
function DollarsOnly({r}: {r: Receipt}) {
  return (
    <article className="wa-r-one">
      <Stub
        landed={<><strong>{usdt(r.stableAmount)}</strong> paid</>}
        became="all of it in dollars"
        units={(Number(r.stableAmount) / 1e6).toFixed(2)}
        symbol={STABLE.symbol}
        when={r.timestamp === null ? "settled on X Layer" : stampUTC(r.timestamp)}
        where="in their own wallet"
        whereName={short(r.recipient)}
        printing
      />

      <Sheet title="What was paid">
        <Line k="Paid">{usdt(r.stableAmount)} in {STABLE.symbol}</Line>
        <Line k="Received">
          {usdt(r.cashAmount)} in {STABLE.symbol}
          <span className="wa-r-aside">no stock: this payment was taken all in dollars</span>
        </Line>
        <Line k="Paid to">
          <Address value={r.recipient} />
        </Line>
        <Line k="Paid by">
          <Address value={r.payer} />
        </Line>
      </Sheet>

      <Note hash={r.reasonHash} />

      <Sheet title="Proof on X Layer">
        <Line k="Transaction">
          <a href={EXPLORER_TX(r.txHash)} className="wa-mono">
            {r.txHash}
          </a>
        </Line>
        <Line k="Block">{r.blockNumber.toString()}</Line>
        <Line k="Chain">X Layer, 196</Line>
        <Line k="Payroll batch">
          <Link href={`/run/${r.runId}`} className="wa-mono">
            {runLabel(r.runId)}
          </Link>
        </Line>
      </Sheet>

      <div className="wa-r-print">
        <PrintButton />
      </div>
    </article>
  );
}

function One({r, symbol, decimals}: {r: Receipt; symbol: string; decimals: number}) {
  if (r.asset.toLowerCase() === NO_STOCK) return <DollarsOnly r={r} />;
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

      <Note hash={r.reasonHash} />

      {/* The recipient's first question: where is it? */}
      {r.assetAmount > 0n ? <AddToWallet address={r.asset} symbol={symbol} decimals={decimals} /> : null}

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
    // Not a payment. It may be one of a grant's moments; if it is not, the payment reader's
    // sentence stands. A grant the escrow's events do not back says so in its own words.
    const granted = await readGrantMoments(tx as `0x${string}`);
    if (granted.ok && granted.value.length > 0) {
      const escrow = escrowAddress();
      const facts = new Map<string, {symbol: string; decimals: number}>();
      for (const r of granted.value) {
        const a = r.opening.moment.asset;
        if (!facts.has(a)) facts.set(a, await assetFacts(a));
      }
      return (
        <main className="wa-receipt">
          {granted.value.length > 1 ? (
            <p className="wa-r-many">
              This one transaction did {granted.value.length} things to grants. Here is the
              receipt for each.
            </p>
          ) : null}
          {granted.value.map((r) => (
            <GrantMomentReceipt
              key={`${r.txHash}-${r.moment.logIndex}`}
              r={r}
              facts={facts.get(r.opening.moment.asset)!}
              escrow={escrow.ok ? escrow.value : null}
            />
          ))}
        </main>
      );
    }

    return (
      <main className="wa-receipt">
        <p className="wa-r-held">{granted.ok ? found.why : granted.why}</p>
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
