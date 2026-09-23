import {LoadingFrame} from "@/components/app/loading-frame";

export default function Loading() {
  return (
    <LoadingFrame
      eyebrow="Vesting grants"
      title="Give someone stock that vests over time."
      rows={4}
    />
  );
}
