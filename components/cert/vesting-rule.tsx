// STUB — replaced at merge by lane B
/**
 * A STAND-IN FOR THE VESTING RULE, so lane D's pages compile in this worktree. Lane B's rule
 * ticks every second and hatches what has vested; this one prints the schedule's dates only,
 * which the grant's own terms confirm.
 */
import type {JSX} from "react";
import {dateUTC} from "@/lib/format";
import type {CertificateData} from "./certificate";

export function VestingRule(props: {data: CertificateData; tone: "engrave" | "vault" | "canvas"}): JSX.Element {
  const d = props.data;
  const cliffAt = d.start + d.cliffSeconds;
  const endsAt = d.start + d.durationSeconds;
  return (
    <p
      style={{
        margin: 0,
        fontSize: 13,
        color: props.tone === "vault" ? "var(--on-vault-2)" : "var(--muted)",
      }}
    >
      Vests every second from {dateUTC(d.start)} to {dateUTC(endsAt)}
      {d.cliffSeconds > 0 ? `; nothing before the cliff on ${dateUTC(cliffAt)}` : ""}.
    </p>
  );
}
