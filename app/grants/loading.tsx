import {SiteNav} from "@/components/site/site-frame";
import "@/app/landing.css";
import "@/components/grants/issue.css";

const FIELDS = ["Who receives it", "Stock", "Grant value", "Vesting", "After issuing"] as const;

/**
 * LOADING, IN THE REAL LAYOUT. The heading and the labels are already known, so they are the
 * real ones; each field is an empty outline the size of the field that is coming, and the
 * certificate is its outline. No figure is drawn, because a grey bar where a number goes
 * reads as a number.
 */
export default function Loading() {
  return (
    <div className="wa-landing wa-issue-page">
      <div className="wa-dark">
        <SiteNav />
      </div>
      <main aria-busy="true">
        <div className="wa-issue">
          <header className="wa-issue-head">
            <h1>Issue a grant</h1>
            <p>
              The certificate on the right follows every choice you make, and becomes real when you
              issue it.
            </p>
          </header>
          <div className="wa-issue-form">
            {FIELDS.map((label) => (
              <div className="wa-issue-field" key={label}>
                <span className="wa-issue-label">{label}</span>
                <span className="wa-issue-skeleton is-field" aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="wa-issue-aside">
            <div className="wa-issue-cert">
              <div className="wa-issue-cert-outline" aria-hidden="true" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
