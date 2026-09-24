// STUB — replaced at merge by lane B
/**
 * A stand-in for lane B's certificate, so lane C's issue flow compiles and renders. It lists
 * the fields it is given in a plain bordered box. The exported names and types are the
 * contract lane B's component keeps; nothing else here survives the merge.
 */
import type {JSX} from "react";

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
  const {data, variant, specimen, sealPending} = props;
  const rows: [string, string][] = [
    ["No.", String(data.id).padStart(6, "0")],
    ["Recipient", data.recipient ?? "Their wallet address"],
    ["Stock", `${data.asset.symbol} (${data.asset.name})`],
    ["Units (raw)", data.units === null ? "—" : data.units.toString()],
    ["Cost (USD₮0 base units)", data.stableCost === null ? "—" : data.stableCost.toString()],
    ["Price", data.unitPriceUsd === null ? "—" : `$${data.unitPriceUsd}`],
    ["Route", data.route.length > 0 ? data.route.join(" → ") : "—"],
    ["Start", new Date(data.start * 1000).toISOString()],
    ["Cliff (s)", String(data.cliffSeconds)],
    ["Duration (s)", String(data.durationSeconds)],
    ["Release fee (bps)", String(data.tipBps)],
    ["Granted by", data.grantor ?? "—"],
    ["Seal", data.sealed ? "Sealed" : sealPending ? "To be sealed after issuing" : "Revocable, until sealed"],
  ];
  return (
    <div
      style={{
        border: "1px solid currentColor",
        padding: 16,
        width: variant === "landscape" ? 760 : 350,
        minHeight: variant === "landscape" ? 468 : 520,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.5,
        overflowWrap: "anywhere",
      }}
    >
      <strong>Certificate of grant{specimen ? " (specimen)" : ""}</strong>
      <dl style={{margin: "8px 0 0"}}>
        {rows.map(([k, v]) => (
          <div key={k} style={{display: "flex", gap: 8}}>
            <dt style={{minWidth: 150}}>{k}</dt>
            <dd style={{margin: 0}}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
