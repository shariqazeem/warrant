import {ImageResponse} from "next/og";
import {assetByAddress} from "@/lib/assets";
import {readGrantMoments, type GrantReceipt} from "@/lib/grant-receipts";
import {paidInTransaction} from "@/lib/receipts";
import {humanDuration} from "@/lib/schedule";
import {reasonFor} from "@/lib/db";
import {settledUnitPrice, short, unitsFromRaw, usdt} from "@/lib/format";
import {OG, OG_SIZE, OG_TYPE} from "@/lib/og-theme";
import {ogOptions} from "@/lib/og-fonts";
import {DISPLAY, UI} from "@/components/cert/cert-card";

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
export const alt = "A payslip on X Layer: what was paid, to whom, in which stock, and why";
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
        fontFamily: UI,
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
              A payslip is anchored to one, and its address is the hash of the transaction that
              settled it.
            </div>
          </div>
        </Card>
      ),
      await ogOptions(size),
    );
  }

  const found = await paidInTransaction(tx as `0x${string}`);

  if (!found.ok || found.value.length === 0) {
    // Not a payment: it may be one of a grant's moments, whose page prints a stub too. The
    // card must agree with the page it stands for.
    const granted = await readGrantMoments(tx as `0x${string}`);
    if (granted.ok && granted.value.length > 0) {
      return new ImageResponse(<GrantCard g={granted.value[0]!} many={granted.value.length} tx={tx} />, await ogOptions(size));
    }
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
      await ogOptions(size),
    );
  }

  const r = found.value[0]!;
  const many = found.value.length;

  // Only a listed stock reaches a stub (lib/confirm.ts), so the list names it without a read.
  // A payment taken all in dollars names no stock; its card shows the dollars.
  const dollarsOnly = r.asset.toLowerCase() === "0x0000000000000000000000000000000000000000";
  const known = assetByAddress(r.asset);
  const symbol = dollarsOnly ? "USDT" : (known?.symbol ?? "units");
  const decimals = dollarsOnly ? 6 : (known?.decimals ?? 18);

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
            borderRadius: 8,
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
            <div style={{display: "flex", color: INK}}>Payslip, paid on X Layer</div>
            <div style={{display: "flex"}}>Warrant</div>
          </div>

          <div style={{display: "flex", fontSize: 30, color: MUTED, marginTop: 32}}>
            {dollarsOnly ? `${usdt(r.stableAmount)} paid, all in USD\u20ae0` : `${short(r.payer)} paid ${usdt(r.stableAmount)}`}
          </div>

          {/* The units are the largest thing on any surface they appear on. */}
          <div style={{display: "flex", alignItems: "baseline"}}>
            <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: 104, color: INK, letterSpacing: -3}}>
              {dollarsOnly ? (Number(r.cashAmount) / 1e6).toFixed(2) : unitsFromRaw(r.assetAmount, decimals)}
            </div>
            <div style={{display: "flex", fontSize: 34, color: MUTED, marginLeft: 18}}>
              {symbol}
            </div>
          </div>

          {/* ONE STRING PER BLOCK. Satori measures a flex child with several text nodes
              badly, and the blocks then draw on top of one another. */}
          <div style={{display: "flex", fontSize: 24, color: MUTED, marginTop: 16}}>
            {`to ${short(r.recipient)}\u2019s own wallet` +
              (dollarsOnly || price === null ? "" : `, at $${price.toFixed(2)} a unit through OKX DEX`)}
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
            {many > 1 ? `${many} people paid in transaction ${short(tx)}` : short(tx)}
          </div>
        </div>
      </Card>
    ),
    await ogOptions(size),
  );
}
/**
 * A GRANT MOMENT'S CARD. Same rules as the payment's: every figure from the events the page
 * itself prints, the units the largest thing on it.
 */
function GrantCard({g, many, tx}: {g: GrantReceipt; many: number; tx: string}) {
  const o = g.opening.moment;
  const known = assetByAddress(o.asset);
  const symbol = known?.symbol ?? "units";
  const decimals = known?.decimals ?? 18;
  const m = g.moment;

  const [label, lead, units, tail] =
    m.kind === "opened"
      ? [
          "Grant opened",
          `${usdt(m.stableCost)} bought, held in escrow`,
          `${unitsFromRaw(m.units, decimals)} ${symbol}`,
          `for ${short(m.beneficiary)}, vesting over ${humanDuration(m.durationSeconds)}` +
            (m.cliffSeconds > 0 ? ` after a ${humanDuration(m.cliffSeconds)} cliff` : ""),
        ]
      : m.kind === "vested"
        ? [
            "Released from a grant",
            `released to ${short(m.beneficiary)}\u2019s own wallet`,
            `${unitsFromRaw(m.unitsToBeneficiary, decimals)} ${symbol}`,
            `grant #${m.id}`,
          ]
        : m.kind === "revoked"
          ? [
              "Grant cancelled",
              `${short(o.beneficiary)} keeps what had vested`,
              `${unitsFromRaw(m.vestedUnits, decimals)} ${symbol}`,
              `${unitsFromRaw(m.returnedUnits, decimals)} ${symbol} went back to the company`,
            ]
          : m.kind === "sealed"
            ? ["Grant made irrevocable", "nobody can cancel it now", `Grant #${m.id}`, `for ${short(o.beneficiary)}`]
            : ["Grant fully released", "everything owed has been paid out", `Grant #${m.id}`, `for ${short(o.beneficiary)}`];

  return (
    <Card>
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
        <div style={{display: "flex", justifyContent: "space-between", fontSize: 22, color: FAINT}}>
          <div style={{display: "flex", color: OK}}>{label}</div>
          <div style={{display: "flex"}}>Warrant</div>
        </div>
        <div style={{display: "flex", fontSize: 30, color: MUTED, marginTop: 32}}>{lead}</div>
        <div style={{display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: 96, color: INK, letterSpacing: -3, marginTop: 6}}>{units}</div>
        <div style={{display: "flex", fontSize: 24, color: MUTED, marginTop: 16}}>{tail}</div>
        <div style={{display: "flex", fontSize: 18, color: FAINT, marginTop: 28}}>
          {many > 1 ? `${many} grant moments in transaction ${short(tx)}` : short(tx)}
        </div>
      </div>
    </Card>
  );
}
