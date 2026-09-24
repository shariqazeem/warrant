import {SkeletonRows} from "@/components/app/skeleton";
import {SiteNav} from "@/components/site/site-frame";
import "@/components/app/skeleton.css";
import "@/app/landing.css";
import "./cert-page.css";

/**
 * THE CERTIFICATE PAGE, WAITING: the real layout with nothing in it that reads as a figure.
 * The certificate's place is held by a plain bond sheet of its own shape, so nothing moves
 * when it arrives.
 */
export default function Loading() {
  return (
    <div className="wa-landing wa-cp" aria-busy="true">
      <div className="wa-dark wa-vault wa-cp-top">
        <SiteNav />
        <div className="wa-cp-hero">
          <p className="wa-cp-kicker">Reading the certificate from X Layer…</p>
        </div>
      </div>
      <div className="wa-tear" aria-hidden />
      <main id="main" className="wa-cp-main">
        <div className="wa-cp-cert">
          <div className="wa-cp-skel-cert" aria-hidden />
        </div>
        <div className="wa-cp-grid">
          <div className="wa-cp-left">
            <SkeletonRows rows={3} />
          </div>
          <div className="wa-cp-right">
            <SkeletonRows rows={7} />
          </div>
        </div>
      </main>
    </div>
  );
}
