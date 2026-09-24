// STUB — replaced at merge by lane B
/**
 * A STAND-IN FOR THE CERTIFICATE, so lane D's pages compile and render in this worktree.
 *
 * Lane B builds the real one (guilloche, seal, engrave-in). This prints only what
 * CertificateData carries, as plain engraved text on bond; nothing is sampled, and a figure
 * that is unknown prints as a dash. The exported names and props are the interface lane B
 * delivers, so the pages that use this need no change at merge.
 */
import type {JSX} from "react";
import {dateUTC, short, unitsFromRaw, usdt} from "@/lib/format";

export type CertificateAsset = {symbol: string; name: string; address: `0x${string}`; decimals: number};

export type CertificateData = {
  id: number;
  recipient: `0x${string}` | null;
  grantor: `0x${string}` | null;
  asset: CertificateAsset;
  units: bigint | null;
  stableCost: bigint | null;
  unitPriceUsd: string | null;
  route: string[];
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  tipBps: number;
  sealed: boolean;
  revoked: boolean;
  closed: boolean;
  shares?: bigint;
  sharesReleased?: bigint;
  frozenVestedShares?: bigint;
  poolShares?: bigint;
  escrowBalance?: bigint;
  tx: `0x${string}` | null;
};

export function Certificate(props: {
  data: CertificateData;
  variant: "landscape" | "portrait";
  specimen?: boolean;
  engrave?: boolean;
  seedExtra?: string;
  sealPending?: boolean;
}): JSX.Element {
  const d = props.data;
  const number = props.specimen ? "000000" : String(d.id).padStart(6, "0");
  return (
    <article
      aria-label={`Certificate of grant number ${number}`}
      style={{
        background: "var(--bond)",
        color: "var(--engrave)",
        borderRadius: "var(--r-cert)",
        boxShadow: "var(--shadow-cert-vault)",
        padding: props.variant === "portrait" ? "40px 28px" : "48px 56px",
        maxWidth: props.variant === "portrait" ? 350 : 760,
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "var(--font-display)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textAlign: props.variant === "portrait" ? "center" : "left",
      }}
    >
      <p style={{margin: 0, letterSpacing: "0.14em", fontVariantCaps: "all-small-caps"}}>
        Certificate of grant <span style={{float: props.variant === "portrait" ? "none" : "right"}}>No. {number}</span>
      </p>
      <p style={{margin: 0, fontStyle: "italic", color: "var(--muted-bond)"}}>This certifies that</p>
      <p style={{margin: 0, fontFamily: "var(--font-mono)", fontSize: 14, overflowWrap: "anywhere"}}>
        {d.recipient ? (props.variant === "portrait" ? short(d.recipient) : d.recipient) : "—"}
      </p>
      <p style={{margin: 0, fontStyle: "italic", color: "var(--muted-bond)"}}>is granted</p>
      <p style={{margin: 0, fontSize: props.variant === "portrait" ? 44 : 60, lineHeight: 1}}>
        {d.units === null ? "—" : unitsFromRaw(d.units, d.asset.decimals)}{" "}
        <span style={{fontSize: 22}}>{d.asset.symbol}</span>
      </p>
      <p style={{margin: 0, fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted-bond)"}}>
        {d.asset.name}
        {d.stableCost === null ? "" : `, bought for ${usdt(d.stableCost)} USDT through OKX DEX`}
        {d.unitPriceUsd === null ? "." : ` at $${d.unitPriceUsd} a unit.`}
      </p>
      <p style={{margin: 0, fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted-bond)"}}>
        Vests from {dateUTC(d.start)} to {dateUTC(d.start + d.durationSeconds)}
        {d.cliffSeconds > 0 ? `, nothing before the cliff on ${dateUTC(d.start + d.cliffSeconds)}` : ""}.
      </p>
      <p style={{margin: 0, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted-bond)"}}>
        Granted by <span style={{fontFamily: "var(--font-mono)"}}>{d.grantor ? short(d.grantor) : "—"}</span>
        {d.sealed ? " · Sealed" : " · Revocable, until sealed"}
      </p>
    </article>
  );
}
