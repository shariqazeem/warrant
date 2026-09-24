import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {SkeletonRows} from "./skeleton";
import "@/app/landing.css";
import "./skeleton.css";

/**
 * LOADING, IN THE REAL LAYOUT.
 *
 * Never a spinner, and never a bar where a figure will be — a grey rectangle the size of
 * an amount reads as an amount, and a reader who glances at it has been told something
 * false. These are rows in the shape of the rows that are coming, and the heading is the
 * real one, because that part is already known.
 */
export function LoadingFrame({
  eyebrow,
  title,
  rows = 5,
}: {
  eyebrow: string;
  title: string;
  rows?: number;
}) {
  return (
    <div className="wa-landing">
      <div className="wa-vault">
        <SiteNav />
      </div>
      <div className="wa-tear" aria-hidden />
      <main id="main" className="wa-sec is-wide" aria-busy="true">
        <p className="wa-kicker">{eyebrow}</p>
        <h1 className="wa-h1">{title}</h1>
        <div className="wa-skel-gap">
          <SkeletonRows rows={rows} />
        </div>
      </main>
      <div className="wa-vault">
        <SiteFoot />
      </div>
    </div>
  );
}
