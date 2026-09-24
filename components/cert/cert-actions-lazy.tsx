"use client";

/**
 * THE WALLET CODE, AFTER THE CERTIFICATE. A person opening their certificate on a phone gets
 * the certificate first, ticking; the wallet library — most of the page's script — arrives
 * after, for the few who connect. Until it does, the sentence the connect prompt starts with
 * holds its place, so nothing moves.
 */
import dynamic from "next/dynamic";
import type {CertActionsProps} from "./cert-actions";

const Island = dynamic(() => import("./cert-actions-island").then((m) => m.CertActionsIsland), {
  ssr: false,
  loading: () => (
    <section className="wa-cx" aria-label="What you can do">
      <p className="wa-cx-lead">Connect a wallet to claim, release or seal this grant. Nobody needs one to see it.</p>
      <div className="wa-cx-wait" aria-hidden />
    </section>
  ),
});

export function CertActionsLazy(p: CertActionsProps) {
  return <Island {...p} />;
}
