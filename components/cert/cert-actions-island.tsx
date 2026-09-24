"use client";

/** The actions with their wallet around them, loaded only once the page is interactive. */
import {Guard} from "@/components/app/guard";
import {WalletProvider} from "@/components/wallet/provider";
import {CertActions, type CertActionsProps} from "./cert-actions";

export function CertActionsIsland(p: CertActionsProps) {
  return (
    <Guard where="certificate">
      <WalletProvider>
        <CertActions {...p} />
      </WalletProvider>
    </Guard>
  );
}
