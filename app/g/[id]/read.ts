/**
 * EVERYTHING A CERTIFICATE PAGE SHOWS, READ ONCE.
 *
 * The grant live from the escrow (lib/grants.ts), its opening from the transaction on record
 * and checked against the USDT it moved (lib/grant-receipts.ts), its releases and its seal,
 * cancel and close from the indexer's copy, and the pool its shares are priced against —
 * `poolShares(asset)` and the escrow's balance — so the ticker computes exactly what the
 * contract would. Plus the route the quote took, and whether the release service is running.
 *
 * A GRANT OPENED A MOMENT AGO IS STILL A CERTIFICATE. If the indexer has not recorded its
 * opening yet, the page renders from the live grant with the transaction pending: the units
 * its shares hold now, no cost and no price (those are only shown once the opening checks
 * out), and a refresh until it does. A grant whose opening is on record but does not check
 * out is not shown at all, and the page says why.
 *
 * Reads are kept for ten seconds per grant, so a busy link does not spend the public
 * endpoint's two or three reads a second; `forgetCertificate` drops one the moment a wallet
 * on the page changes it.
 */
import {createPublicClient, erc20Abi} from "viem";
import {xLayer, transport} from "@/lib/chain";
import {assetByAddress} from "@/lib/assets";
import {database, routeFor} from "@/lib/db";
import {grantVests, openingMatches, readGrantOpening, type Opening, type Vest} from "@/lib/grant-receipts";
import {readGrantEvents, type GrantEvent} from "@/lib/grant-events";
import {escrowAddress, findGrant, type Grant} from "@/lib/grants";
import {catchUp} from "@/lib/indexer";
import {readKeeperStatus, type KeeperStatus} from "@/lib/keeper-status";
import {settledUnitPrice} from "@/lib/format";
import {grantEscrowAbi} from "@/lib/payroll-abi";
import {attempt, held, ok, type Outcome} from "@/lib/outcome";
import {sharesToUnits} from "@/lib/vesting";
import type {CertificateData} from "@/components/cert/types";

export type CertificateRecord = {
  data: CertificateData;
  grant: Grant;
  /** The checked opening, or null while the indexer has not recorded it. */
  opening: Opening | null;
  vests: Vest[];
  events: GrantEvent[];
  keeper: KeeperStatus;
  escrow: `0x${string}`;
  asset: {address: `0x${string}`; symbol: string; name: string; decimals: number};
};

const TTL_MS = 10_000;
const kept = new Map<number, {at: number; value: Promise<Outcome<CertificateRecord | null>>}>();

/** Drop a grant's kept read, so the next render reads the chain again. */
export function forgetCertificate(id: number): void {
  kept.delete(id);
}

export function readCertificate(id: number): Promise<Outcome<CertificateRecord | null>> {
  const hit = kept.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = read(id).then((r) => {
    // A failed read is not kept: the next visitor asks the chain again.
    if (!r.ok) kept.delete(id);
    return r;
  });
  kept.set(id, {at: Date.now(), value});
  if (kept.size > 200) kept.delete(kept.keys().next().value as number);
  return value;
}

/** Price a unit from what was actually paid and what actually arrived: "767.34". */
function priceText(stableCost: bigint, units: bigint, decimals: number): string | null {
  const p = settledUnitPrice(stableCost, units, decimals);
  if (p === null || !Number.isFinite(p)) return null;
  return p.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function read(id: number): Promise<Outcome<CertificateRecord | null>> {
  return attempt(`grant ${id}`, async () => {
    const escrow = escrowAddress();
    if (!escrow.ok) return escrow;

    const found = await findGrant(id);
    if (!found.ok) return found;
    if (found.value === null) return ok(null);
    const g = found.value;

    // Only the stocks Warrant lists are drawn as certificates: their decimals, names and the
    // issuer disclosure beside them are known, and checked.
    const listed = assetByAddress(g.asset);
    if (!listed) {
      return held(
        `Grant ${id} names a token that is not one of the stocks Warrant lists, so it is not ` +
          "shown as a certificate.",
      );
    }

    // On record or not yet? Only a grant the indexer has a row for can fail its check; one
    // with no row is simply new, and is drawn from the live grant while it is recorded.
    const onRecord = () => database().prepare(`SELECT 1 FROM grants WHERE id = ?`).get(id) !== undefined;
    let recorded = onRecord();
    if (!recorded) {
      // Bounded: at most a window or two, at most once every ten seconds for the process.
      await catchUp().catch(() => []);
      recorded = onRecord();
    }
    let opening: Opening | null = null;
    if (recorded) {
      const o = await readGrantOpening(id);
      if (!o.ok) return o;
      const same = openingMatches(g, o.value.moment);
      if (!same.ok) return same;
      opening = o.value;
    }

    const rpc = createPublicClient({chain: xLayer, transport: transport()});
    const [poolShares, escrowBalance, keeper] = await Promise.all([
      rpc.readContract({address: escrow.value, abi: grantEscrowAbi, functionName: "poolShares", args: [g.asset]}),
      rpc.readContract({address: g.asset, abi: erc20Abi, functionName: "balanceOf", args: [escrow.value]}),
      Promise.resolve().then(() => readKeeperStatus()).catch((): KeeperStatus => ({alive: false, lastPassAt: null, lastReleaseAt: null})),
    ]);

    const vests = opening ? grantVests(g) : [];
    const events = opening ? readGrantEvents(escrow.value, g) : [];

    const units = opening ? opening.moment.units : sharesToUnits(g.shares, poolShares, escrowBalance);
    const stableCost = opening ? opening.moment.stableCost : null;
    const route = opening ? (routeFor(opening.txHash) ?? []) : [];

    const data: CertificateData = {
      id,
      recipient: g.beneficiary,
      grantor: g.payer,
      asset: {symbol: listed.symbol, name: listed.name, address: listed.address, decimals: listed.decimals},
      units,
      stableCost,
      unitPriceUsd: stableCost !== null ? priceText(stableCost, units, listed.decimals) : null,
      route,
      start: g.start,
      cliffSeconds: g.cliffSeconds,
      durationSeconds: g.durationSeconds,
      tipBps: g.tipBps,
      sealed: g.isSealed,
      revoked: g.revoked,
      closed: g.state === "closed",
      shares: g.shares,
      sharesReleased: g.sharesReleased,
      frozenVestedShares: g.frozenVestedShares,
      openedShares: opening ? opening.moment.shares : g.shares,
      poolShares,
      escrowBalance,
      tx: opening ? opening.txHash : null,
    };

    return ok({
      data,
      grant: g,
      opening,
      vests,
      events,
      keeper,
      escrow: escrow.value,
      asset: data.asset,
    });
  });
}
