"use client";

import {Loader2, Lock} from "lucide-react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {ScheduleBar} from "./schedule-bar";
import {useGrantAction} from "./use-grant";
import type {Grant} from "@/lib/grants";
import {humanDuration} from "@/lib/schedule";
import {dateUTC, short, unitsFromRaw, usdt} from "@/lib/format";
import {NEEDS_OKB, useWallet} from "@/components/wallet/use-wallet";
import "./grants.css";

/**
 * THE GRANTS THAT EXIST, and what can still be done to each.
 *
 * Every figure here was read from the contract. `heldUnits` and `releasableUnits` are the
 * contract's own arithmetic against the pool as it stands, not a number this page worked
 * out — which matters, because the issuer can change what the escrow holds and a stale
 * total would be a promise nobody has to keep.
 */
export function GrantList({
  grants,
  escrow,
  now,
}: {
  grants: Grant[];
  escrow: `0x${string}`;
  now: number;
}) {
  const router = useRouter();
  const wallet = useWallet();
  const address = wallet.address;
  const {run, phase, targetId, action, why, reset} = useGrantAction(escrow);

  // WHAT STOPS EVERY BUTTON BELOW, in the words the pay form uses. Each of the four actions
  // is a transaction from this wallet, on X Layer, paying its fee in OKB.
  const blocker =
    wallet.status === "disconnected" || wallet.status === "connecting"
      ? "Connect a wallet to continue"
      : wallet.status === "wrong-chain"
        ? "Switch to X Layer to continue"
        : wallet.noGas
          ? NEEDS_OKB
          : null;
  // One action at a time, across every grant: a second signature request while the first
  // is open is how a wallet ends up approving the wrong one.
  const anyBusy = phase === "signing" || phase === "confirming";

  const act = async (id: number, which: "vest" | "seal" | "revoke" | "close") => {
    if (blocker || anyBusy) return;
    const tx = await run(id, which);
    if (tx) router.refresh();
  };

  if (grants.length === 0) {
    return (
      <div className="wa-nothing">
        <strong>No grants yet.</strong>
        Grants you create appear here with their vesting schedule. They release on time
        whether or not anyone remembers to come back.
      </div>
    );
  }

  return (
    <div>
      {grants.map((g) => {
        const isPayer = address?.toLowerCase() === g.payer.toLowerCase();
        const isBeneficiary = address?.toLowerCase() === g.beneficiary.toLowerCase();
        const busy = targetId === g.id && anyBusy;
        const finished = g.sharesReleased >= g.shares;
        // Whether any button on this grant would do something, so the blocker is only said
        // where it is stopping something.
        const canAct = g.releasableUnits > 0n || (isPayer && !g.isSealed && !g.revoked) || finished;

        return (
          <article className="wa-grant" key={g.id}>
            <div className="wa-grant-head">
              <Link href={`/grant/${g.id}`} className="wa-linkish">
                Grant {g.id}
              </Link>
              <span className="wa-grant-who">
                <span className="wa-mono">{short(g.beneficiary)}</span>
                {isBeneficiary ? " — you" : null}
              </span>

              {g.isSealed ? (
                <span className="wa-chip is-sealed">
                  <Lock size={14} strokeWidth={2} aria-hidden />
                  Irrevocable
                </span>
              ) : null}
              {g.revoked ? <span className="wa-chip is-revoked">Revoked</span> : null}
              {g.state === "closed" ? <span className="wa-chip is-closed">Closed</span> : null}

              <span className="wa-grant-units">
                {unitsFromRaw(g.heldUnits, g.assetDecimals)}
                <span className="sym">{g.assetSymbol} in escrow</span>
              </span>
            </div>

            {g.reason ? <p className="wa-grant-why">{g.reason}</p> : null}

            <ScheduleBar
              schedule={{
                shares: g.shares,
                start: g.start,
                cliffSeconds: g.cliffSeconds,
                durationSeconds: g.durationSeconds,
                revoked: g.revoked,
                frozenShares: g.frozenVestedShares,
              }}
              releasedShares={g.sharesReleased}
              now={now}
            />

            <div className="wa-grant-rows">
              <span>
                Ready to release
                <b>
                  {unitsFromRaw(g.releasableUnits, g.assetDecimals)} {g.assetSymbol}
                </b>
              </span>
              <span>
                Grant value
                <b>{usdt(g.stableCost)}</b>
              </span>
              <span>
                Vests over
                <b>{humanDuration(g.durationSeconds)}</b>
              </span>
              <span>
                Cliff
                <b>
                  {g.cliffSeconds === 0 ? "none" : humanDuration(g.cliffSeconds)}
                </b>
              </span>
              <span>
                Release fee
                <b>{(g.tipBps / 100).toFixed(2)}%</b>
              </span>
              <span>
                Granted by
                <b>{short(g.payer)}</b>
              </span>
            </div>

            {g.state === "open" ? (
              <div className="wa-grant-act">
                <button
                  type="button"
                  className="wa-btn is-primary"
                  disabled={anyBusy || Boolean(blocker) || g.releasableUnits === 0n}
                  onClick={() => void act(g.id, "vest")}
                >
                  {busy && action === "vest" ? (
                    <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" />
                  ) : null}
                  {g.releasableUnits === 0n
                    ? finished
                      ? "Fully released"
                      : g.revoked
                        ? "Nothing further will vest"
                        : "Nothing due yet"
                    : isBeneficiary
                      ? `Claim ${unitsFromRaw(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol}`
                      : `Release ${unitsFromRaw(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol} to them`}
                </button>

                {isPayer && !g.isSealed && !g.revoked ? (
                  <>
                    <button
                      type="button"
                      className="wa-btn"
                      disabled={anyBusy || Boolean(blocker)}
                      onClick={() => void act(g.id, "seal")}
                    >
                      {busy && action === "seal" ? (
                        <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" />
                      ) : null}
                      Make irrevocable
                    </button>
                    <button
                      type="button"
                      className="wa-btn"
                      disabled={anyBusy || Boolean(blocker)}
                      onClick={() => void act(g.id, "revoke")}
                    >
                      {busy && action === "revoke" ? (
                        <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" />
                      ) : null}
                      Cancel the unvested part
                    </button>
                  </>
                ) : null}

                {finished ? (
                  <button
                    type="button"
                    className="wa-btn"
                    disabled={anyBusy || Boolean(blocker)}
                    onClick={() => void act(g.id, "close")}
                  >
                    {busy && action === "close" ? (
                      <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" />
                    ) : null}
                    Archive
                  </button>
                ) : null}

                {blocker && canAct ? <span className="wa-grant-block">{blocker}</span> : null}

                {!g.isSealed && !g.revoked && isPayer ? (
                  <span className="wa-grant-rows" style={{marginTop: 0}}>
                    <span>
                      Making it irrevocable is permanent — after that, nobody can cancel it,
                      including you.
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            {targetId === g.id && phase === "failed" && why ? (
              <p className="wa-refusal" style={{marginTop: "var(--s-3)"}}>
                {why}{" "}
                <button type="button" className="wa-linkish" onClick={reset}>
                  Dismiss
                </button>
              </p>
            ) : null}

            {g.revoked ? (
              <p className="wa-grant-why">
                This grant was cancelled. Whatever had already vested still belongs to them and
                can be claimed; nothing more will vest.
              </p>
            ) : null}

            <p className="wa-grant-why">
              Started {dateUTC(g.start)}.{" "}
              {g.isSealed
                ? "Irrevocable: nobody can cancel it."
                : "The company can still cancel the part that has not vested yet."}
            </p>
          </article>
        );
      })}
    </div>
  );
}
