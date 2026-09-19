import { assetByMint } from "@/lib/assets/registry";
import type { LiveArrival } from "@/lib/book/live-types";
import type { receipts } from "@/lib/db/schema";
import { bps, dateUTC, short, stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { type StubSection, Stub } from "./stub";

type Row = typeof receipts.$inferSelect;

/** A cached receipt row, as the plain shape the live screen polls. */
export type AssetLabel = { readonly mint: string; readonly symbol: string; readonly decimals: number };

export function rowToArrival(r: Row, resolve?: (mint: string) => AssetLabel | null | undefined): LiveArrival {
  const a = assetByMint(r.asset) ?? resolve?.(r.asset) ?? null;
  return {
    id: r.id,
    sig: r.sig,
    kind: r.kind as LiveArrival["kind"],
    basisUsdc: String(r.basisUsdc),
    paidUsdc: String(r.paidUsdc),
    rateBps: r.rateBps,
    amountRaw: String(r.amountRaw),
    asset: r.asset,
    symbol: a?.symbol ?? null,
    decimals: a?.decimals ?? null,
    settledUnix: r.settledUnix,
    reason: r.reason,
    payer: r.payer,
    measured7dAt: r.measured7dAt,
    measured7dRaw: String(r.measured7dRaw),
    measured30dAt: r.measured30dAt,
    measured30dRaw: String(r.measured30dRaw),
  };
}

/** Units for an arrival: through the registry's decimals, or raw and labelled when unknown. */
export function arrivalUnits(a: LiveArrival): { units: string; symbol: string } {
  if (a.decimals !== null && a.symbol) return { units: unitsFromRaw(BigInt(a.amountRaw), a.decimals), symbol: a.symbol };
  return { units: BigInt(a.amountRaw).toLocaleString("en-US"), symbol: `raw · ${short(a.asset)}` };
}

/**
 * A stub from an arrival — for the landing, the ledger, the home screen and the public page,
 * where the cache is the source of speed and every row mirrors an account anyone can open.
 */
export function StubFromArrival({
  a,
  handle,
  compact = true,
  printing = false,
  showHeld = false,
}: {
  a: LiveArrival;
  handle?: string | null;
  compact?: boolean;
  printing?: boolean;
  showHeld?: boolean;
}) {
  const { units, symbol } = arrivalUnits(a);
  const isSweep = a.kind === "sweep";
  const sections: StubSection[] = [];
  if (showHeld) {
    const d = a.decimals ?? 0;
    sections.push({
      title: "Still held",
      rows: [
        { k: "7 days", v: a.measured7dAt ? `${unitsFromRaw(BigInt(a.measured7dRaw), d)} on ${dateUTC(a.measured7dAt)}` : `measured ${dateUTC(a.settledUnix + 7 * 86_400)}`, tone: a.measured7dAt ? "ok" : "muted" },
        { k: "30 days", v: a.measured30dAt ? `${unitsFromRaw(BigInt(a.measured30dRaw), d)} on ${dateUTC(a.measured30dAt)}` : `measured ${dateUTC(a.settledUnix + 30 * 86_400)}`, tone: a.measured30dAt ? "ok" : "muted" },
      ],
    });
  }
  return (
    <Stub
      href={`/receipt/${a.sig}`}
      compact={compact}
      printing={printing}
      landed={
        isSweep ? (
          <>
            <strong>{usdc(BigInt(a.basisUsdc))}</strong> landed
          </>
        ) : (
          <>
            <strong>{usdc(BigInt(a.paidUsdc))}</strong> paid{a.reason ? ` for “${a.reason}”` : ""}
          </>
        )
      }
      became={isSweep ? `${bps(a.rateBps)} became` : a.kind === "gift" ? "A first position, claimed" : a.kind === "grant" ? "Granted, vesting" : a.kind === "vest" ? "Vested" : "It became"}
      units={units}
      symbol={symbol}
      when={stampUTC(a.settledUnix)}
      where={handle ? "in" : undefined}
      whereName={handle ? `@${handle}’s wallet` : undefined}
      sections={sections}
    />
  );
}

/** The same, from a database row. */
export function StubFromRow(props: { row: Row; handle?: string | null; compact?: boolean; printing?: boolean; showHeld?: boolean; resolve?: (mint: string) => AssetLabel | null | undefined }) {
  return <StubFromArrival a={rowToArrival(props.row, props.resolve)} handle={props.handle} compact={props.compact} printing={props.printing} showHeld={props.showHeld} />;
}
