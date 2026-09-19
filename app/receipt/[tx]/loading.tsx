import {SkeletonRows} from "@/components/app/skeleton";
import "@/components/app/skeleton.css";
import "./receipt.css";

/** The receipt is unshelled and print-like, so its waiting state is too. */
export default function Loading() {
  return (
    <main className="wa-receipt" aria-busy="true">
      <SkeletonRows rows={6} />
    </main>
  );
}
