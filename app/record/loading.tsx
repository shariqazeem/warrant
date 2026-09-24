import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import "@/app/home.css";
import "./record.css";

/** While the record is read: its heading, and ruled shapes where the rows will be. Never a number. */
export default function RecordLoading() {
  return (
    <div className="wa-record">
      <div className="wa-home-top">
        <SiteNav />
      </div>
      <main id="main" className="wa-record-main" aria-busy="true">
        <p className="wa-record-kicker">Public record</p>
        <h1 className="wa-record-h1">Every grant and every payroll run.</h1>
        <p className="wa-record-lead" role="status">
          Reading the record from X Layer…
        </p>
        <span className="wa-record-skel" aria-hidden />
        <span className="wa-record-skel" aria-hidden />
        <span className="wa-record-skel" aria-hidden />
      </main>
      <SiteFoot />
    </div>
  );
}
