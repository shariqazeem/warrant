import {PayForm, type FixedRecipient} from "@/components/pay/pay-form";
import {Toasts} from "@/components/toast/toasts";
import {WalletProvider} from "@/components/wallet/provider";
import type {Outcome} from "@/lib/outcome";

/**
 * THE PAY BOX: the pay form with its wallet and its one toast — or, when payments are not
 * switched on, a sentence saying so instead of a form that cannot work.
 *
 * `/pay` and a person's pay link show the same one. A server component: only the form
 * inside it is a client leaf.
 *
 * Keyed by the fixed recipient, so a link to someone else — even the same page with another
 * `?to=` — starts a fresh form, and nothing half-typed for one person carries to the next.
 */
export function PayBox({payroll, to}: {payroll: Outcome<`0x${string}`>; to?: FixedRecipient}) {
  if (!payroll.ok) {
    return (
      <div className="wa-nothing">
        <strong>Payments are not switched on yet.</strong>
        {payroll.why}
      </div>
    );
  }
  return (
    <WalletProvider>
      <PayForm key={to?.address.toLowerCase() ?? "anyone"} payroll={payroll.value} to={to} />
      <Toasts />
    </WalletProvider>
  );
}
