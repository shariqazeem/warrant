import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {CopyText} from "@/components/app/copy-text";
import {Certificate} from "@/components/cert/certificate";
import {CertActionsLazy} from "@/components/cert/cert-actions-lazy";
import {CertShare, PlayedOnce} from "@/components/cert/cert-share";
import {RefreshWhileLive, RefreshWhilePending} from "@/components/cert/refresh";
import {lengthWords, routeLine, shortAddress, whenLabel, onOrAt} from "@/components/cert/cert-text";
import {VestingRule} from "@/components/cert/vesting-rule";
import {AssetNote} from "@/components/pay/asset-note";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {EXPLORER_ADDRESS, EXPLORER_TX} from "@/lib/chain";
import {bps, isShortGrant, stampUTC, unitsFromRaw} from "@/lib/format";
import {isTeam} from "@/lib/team";
import {parseGrantId, findGrant} from "@/lib/grants";
import {recordTransaction} from "@/lib/indexer";
import {formatUnitsFixed, releasableUnits, sharesToUnits, vestingPhase} from "@/lib/vesting";
import {forgetCertificate, readCertificate, type CertificateRecord} from "./read";
import "@/app/landing.css";
import "./cert-page.css";

/**
 * `/g/[id]` — THE CERTIFICATE PAGE.
 *
 * Public and server-rendered: a person sent this link sees what they were granted and watch
 * it vest with no wallet at all. The certificate (landscape on a desk, portrait on a phone),
 * the vesting rule ticking, what can be done to the grant by whoever is looking, every fact
 * and every transaction linked to OKLink, and what the issuer of the stock can do.
 *
 * `?issued=1` plays the engrave-in once (the issue flow sends the grantor here);
 * `&seal=1` brings "Seal it now" into view; `?sealed=1` presses the seal, and is only ever set
 * after the seal transaction confirms. `?tx=0x…` names the opening transaction so a grant
 * issued a second ago is recorded before the page draws it.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({params, searchParams}: Props): Promise<Metadata> {
  const {id} = await params;
  const n = parseGrantId(id);
  if (n === null) return {title: "Not a certificate — Warrant"};
  const no = String(n).padStart(6, "0");
  // A number with no grant behind it yet says so, rather than naming a certificate that
  // does not exist. A read that fails keeps the certificate's title: the page says the rest.
  // Arriving from issuing (with its transaction), the grant exists even if this server cannot
  // see it yet, so the title is the certificate's.
  const tx = one((await searchParams).tx);
  const found = await findGrant(n).catch(() => null);
  if (found?.ok && found.value === null && !(tx && HEX_TX.test(tx))) return {title: `No grant No. ${no} yet — Warrant`};
  return {
    title: `Certificate of grant No. ${no} — Warrant`,
    description:
      "Stock granted on X Layer, bought on day one through OKX DEX and vesting every second in " +
      "an escrow nobody can spend. Anyone can check it, no wallet needed.",
  };
}

const HEX_TX = /^0x[0-9a-fA-F]{64}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The page's headline and the sentence under it, for the state the grant is in now. */
function standing(r: CertificateRecord, now: number): {head: string; sub: string} {
  const d = r.data;
  const who = `${shortAddress(d.grantor ?? "")} granted ${shortAddress(d.recipient ?? "")} ${d.asset.name}`;
  const bought = d.stableCost !== null ? ", bought on day one through OKX DEX" : "";
  const lock = d.sealed
    ? " It is sealed: nobody can take any of it back, including the grantor."
    : d.revoked || d.closed
      ? ""
      : " Until it is sealed, the grantor can cancel the part not yet vested; what has vested stays theirs.";
  const base = `${who}${bought}, held in an escrow nobody can spend.${lock}`;

  if (d.closed) {
    return d.revoked
      ? {head: "Cancelled, and settled.", sub: `${who}. The grantor cancelled it, and everything that had vested was released to them.`}
      : {head: "Fully vested and released.", sub: `${who}. Every unit it held is in their wallet.`};
  }
  const t = {
    shares: d.shares ?? 0n,
    sharesReleased: d.sharesReleased ?? 0n,
    start: d.start,
    cliffSeconds: d.cliffSeconds,
    durationSeconds: d.durationSeconds,
    revoked: d.revoked,
    frozenVestedShares: d.frozenVestedShares ?? 0n,
  };
  switch (vestingPhase(t, now)) {
    case "revoked":
      return {head: "Cancelled. What vested stays theirs.", sub: `${who}. The grantor cancelled the part that had not vested.`};
    case "vested":
      return {head: "Fully vested.", sub: `${base} All of it is theirs.`};
    case "not-started":
      return {head: `Vesting starts ${onOrAt(whenLabel(d.start, d.durationSeconds))}.`, sub: base};
    case "accruing":
      return {head: `Accruing until the cliff ${onOrAt(whenLabel(d.start + d.cliffSeconds, d.durationSeconds))}.`, sub: base};
    default:
      return {head: "Vesting every second.", sub: base};
  }
}

function Addr({a}: {a: `0x${string}`}) {
  return (
    <>
      <a href={EXPLORER_ADDRESS(a)} className="wa-mono" title={a} target="_blank" rel="noreferrer">
        {shortAddress(a)}
      </a>
      <CopyText text={a} label="Copy" />
    </>
  );
}

function Tx({hash}: {hash: `0x${string}`}) {
  return (
    <a href={EXPLORER_TX(hash)} className="wa-mono" title={hash} target="_blank" rel="noreferrer">
      {shortAddress(hash)} on OKLink
    </a>
  );
}

/** Every fact on the certificate, in full, and every transaction behind it. */
function Facts({r, now}: {r: CertificateRecord; now: number}) {
  const d = r.data;
  const sym = d.asset.symbol;
  // Holdings by the site's one rule (lib/format): rounded down, four significant figures at least.
  const u = (v: bigint, dp?: number) => `${unitsFromRaw(v, d.asset.decimals, dp)} ${sym}`;
  // A release fee on a small grant can be under a millionth of a unit: widen it, never 0.000000.
  const uFine = (v: bigint) => {
    const six = formatUnitsFixed(v, d.asset.decimals, 6);
    return v > 0n && /^0\.0+$/.test(six) ? u(v, 10) : `${six} ${sym}`;
  };
  const when = (t: number | null) => (t === null ? "time not read" : stampUTC(t));
  const route = routeLine(d.route);
  const released = r.vests.reduce((s, v) => s + v.unitsToBeneficiary, 0n);
  const revokedEvent = r.events.find((e) => e.kind === "revoked");
  const sealedEvent = r.events.find((e) => e.kind === "sealed");

  type Moment = {key: string; block: number; label: string; detail: string | null; at: number | null; tx: `0x${string}` | null};
  const moments: Moment[] = [];
  if (r.opening) {
    moments.push({
      key: "issued",
      block: Number(r.opening.blockNumber),
      label: "Issued",
      detail: d.units !== null ? `${u(d.units)} bought into the escrow` : null,
      at: r.opening.timestamp,
      tx: r.opening.txHash,
    });
  }
  for (const v of r.vests) {
    const self = v.caller.toLowerCase() === d.recipient?.toLowerCase();
    moments.push({
      key: `${v.txHash}-${v.logIndex}`,
      block: v.blockNumber,
      label: self ? "Claimed by them" : "Released",
      detail:
        `${uFine(v.unitsToBeneficiary)} to their wallet` +
        (v.unitsToCaller > 0n ? `, ${uFine(v.unitsToCaller)} release fee to ${shortAddress(v.caller)}` : ""),
      at: v.blockTime,
      tx: v.txHash,
    });
  }
  for (const e of r.events) {
    moments.push({
      key: `${e.txHash}-${e.logIndex}`,
      block: e.blockNumber,
      label: e.kind === "sealed" ? "Sealed" : e.kind === "revoked" ? "Cancelled" : "Closed",
      detail:
        e.kind === "revoked" && e.vestedUnits !== null && e.returnedUnits !== null
          ? `${u(e.vestedUnits)} had vested and stays theirs; ${u(e.returnedUnits)} went back to the grantor`
          : null,
      at: e.blockTime,
      tx: e.txHash,
    });
  }
  moments.sort((a, b) => a.block - b.block);

  const end = d.start + d.durationSeconds;
  const cliffAt = d.start + d.cliffSeconds;

  return (
    <section aria-labelledby="wa-cp-facts">
      <h2 id="wa-cp-facts">The record</h2>
      <dl className="wa-cp-facts">
        <div>
          <dt>Granted by</dt>
          <dd>
            {d.grantor ? <Addr a={d.grantor} /> : "—"}
            {isTeam(d.grantor) ? <span className="wa-cp-aside">One of Warrant&rsquo;s own wallets: this grant is the team&rsquo;s test, with real money.</span> : null}
          </dd>
        </div>
        <div>
          <dt>Granted to</dt>
          <dd>
            {d.recipient ? <Addr a={d.recipient} /> : "—"}
            <span className="wa-cp-aside">
              What vests goes to this wallet and nowhere else.
              {isTeam(d.recipient) ? " It is one of Warrant’s own wallets." : ""}
            </span>
          </dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>
            {d.units !== null ? u(d.units) : "—"}
            <span className="wa-cp-aside">
              {r.opening
                ? "What the escrow received when the grant was issued."
                : "What its share of the escrow holds now; the purchase is confirmed once the opening transaction is read."}
            </span>
          </dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>
            {d.stableCost !== null ? `$${formatUnitsFixed(d.stableCost, 6, 2)} in USD₮0` : "Confirmed once the opening transaction is read"}
          </dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>
            {d.unitPriceUsd ? `$${d.unitPriceUsd} a unit` : "—"}
            {d.unitPriceUsd ? <span className="wa-cp-aside">What this grant actually paid, from its cost and the units it received.</span> : null}
          </dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>{route ? `${route}, through OKX DEX on X Layer` : "Through OKX DEX on X Layer; its hops were not recorded"}</dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>
            Every second over {lengthWords(d.durationSeconds)}, from {whenLabel(d.start, d.durationSeconds)} to{" "}
            {whenLabel(end, d.durationSeconds)}
            <span className="wa-cp-aside">{stampUTC(d.start)} to {stampUTC(end)}</span>
          </dd>
        </div>
        <div>
          <dt>Cliff</dt>
          <dd>
            {d.cliffSeconds > 0 && d.cliffSeconds < d.durationSeconds
              ? `${whenLabel(cliffAt, d.durationSeconds)}. Nothing unlocks before it; then everything accrued since the start unlocks at once.`
              : "None. It vests from the first second."}
          </dd>
        </div>
        <div>
          <dt>Release fee</dt>
          <dd>
            {d.tipBps > 0 ? `${bps(d.tipBps)} of each release, to whoever releases it` : "None"}
            <span className="wa-cp-aside">Nothing when they claim it themselves. Anyone may release what is due, so it arrives even if nobody remembers.</span>
          </dd>
        </div>
        <div>
          <dt>Sealed</dt>
          <dd>
            {d.sealed ? (
              <>
                <span className="wa-cp-seal-word">Irrevocable.</span> Nobody can cancel any part of it, including the grantor
                {sealedEvent?.blockTime ? `, since ${stampUTC(sealedEvent.blockTime)}` : ""}.
              </>
            ) : d.revoked ? (
              "No. It was cancelled before it was sealed."
            ) : (
              "Not yet. Until it is sealed, the grantor can cancel the part not yet vested."
            )}
          </dd>
        </div>
        {d.revoked ? (
          <div>
            <dt>Cancelled</dt>
            <dd>
              {revokedEvent && revokedEvent.vestedUnits !== null && revokedEvent.returnedUnits !== null
                ? `${u(revokedEvent.vestedUnits)} had vested and stays theirs. ${u(revokedEvent.returnedUnits)} went back to the grantor.`
                : d.frozenVestedShares !== undefined && d.poolShares !== undefined && d.escrowBalance !== undefined
                  ? `What had vested stays theirs: ${u(sharesToUnits(d.frozenVestedShares, d.poolShares, d.escrowBalance))} at today's pool. The rest went back to the grantor.`
                  : "What had vested stays theirs. The rest went back to the grantor."}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Released to them</dt>
          <dd>
            {r.opening ? u(released, 6) : "—"}
            <span className="wa-cp-aside">
              {r.vests.length === 0 ? "Nothing yet." : `In ${r.vests.length} release${r.vests.length === 1 ? "" : "s"}.`}
            </span>
          </dd>
        </div>
        {r.grant.reason ? (
          <div>
            <dt>Why</dt>
            <dd>{r.grant.reason}</dd>
          </div>
        ) : null}
        <div>
          <dt>Transactions</dt>
          <dd>
            {moments.length === 0 ? (
              "Recording the transaction that issued it."
            ) : (
              <ol className="wa-cp-moments">
                {moments.map((m) => (
                  <li key={m.key}>
                    <span className="wa-cp-moment-k">{m.label}</span>
                    <span>{when(m.at)}</span>
                    {m.tx ? <Tx hash={m.tx} /> : null}
                    {m.detail ? <span className="wa-cp-aside">{m.detail}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </dd>
        </div>
        <div>
          <dt>Held by</dt>
          <dd>
            <Addr a={r.escrow} />
            <span className="wa-cp-aside">The escrow contract. It has no owner, no admin and no upgrade path.</span>
          </dd>
        </div>
        <div>
          <dt>Read</dt>
          <dd>{stampUTC(now)}, from the escrow on X Layer</dd>
        </div>
      </dl>
    </section>
  );
}

function Frame({children, head}: {children: React.ReactNode; head?: React.ReactNode}) {
  return (
    <div className="wa-landing wa-cp">
      <div className="wa-dark wa-vault wa-cp-top">
        <SiteNav />
        {head}
      </div>
      <div className="wa-tear" aria-hidden />
      {children}
      <div className="wa-dark wa-vault">
        <SiteFoot />
      </div>
    </div>
  );
}

export default async function CertificatePage({params, searchParams}: Props) {
  const {id: raw} = await params;
  const id = parseGrantId(raw);
  if (id === null) notFound();
  const sp = await searchParams;

  let found = await readCertificate(id);
  const txHint = one(sp.tx);
  const justIssued = Boolean(txHint && HEX_TX.test(txHint));
  // Sent here the moment the wallet saw the opening confirm, and the escrow does not show the
  // grant yet: the RPC node this server asks can be a block behind the wallet's. Record the
  // transaction (which waits on this server's own node) and read again, a few times, before
  // saying anything. Grant No. 000003 on 25 Sep landed on "nothing at this address" this way.
  for (let tries = 0; justIssued && found.ok && found.value === null && tries < 4; tries++) {
    await recordTransaction(txHint as `0x${string}`).catch(() => 0);
    await new Promise((r) => setTimeout(r, 1500));
    forgetCertificate(id);
    found = await readCertificate(id);
  }
  // Sent here with the opening transaction and not on record yet: record it now, read again.
  if (found.ok && found.value && !found.value.opening && justIssued) {
    await recordTransaction(txHint as `0x${string}`).catch(() => 0);
    forgetCertificate(id);
    found = await readCertificate(id);
  }
  if (found.ok && found.value === null && justIssued) {
    // Still not visible: it was issued seconds ago, so say that and keep looking, never 404.
    return (
      <Frame>
        <main id="main" className="wa-cp-main">
          <div className="wa-cp-held">
            <div className="wa-nothing" role="status">
              <strong>Certificate No. {String(id).padStart(6, "0")} is being recorded.</strong> Its transaction
              confirmed; X Layer is showing it to this page in a moment, and it appears here by itself.
              <RefreshWhilePending />
            </div>
            <p className="wa-fine">
              <a href={EXPLORER_TX(txHint as `0x${string}`)}>The transaction on OKLink</a>.
            </p>
          </div>
        </main>
      </Frame>
    );
  }

  if (!found.ok) {
    return (
      <Frame>
        <main id="main" className="wa-cp-main">
          <div className="wa-cp-held">
            <div className="wa-nothing" role="alert">
              <strong>This certificate could not be shown just now.</strong> {found.why}
            </div>
            <p className="wa-fine">
              <a href={`/g/${id}`}>Try again</a>. The grant itself is on X Layer whatever this page says.
            </p>
          </div>
        </main>
      </Frame>
    );
  }
  if (found.value === null) notFound();

  const r = found.value;
  const d = r.data;
  // Read once, so the certificate, the rule and the facts all describe the same second.
  const now = Math.floor(Date.now() / 1000);
  const s = standing(r, now);
  const issued = one(sp.issued) === "1";
  const pressSeal = one(sp.sealed) === "1" && d.sealed;
  const released = r.vests.reduce((sum, v) => sum + v.unitsToBeneficiary, 0n);
  // Still changing: vesting, or holding something due that the release service (or anyone) is
  // about to send. While it is, the page reads the grant again every 20 seconds on a short
  // grant and every minute on a long one.
  const owed =
    releasableUnits(
      {
        shares: r.grant.shares,
        sharesReleased: r.grant.sharesReleased,
        start: r.grant.start,
        cliffSeconds: r.grant.cliffSeconds,
        durationSeconds: r.grant.durationSeconds,
        revoked: r.grant.revoked,
        frozenVestedShares: r.grant.frozenVestedShares,
      },
      {poolShares: d.poolShares ?? 0n, escrowBalance: d.escrowBalance ?? 0n},
      now,
    ) > 0n;
  const live = !d.closed && ((!d.revoked && now < d.start + d.durationSeconds) || owed);

  return (
    <Frame
      head={
        <div className="wa-cp-hero">
          <p className="wa-cp-kicker">Certificate of grant No. {String(id).padStart(6, "0")}</p>
          <h1 className="wa-h1">{s.head}</h1>
          <p className="wa-cp-sub">{s.sub}</p>
        </div>
      }
    >
      <main id="main" className="wa-cp-main">
        <div className="wa-cp-cert">
          <Certificate data={d} variant="auto" engrave={issued} pressSeal={pressSeal} now={now} />
        </div>
        {r.opening === null ? (
          <p className="wa-cp-pending" role="status">
            Recording the transaction that issued this grant. Its cost and price appear here in a moment.
            <RefreshWhilePending />
          </p>
        ) : null}
        {issued || pressSeal ? <PlayedOnce keys={["issued", "seal", "sealed", "tx"]} /> : null}

        <div className="wa-cp-grid">
          <div className="wa-cp-left">
            <div className="wa-cp-rule">
              <VestingRule data={d} tone="canvas" layout="stack" now={now} releasedUnits={r.opening ? released : null} />
            </div>
            <CertActionsLazy
              id={id}
              escrow={r.escrow}
              grantor={r.grant.payer}
              recipient={r.grant.beneficiary}
              asset={{address: d.asset.address, symbol: d.asset.symbol, decimals: d.asset.decimals}}
              terms={{
                shares: r.grant.shares,
                sharesReleased: r.grant.sharesReleased,
                start: r.grant.start,
                cliffSeconds: r.grant.cliffSeconds,
                durationSeconds: r.grant.durationSeconds,
                revoked: r.grant.revoked,
                frozenVestedShares: r.grant.frozenVestedShares,
              }}
              pool={{poolShares: d.poolShares ?? 0n, escrowBalance: d.escrowBalance ?? 0n}}
              tipBps={d.tipBps}
              sealed={d.sealed}
              revoked={d.revoked}
              closed={d.closed}
              releasedUnits={released}
              keeper={{alive: r.keeper.alive, lastReleaseAt: r.keeper.lastReleaseAt}}
              initialNow={now}
              callSeal={one(sp.seal) === "1"}
            />
            <CertShare id={id} />
            {live ? <RefreshWhileLive every={isShortGrant(d.durationSeconds) ? 20_000 : 60_000} /> : null}
          </div>

          <div className="wa-cp-right">
            <Facts r={r} now={now} />
            <section className="wa-cp-stock" aria-labelledby="wa-cp-stock">
              <h2 id="wa-cp-stock">The stock</h2>
              <p>
                {d.asset.name} ({d.asset.symbol}), token{" "}
                <a href={EXPLORER_ADDRESS(d.asset.address)} className="wa-mono" target="_blank" rel="noreferrer">
                  {shortAddress(d.asset.address)}
                </a>{" "}
                on X Layer. A stock position: economic exposure to the price, with no votes.
              </p>
              <AssetNote symbol={d.asset.symbol} name={d.asset.name} audience="anyone" />
            </section>
          </div>
        </div>
      </main>
    </Frame>
  );
}
