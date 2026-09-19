import {LoadingFrame} from "@/components/app/loading-frame";

export default function Loading() {
  return (
    <LoadingFrame
      eyebrow="Grants"
      title="Ownership that vests, out of an escrow you cannot reach into."
      rows={4}
    />
  );
}
