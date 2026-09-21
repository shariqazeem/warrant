import {ImageResponse} from "next/og";
import {erc20Abi, createPublicClient, http} from "viem";
import {xLayer} from "@/lib/chain";
import {assetByAddress} from "@/lib/assets";
import {paidInTransaction} from "@/lib/receipts";
import {reasonFor} from "@/lib/db";
import {settledUnitPrice, short, unitsFromRaw, usdt} from "@/lib/format";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";

/**
 * THE SHARE CARD — the stub at its fifth size.
 *
 * What a receipt looks like when somebody posts it. Twenty people sharing the stub they
 * were paid with is the whole growth story, and a link that unfurls into nothing wastes it.
 *
 * SAME RULES AS THE PAGE. Every figure is read from the transaction; a reason is shown only
 * if the stored text hashes to the one on chain. A card that cannot be built says so in
 * words rather than inventing a payment.
 */
export const runtime = "nodejs";
export const alt = "A payment in ownership, with the reason it was made";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

const {ink: INK, paper: PAPER, sheet: SHEET, muted: MUTED, faint: FAINT, line: LINE, ok: OK} = OG;

function Card({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: PAPER,
        padding: 48,
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

export default async function Image({params}: {params: {tx: string}}) {
  const tx = params.tx;

  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return new ImageResponse(
      (
        <Card>
          <div style={{display: "flex", flexDirection: "column", justifyContent: "center"}}>
            <div style={{fontSize: 40, color: INK}}>Not a transaction</div>
            <div style={{fontSize: 24, color: MUTED, marginTop: 16}}>
              A stub is anchored to one, and its address is the hash of the transaction that
              settled it.
            </div>
          </div>
        </Card>
      ),
      size,
    );
  }

  const found = await paidInTransaction(tx as `0x${string}`);

  if (!found.ok || found.value.length === 0) {
    return new ImageResponse(
      (
        <Card>
          <div style={{display: "flex", flexDirection: "column", justifyContent: "center"}}>
            <div style={{fontSize: 40, color: INK}}>Warrant</div>
            <div style={{fontSize: 26, color: MUTED, marginTop: 16, maxWidth: 900}}>
              {found.ok ? "No payment in this transaction." : found.why}
            </div>
          </div>
        </Card>
      ),
      size,
    );
  }

  const r = found.value[0]!;
  const many = found.value.length;

  const known = assetByAddress(r.asset);
  let symbol = known?.symbol ?? "units";
  let decimals = known?.decimals ?? 18;
  if (!known) {
    try {
      const rpc = createPublicClient({chain: xLayer, transport: http()});
      const [s, d] = await Promise.all([
        rpc.readContract({address: r.asset, abi: erc20Abi, functionName: "symbol"}),
        rpc.readContract({address: r.asset, abi: erc20Abi, functionName: "decimals"}),
      ]);
      symbol = s;
      decimals = d;
    } catch {
      // the payment still happened; say the units without a symbol
    }
  }

  const stored = reasonFor(r.reasonHash);
  const reason = stored.found && stored.verified ? stored.text : null;
  const price = settledUnitPrice(r.stableAmount - r.cashAmount, r.assetAmount, decimals);

  const reasonText = reason
    ? reason.length > 64
      ? `${reason.slice(0, 64)}\u2026`
      : reason
    : null;

  return new ImageResponse(
    (
      <Card>
        {/*
          EXPLICIT SPACING, NO AUTO MARGINS. Satori is not a browser: `marginTop: auto`
          does not push a block to the bottom, it collapses, and the rows end up drawn on
          top of each other. Every gap below is stated.
        */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: SHEET,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: 44,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              color: FAINT,
            }}
          >
            <div style={{display: "flex", color: OK}}>Settled on X Layer</div>
            <div style={{display: "flex"}}>Warrant</div>
          </div>

          <div style={{display: "flex", fontSize: 30, color: MUTED, marginTop: 32}}>
            {`${usdt(r.stableAmount)} paid, which became`}
          </div>

          {/* The units are the largest thing on any surface they appear on. */}
          <div style={{display: "flex", alignItems: "baseline"}}>
            <div style={{display: "flex", fontSize: 104, color: INK, letterSpacing: -4}}>
              {unitsFromRaw(r.assetAmount, decimals)}
            </div>
            <div style={{display: "flex", fontSize: 34, color: MUTED, marginLeft: 18}}>
              {symbol}
            </div>
          </div>

          {/* ONE STRING PER BLOCK. Satori measures a flex child with several text nodes
              badly, and the blocks then draw on top of one another. */}
          <div style={{display: "flex", fontSize: 24, color: MUTED, marginTop: 16}}>
            {`in ${short(r.recipient)}\u2019s own wallet` +
              (price === null ? "" : `, at $${price.toFixed(2)} a unit`)}
          </div>

          {reasonText ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                lineHeight: 1.25,
                color: INK,
                marginTop: 28,
                paddingTop: 24,
                borderTop: `1px solid ${LINE}`,
              }}
            >
              {`\u201c${reasonText}\u201d`}
            </div>
          ) : null}

          <div style={{display: "flex", fontSize: 18, color: FAINT, marginTop: 18}}>
            {(many > 1 ? `${many} people paid in this transaction \u00b7 ` : "") + short(tx)}
          </div>
        </div>
      </Card>
    ),
    size,
  );
}