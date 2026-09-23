import {CopyText} from "@/components/app/copy-text";
import {AssetNote} from "@/components/pay/asset-note";
import {assetByAddress} from "@/lib/assets";
import {
  CHOICE_DOMAIN,
  CHOICE_PRIMARY_TYPE,
  CHOICE_TYPES,
  choiceDigest,
  choiceParts,
  type StoredChoice,
} from "@/lib/choice";
import {short, stampUTC} from "@/lib/format";
import "./record.css";

/**
 * THEIR CHOICE, ON THEIR PUBLIC PAGE: how this wallet asked to be paid, in plain words, and
 * the signature behind the words, folded away, so anyone can check one against the other.
 *
 * Server-rendered. The only client code is the note on the stock and the copy buttons.
 */
export function TheirChoice({choice}: {choice: StoredChoice}) {
  const parts = choiceParts(choice);
  const stock = choice.stockBps > 0 ? assetByAddress(choice.asset) : undefined;

  // The whole payload an EIP-712 tool asks for, domain type included, exactly as signed.
  // Valid JSON, one key to a line, so it reads on a page and pastes into a tool.
  const payload = {
    types: {
      EIP712Domain: [
        {name: "name", type: "string"},
        {name: "version", type: "string"},
        {name: "chainId", type: "uint256"},
      ],
      ...CHOICE_TYPES,
    },
    primaryType: CHOICE_PRIMARY_TYPE,
    domain: CHOICE_DOMAIN,
    message: {
      person: choice.person,
      stockBps: choice.stockBps,
      asset: choice.asset,
      eligible: choice.eligible,
      issuedAt: choice.issuedAt,
    },
  };
  const signed = `{\n${Object.entries(payload)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n")}\n}`;

  return (
    <section className="wa-co-section wa-their">
      <p className="wa-kicker">Their choice</p>
      <p className="wa-their-now">
        <span className="wa-their-share">{parts.share}</span> {parts.rest}
      </p>
      <p className="wa-their-when">
        Signed by this wallet on {stampUTC(choice.issuedAt)}. Every company that pays it through
        Warrant follows this choice.
      </p>
      {stock ? (
        <div className="wa-their-note">
          <AssetNote symbol={stock.symbol} name={stock.name} audience="anyone" />
        </div>
      ) : null}

      <details className="wa-their-proof">
        <summary>Check the signature</summary>
        <p className="wa-their-lede">
          What the wallet signed: a message, not a transaction. Any EIP-712 tool can confirm
          that the signature below was made by {short(choice.person)} for exactly these fields.
          Warrant checked it before saving it.
        </p>
        <dl className="wa-their-rows">
          <div>
            <dt>Signed for</dt>
            <dd>
              {CHOICE_DOMAIN.name}, version {CHOICE_DOMAIN.version}, on X Layer (chain{" "}
              {CHOICE_DOMAIN.chainId})
            </dd>
          </div>
          <div>
            <dt>person</dt>
            <dd className="wa-mono">{choice.person}</dd>
          </div>
          <div>
            <dt>stockBps</dt>
            <dd>
              <span className="wa-mono">{choice.stockBps}</span> — {parts.share} of each payment
            </dd>
          </div>
          <div>
            <dt>asset</dt>
            <dd>
              <span className="wa-mono">{choice.asset}</span>
              {stock ? ` — ${stock.symbol}` : choice.stockBps === 0 ? " — none" : ""}
            </dd>
          </div>
          <div>
            <dt>eligible</dt>
            <dd>
              <span className="wa-mono">{String(choice.eligible)}</span>
              {choice.eligible
                ? " — they stated they are not a US person and do not live in Canada, the UK or Australia"
                : ""}
            </dd>
          </div>
          <div>
            <dt>issuedAt</dt>
            <dd>
              <span className="wa-mono">{choice.issuedAt}</span> — {stampUTC(choice.issuedAt)}
            </dd>
          </div>
          <div>
            <dt>Digest</dt>
            <dd className="wa-mono">{choiceDigest(choice)}</dd>
          </div>
          <div>
            <dt>Signature</dt>
            <dd>
              <span className="wa-mono">{choice.signature}</span>
              <br />
              <CopyText text={choice.signature} label="Copy the signature" />
            </dd>
          </div>
        </dl>
        <pre className="wa-their-pre">{signed}</pre>
        <p className="wa-their-copy">
          <CopyText text={signed} label="Copy what was signed" />
        </p>
      </details>
    </section>
  );
}
