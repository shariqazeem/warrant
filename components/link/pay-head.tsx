import {CopyText} from "@/components/app/copy-text";
import {EXPLORER_ADDRESS} from "@/lib/chain";
import type {StoredChoice} from "@/lib/choice";
import {dateUTC, short} from "@/lib/format";
import {NOT_CHOSEN, splitWords} from "./pay-link";
import "./link.css";

/**
 * THE TOP OF A PAY LINK: who is being paid, and how they asked to be paid, before anything
 * else — the pay box follows it directly, on a phone too.
 *
 * Every word of the split comes from the choice the wallet signed (pay-link.ts), and the
 * date is the one on the signature; the section with the signature itself is further down
 * the page, at #signed. Server-rendered: the only client code is the two copy buttons.
 */
export function PayHead({
  address,
  choice,
  link,
}: {
  /** The wallet, as the page prints it (checksummed). */
  address: string;
  choice: StoredChoice | null;
  /** The whole link to this page, to copy and send. */
  link: string;
}) {
  const split = choice ? splitWords(choice) : null;
  return (
    <header className="wa-link-head">
      <p className="wa-kicker">Pay link</p>
      <h1 className="wa-link-h">
        Pay <span className="wa-link-who">{short(address)}</span>
      </h1>
      <p className="wa-link-tools">
        <CopyText text={address} label="Copy the address" />
        <CopyText text={link} label="Copy the link" />
        <a href={EXPLORER_ADDRESS(address)} target="_blank" rel="noreferrer">
          See it on X Layer
        </a>
      </p>

      {choice && split ? (
        <>
          <p className="wa-link-split">
            They get{" "}
            {split.share ? (
              <>
                <span className="wa-link-share">{split.share}</span>{" "}
              </>
            ) : null}
            {split.rest}
          </p>
          <p className="wa-link-note">
            Their own choice, signed by this wallet on {dateUTC(choice.issuedAt)}.{" "}
            <a href="#signed">Check the signature</a>
          </p>
        </>
      ) : (
        <p className="wa-link-split">{NOT_CHOSEN}</p>
      )}
    </header>
  );
}
