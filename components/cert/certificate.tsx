import type {JSX} from "react";
import {getAddress} from "viem";
import {EXPLORER_TX, xLayer} from "@/lib/chain";
import {certificateSeed, guilloche, LANDSCAPE, PORTRAIT} from "@/lib/guilloche";
import {
  certificateLabel,
  certNumber,
  purchaseLine,
  routeLine,
  scheduleLine,
  sealState,
  shortAddress,
  unitsText,
} from "./cert-text";
import {Seal} from "./seal";
import type {CertificateData} from "./types";
import {VestingRule} from "./vesting-rule";
import "./certificate.css";

export type {CertificateAsset, CertificateData} from "./types";

/**
 * THE CERTIFICATE — the one object people remember.
 *
 * A security-printed certificate of grant: a guilloche border and rosette engraved from the
 * grant's own seed (chain id, escrow, grant id — lib/guilloche.ts), the recipient and the
 * units in Bodoni, what the stock was bought for and the OKX DEX route it took, the schedule
 * in a sentence and on the vesting rule, who granted it and the transaction it is recorded
 * in, and the seal: an outline while the grantor can still cancel, oxblood once sealed.
 *
 * Landscape (760×468) on a desk, portrait (350×520) on a phone; `variant="auto"` renders both
 * and lets the viewport choose at 900px. Both scale down with their column: every length is
 * a multiple of `--u`, one 760th (or 350th) of the certificate's own width.
 *
 * Server-rendered. The only code that runs in the browser is the ticking readout inside the
 * vesting rule. `engrave` plays the engrave-in once — the pattern wipes in, the text rises in
 * sequence, the seal lands last — and none of it under reduced motion or in print.
 *
 * Every figure is from the data: the chain, a live quote, or what the grantor typed. A
 * specimen is marked as one, numbered 000000, and says it is not yet recorded.
 */
export type CertificateProps = {
  data: CertificateData;
  variant: "landscape" | "portrait" | "auto";
  /** A preview of a grant not yet issued: the diagonal "Specimen" watermark and No. 000000. */
  specimen?: boolean;
  /** Play the engrave-in, once. */
  engrave?: boolean;
  /** Mixed into the seed: a specimen re-seeds from the form so it changes as it is filled in. */
  seedExtra?: string;
  /** The grantor chose to seal it after issuing: the outline says "To be sealed". */
  sealPending?: boolean;
  /** The seal transaction has just confirmed: press the seal. Never pass it before. */
  pressSeal?: boolean;
  /** The moment the page was read, unix seconds. */
  now?: number;
  /** Drawn on the vault: the deeper shadow. */
  onVault?: boolean;
};

const ESCROW = process.env.NEXT_PUBLIC_GRANT_ESCROW_ADDRESS ?? "";

function checksummed(a: `0x${string}`): string {
  try {
    return getAddress(a);
  } catch {
    return a;
  }
}

/** An address or hash short on screen and in full on paper. */
function Both({full, short}: {full: string; short: string}) {
  return (
    <>
      <span className="wa-cert-onscreen">{short}</span>
      <span className="wa-cert-onpaper">{full}</span>
    </>
  );
}

function Recorded({tx, specimen, id}: {tx: `0x${string}` | null; specimen: boolean; id: number}) {
  if (specimen) return <span>Not yet recorded on X Layer</span>;
  if (!tx) {
    return (
      <span>
        Recorded on X Layer as grant <span className="wa-cert-v">{id}</span>
      </span>
    );
  }
  return (
    <span>
      Recorded on X Layer in{" "}
      <a className="wa-cert-v wa-cert-link" href={EXPLORER_TX(tx)} rel="noreferrer">
        <Both full={tx} short={shortAddress(tx)} />
      </a>
    </span>
  );
}

function Landscape(p: CertificateProps & {now: number}) {
  const {data: d, specimen = false, now} = p;
  const no = certNumber(d.id, specimen);
  const seed = certificateSeed(xLayer.id, ESCROW, specimen ? 0 : d.id, p.seedExtra);
  const g = guilloche(seed, LANDSCAPE.W, LANDSCAPE.H, LANDSCAPE.rx, LANDSCAPE.ry, LANDSCAPE.rr, false);
  const route = routeLine(d.route);
  const seal = sealState(d, {sealPending: p.sealPending, now});

  return (
    <div
      className={
        "wa-cert is-landscape" +
        (specimen ? " is-specimen" : "") +
        (p.engrave ? " is-engraving" : "") +
        (p.onVault ? " on-vault" : "")
      }
    >
      <div className="wa-cert-sheet">
        <svg
          className="wa-cert-engraving"
          viewBox={`0 0 ${LANDSCAPE.W} ${LANDSCAPE.H}`}
          role="img"
          aria-label={certificateLabel(d, specimen)}
        >
          <rect x={10} y={10} width={740} height={448} className="wa-cert-frame" />
          <rect x={44} y={44} width={672} height={380} className="wa-cert-frame is-inner" />
          <path d={g.rosette} className="wa-cert-rosette" />
          <path d={g.waves} className="wa-cert-waves" />
          <path d={g.corners} className="wa-cert-corners" />
        </svg>
        <div className="wa-cert-wipe" aria-hidden />

        <div className="wa-cert-body">
          <div className="wa-cert-head wa-cert-rise is-d1">
            <span className="wa-cert-title">Certificate of grant</span>
            <span className="wa-cert-no">No. {no}</span>
          </div>

          <div className="wa-cert-grant wa-cert-rise is-d2">
            <span className="wa-cert-kicker">This certifies that</span>
            <span className="wa-cert-to">{d.recipient ? checksummed(d.recipient) : "Their wallet address"}</span>
            <span className="wa-cert-kicker">is granted</span>
            <span className="wa-cert-units" data-long={unitsText(d).length >= 7 ? "" : undefined}>
              <span className="wa-cert-units-n">{unitsText(d)}</span>
              <span className="wa-cert-units-sym">{d.asset.symbol}</span>
            </span>
            <span className="wa-cert-line is-first">{purchaseLine(d)}</span>
            {route ? (
              <span className="wa-cert-line is-route">
                <span className="wa-cert-route-k">Route</span> {route}
              </span>
            ) : null}
            <span className="wa-cert-line">{scheduleLine(d)}</span>
          </div>

          <div className="wa-cert-rulebox wa-cert-rise is-d3">
            <VestingRule data={d} tone="engrave" now={now} specimen={specimen} />
          </div>

          <div className="wa-cert-sign wa-cert-rise is-d3">
            <span>
              Granted by{" "}
              <span className="wa-cert-v">
                {d.grantor ? <Both full={checksummed(d.grantor)} short={shortAddress(checksummed(d.grantor))} /> : "your wallet"}
              </span>
            </span>
            <Recorded tx={d.tx} specimen={specimen} id={d.id} />
          </div>
        </div>

        {specimen ? (
          <div className="wa-cert-specimen" aria-hidden>
            <span>Specimen</span>
          </div>
        ) : null}

        <div className={`wa-cert-sealbox${seal === "sealed" ? " is-landing" : " wa-cert-rise is-d3"}`}>
          <Seal size={118} state={seal} no={no} press={p.pressSeal} />
        </div>
      </div>
    </div>
  );
}

function Portrait(p: CertificateProps & {now: number}) {
  const {data: d, specimen = false, now} = p;
  const no = certNumber(d.id, specimen);
  const seed = certificateSeed(xLayer.id, ESCROW, specimen ? 0 : d.id, p.seedExtra);
  const g = guilloche(seed, PORTRAIT.W, PORTRAIT.H, PORTRAIT.rx, PORTRAIT.ry, PORTRAIT.rr, true);
  const route = routeLine(d.route);
  const seal = sealState(d, {sealPending: p.sealPending, now});

  return (
    <div
      className={
        "wa-cert is-portrait" +
        (specimen ? " is-specimen" : "") +
        (p.engrave ? " is-engraving" : "") +
        (p.onVault ? " on-vault" : "")
      }
    >
      <div className="wa-cert-sheet">
        <svg
          className="wa-cert-engraving"
          viewBox={`0 0 ${PORTRAIT.W} ${PORTRAIT.H}`}
          role="img"
          aria-label={certificateLabel(d, specimen)}
        >
          <rect x={8} y={8} width={334} height={504} className="wa-cert-frame" />
          <rect x={40} y={40} width={270} height={440} className="wa-cert-frame is-inner" />
          <path d={g.rosette} className="wa-cert-rosette" />
          <path d={g.waves} className="wa-cert-waves" />
          <path d={g.corners} className="wa-cert-corners" />
        </svg>
        <div className="wa-cert-wipe" aria-hidden />

        <div className="wa-cert-body">
          <div className="wa-cert-head wa-cert-rise is-d1">
            <span className="wa-cert-title">Certificate of grant</span>
            <span className="wa-cert-no">No. {no}</span>
          </div>

          <div className="wa-cert-grant wa-cert-rise is-d2">
            <span className="wa-cert-kicker">This certifies that</span>
            <span className="wa-cert-to">
              {d.recipient ? <Both full={checksummed(d.recipient)} short={shortAddress(checksummed(d.recipient))} /> : "Their wallet address"}
            </span>
            <span className="wa-cert-kicker">is granted</span>
            <span className="wa-cert-units" data-long={unitsText(d).length >= 7 ? "" : undefined}>
              <span className="wa-cert-units-n">{unitsText(d)}</span>
              <span className="wa-cert-units-sym">{d.asset.symbol}</span>
            </span>
            <span className="wa-cert-line is-first">{purchaseLine(d, {withPrice: false})}</span>
            {route ? <span className="wa-cert-line is-route">{route}</span> : null}
            <span className="wa-cert-line">{scheduleLine(d)}</span>
          </div>

          <div className="wa-cert-bottom">
            <div className={`wa-cert-sealbox${seal === "sealed" ? " is-landing" : " wa-cert-rise is-d3"}`}>
              <Seal size={96} state={seal} no={no} press={p.pressSeal} />
            </div>
            <div className="wa-cert-sign wa-cert-rise is-d3">
              <span>
                Granted by{" "}
                <span className="wa-cert-v">
                  {d.grantor ? <Both full={checksummed(d.grantor)} short={shortAddress(checksummed(d.grantor))} /> : "your wallet"}
                </span>
              </span>
              <Recorded tx={d.tx} specimen={specimen} id={d.id} />
            </div>
          </div>
        </div>

        {specimen ? (
          <div className="wa-cert-specimen" aria-hidden>
            <span>Specimen</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Certificate(props: CertificateProps): JSX.Element {
  const now = props.now ?? Math.floor(Date.now() / 1000);
  if (props.variant === "landscape") return <Landscape {...props} now={now} />;
  if (props.variant === "portrait") return <Portrait {...props} now={now} />;
  return (
    <div className="wa-cert-auto">
      <Landscape {...props} now={now} />
      <Portrait {...props} now={now} />
    </div>
  );
}
