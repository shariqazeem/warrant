"use client";

import {Loader2, Lock} from "lucide-react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {ScheduleBar} from "./schedule-bar";
import {useGrantAction} from "./use-grant";
import type {Grant} from "@/lib/grants";
import {humanDuration} from "@/lib/schedule";
import {dateUTC, short, unitsFromRaw, usdt} from "@/lib/format";
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
  const {address} = useAccount();
  const {run, phase, busyId, action, why, reset} = useGrantAction(escrow);

  const act = async (id: number, which: "vest" | "seal" | "revoke" | "close") => {
    const tx = await run(id, which);
    if (tx) router.refresh();
  };

  if (grants.length === 0) {
    return (
      <div className="wa-nothing">
        <strong>No grants yet.</strong>
        A grant opened here buys its asset once and holds it in an escrow the payer cannot
        reach into. It appears in this list with its schedule, and vests whether or not
        anyone remembers to come back.
      </div>
    );
  }

  return (
    <div>
      {grants.map((g) => {
        const isPayer = address?.toLowerCase() === g.payer.toLowerCase();
        const isBeneficiary = address?.toLowerCase() === g.beneficiary.toLowerCase();
        const busy = busyId === g.id && (phase === "signing" || phase === "confirming");
        const finished = g.sharesReleased >= g.shares;

        return (
          <article className="wa-grant" key={g.id}>
            <div className="wa-grant-head">
              <span className="wa-grant-who">
                <span className="wa-mono">{short(g.beneficiary)}</span>
                {isBeneficiary ? " — you" : null}
              </span>

              {g.isSealed ? (
                <span className="wa-chip is-sealed">
                  <Lock size={14} strokeWidth={2} aria-hidden />
                  Sealed, cannot be revoked
                </span>
              ) : null}
              {g.revoked ? <span className="wa-chip is-revoked">Revoked</span> : null}
              {g.state === "closed" ? <span className="wa-chip is-closed">Closed</span> : null}

              <span className="wa-grant-units">
                {unitsFromRaw(g.heldUnits, g.assetDecimals)}
                <span className="sym">{g.assetSymbol} held</span>
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
                Due now
                <b>
                  {unitsFromRaw(g.releasableUnits, g.assetDecimals)} {g.assetSymbol}
                </b>
              </span>
              <span>
                Cost to open
                <b>{usdt(g.stableCost)}</b>
              </span>
              <span>
                Term
                <b>{humanDuration(g.durationSeconds)}</b>
              </span>
              <span>
                Cliff
                <b>
                  {g.cliffSeconds === 0 ? "none" : humanDuration(g.cliffSeconds)}
                </b>
              </span>
              <span>
                Keeper&rsquo;s share
                <b>{(g.tipBps / 100).toFixed(2)}%</b>
              </span>
              <span>
                Opened by
                <b>{short(g.payer)}</b>
              </span>
            </div>

            {g.state === "open" ? (
              <div className="wa-grant-act">
                <button
                  type="button"
                  className="wa-btn is-primary"
                  disabled={busy || g.releasableUnits === 0n}
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
                      ? `Take ${unitsFromRaw(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol}`
                      : `Release ${unitsFromRaw(g.releasableUnits, g.assetDecimals)} ${g.assetSymbol} to them`}
                </button>

                {isPayer && !g.isSealed && !g.revoked ? (
                  <>
                    <button
                      type="button"
                      className="wa-btn"
                      disabled={busy}
                      onClick={() => void act(g.id, "seal")}
                    >
                      Give up the right to revoke
                    </button>
                    <button
                      type="button"
                      className="wa-btn"
                      disabled={busy}
                      onClick={() => void act(g.id, "revoke")}
                    >
                      Revoke what has not vested
                    </button>
                  </>
                ) : null}

                {finished ? (
                  <button
                    type="button"
                    className="wa-btn"
                    disabled={busy}
                    onClick={() => void act(g.id, "close")}
                  >
                    Close it
                  </button>
                ) : null}

                {!g.isSealed && !g.revoked && isPayer ? (
                  <span className="wa-grant-rows" style={{marginTop: 0}}>
                    <span>
                      Sealing is permanent. It is what makes this a grant rather than a
                      promise.
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}

            {busyId === g.id && phase === "failed" && why ? (
              <p className="wa-refusal" style={{marginTop: "var(--s-3)"}}>
                {why}{" "}
                <button type="button" className="wa-linkish" onClick={reset}>
                  Dismiss
                </button>
              </p>
            ) : null}

            {g.revoked ? (
              <p className="wa-grant-why">
                Vesting stopped on this grant. What had already vested is still owed and can
                still be taken; nothing further ever will be.
              </p>
            ) : null}

            <p className="wa-grant-why">
              Opened {dateUTC(g.start)}.{" "}
              {g.isSealed
                ? "The company gave up the right to revoke it."
                : "The company may still revoke what has not vested."}
            </p>
          </article>
        );
      })}
    </div>
  );
}
