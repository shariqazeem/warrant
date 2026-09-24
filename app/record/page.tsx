import type {Metadata} from "next";
import Link from "next/link";
import {SiteFoot, SiteNav} from "@/components/site/site-frame";
import {EXPLORER_ADDRESS} from "@/lib/chain";
import {readRecord} from "@/lib/company";
import {escrowAddress} from "@/lib/grants";
import {catchUp} from "@/lib/indexer";
import {payrollAddress} from "@/lib/receipts";
import {RecordRows} from "./rows";
import "@/app/home.css";
import "./record.css";

export const metadata: Metadata = {
  title: "Public record — Warrant",
  description:
    "Every grant and every payroll run on Warrant, newest first, read from X Layer. Each opens " +
    "its certificate or its payslips.",
};

/**
 * `/record` — THE PUBLIC RECORD. Every grant and every payroll run, newest first, from the
 * chain's events as the indexer copied them. Each row opens its certificate or its payslips.
 *
 * Empty is said in words: before anything happens there is nothing to list, and nothing is
 * listed. There are no sample rows here and never will be.
 */
export const revalidate = 15;

const LIMIT = 200;

export default async function RecordPage() {
  // Close the last few seconds; bounded, and the page still renders if the chain refuses.
  await catchUp();
  const record = readRecord(LIMIT);
  const payroll = payrollAddress();
  const escrow = escrowAddress();

  return (
    <div className="wa-record">
      <div className="wa-home-top">
        <SiteNav />
      </div>
      <main id="main" className="wa-record-main">
        <p className="wa-record-kicker">Public record</p>
        <h1 className="wa-record-h1">Every grant and every payroll run.</h1>
        <p className="wa-record-lead">
          Newest first, read from the events the contracts wrote on X Layer. Each grant opens its
          certificate, and each run opens its payslips. Nothing here needs a wallet.
        </p>

        {!record.ok ? (
          <div className="wa-record-nothing" role="status">
            <strong>The record could not be read just now.</strong>
            {record.why}
          </div>
        ) : record.value.entries.length === 0 ? (
          <div className="wa-record-nothing">
            <strong>Nothing on the record yet.</strong>
            When a company issues a grant or runs payroll through Warrant, it appears here the
            moment it is on X Layer, with its certificate or its payslips.{" "}
            <Link href="/grants">Issue the first grant</Link>.
          </div>
        ) : (
          <>
            <p className="wa-record-counts">
              {record.value.grantCount} {record.value.grantCount === 1 ? "grant" : "grants"} and{" "}
              {record.value.runCount} payroll {record.value.runCount === 1 ? "run" : "runs"} on the record.
            </p>
            <RecordRows entries={record.value.entries} />
            {record.value.entries.length < record.value.grantCount + record.value.runCount ? (
              <p className="wa-record-note">
                The newest {record.value.entries.length} are listed. Each company&rsquo;s own page
                lists all of its grants and payments.
              </p>
            ) : null}
          </>
        )}

        <p className="wa-record-note">
          A payroll run is everyone paid with one signature, each with their own payslip; a single
          payment is a run of one.
          {payroll.ok && escrow.ok ? (
            <>
              {" "}
              The events are written by{" "}
              <a href={EXPLORER_ADDRESS(escrow.value)}>GrantEscrow</a> and{" "}
              <a href={EXPLORER_ADDRESS(payroll.value)}>Payroll</a>, which anyone can read on
              OKLink.
            </>
          ) : null}
        </p>
      </main>
      <SiteFoot />
    </div>
  );
}
