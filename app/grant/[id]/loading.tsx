import {SkeletonRows} from "@/components/app/skeleton";
import "@/components/app/skeleton.css";
import "@/app/receipt/[tx]/receipt.css";

/** A grant's record is unshelled and print-like, like a receipt, so its waiting state is too. */
export default function Loading() {
  return (
    <main className="wa-receipt" aria-busy="true">
      <SkeletonRows rows={6} />
    </main>
  );
}
