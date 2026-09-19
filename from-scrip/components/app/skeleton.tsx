import { PageFrame } from "./page-frame";
import "./skeleton.css";

/**
 * LOADING IS THE REAL LAYOUT, WITH THE FIGURES NOT YET IN IT. A spinner says "something is
 * happening somewhere"; ruled rows the width of the rows that are coming say "this page, in
 * a moment", and the page does not jump when they arrive.
 *
 * A bar is never a number. Nothing here reads as a value, so no one can mistake the wait for
 * a figure — which is the same rule the empty states follow.
 */
export function Bar({ w = "100%", tall = false }: { w?: string; tall?: boolean }) {
  return <span className={`sp-skel-bar${tall ? " is-tall" : ""}`} style={{ width: w }} aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="sp-skel-rows" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sp-skel-row">
          <Bar w={`${28 + ((i * 13) % 22)}%`} />
          <Bar w={`${34 + ((i * 17) % 26)}%`} />
          <Bar w="12%" />
        </div>
      ))}
    </div>
  );
}

/** A whole shelled page, waiting. `title` is the one thing already known. */
export function SkeletonPage({ eyebrow, title, rows = 5 }: { eyebrow?: string; title: string; rows?: number }) {
  return (
    <PageFrame eyebrow={eyebrow} title={title}>
      <p className="sp-skel-note">Reading the chain…</p>
      <SkeletonRows rows={rows} />
    </PageFrame>
  );
}
