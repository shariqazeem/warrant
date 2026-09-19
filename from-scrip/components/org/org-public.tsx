import Link from "next/link";
import type { OrgView } from "@/lib/org/view";
import { dateUTC, short, since, unitsFromRaw, usdc } from "@/lib/format";
import { GrantBar } from "./grant-bar";

/**
 * AN ORGANISATION'S PAGE — "pays in stock since September 2026." People paid, stock delivered,
 * grants vesting, the last run, and every receipt. Recipients appear by handle only where
 * their register is public; otherwise they are a count. This is what an organisation shares.
 */
export function OrgPublic({ view, site }: { view: OrgView; site: string }) {
  const now = Math.floor(Date.now() / 1000);
  const active = view.grants.filter((g) => g.sealed && g.state === "active");
  return (
    <div className="sp-org">
      <header className="sp-org-head">
        <p className="sp-page-eyebrow">@{view.handle ?? short(view.owner)}, an organisation</p>
        <h1 className="sp-org-h1">{view.payments > 0 ? `Pays in stock since ${dateUTC(view.since ?? now)}.` : "Pays in stock."}</h1>
        <p className="sp-org-lede">
          Every payment below is a receipt anyone can open. People are named only where they published their own register.{" "}
          <Link href={`/pay/${view.handle ?? view.owner}`}>Pay @{view.handle ?? short(view.owner)}</Link> the same way.
        </p>
      </header>

      <section className="sp-org-facts">
        <Fact k="People paid" v={String(view.peoplePaid)} />
        <Fact k="Payments" v={String(view.payments)} />
        <Fact k="Paid, in dollars" v={usdc(BigInt(view.paidUsdc))} />
        {view.delivered.map((d) => (
          <Fact key={d.asset} k={`${d.symbol} delivered`} v={d.decimals !== null ? unitsFromRaw(BigInt(d.amountRaw), d.decimals) : d.amountRaw} />
        ))}
        <Fact k="Grants vesting" v={String(active.length)} />
        {view.runs[0] ? <Fact k="Last run" v={since(view.runs[0].lastAt, now * 1000)} note={`${view.runs[0].settled} people`} /> : null}
      </section>

      {active.length > 0 ? (
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Grants vesting</span>
            <span>{active.length}</span>
          </p>
          <div className="sp-org-rows">
            {active.map((g) => (
              <Link key={g.pda} href={`/grant/${g.pda}`} className="sp-org-row">
                <span className="who">{g.recipientHandle ? `@${g.recipientHandle}` : short(g.recipient)}</span>
                <span className="what">
                  {g.decimals !== null ? unitsFromRaw(BigInt(g.totalRaw), g.decimals) : g.totalRaw} {g.symbol}
                  {g.reason ? <span className="why"> for “{g.reason}”</span> : null}
                </span>
                <GrantBar totalRaw={BigInt(g.totalRaw)} releasedRaw={BigInt(g.releasedRaw)} startUnix={g.startUnix} cliffSecs={g.cliffSecs} durationSecs={g.durationSecs} now={now} compact />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {view.runs.length > 0 ? (
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Runs</span>
            <span>a payslip for a team</span>
          </p>
          <div className="sp-org-rows">
            {view.runs.map((r) => (
              <Link key={r.id} href={`/run/${r.id}`} className="sp-org-row">
                <span className="who">{r.label || `Run ${r.id.slice(0, 6)}`}</span>
                <span className="what">
                  {r.settled} paid, {usdc(BigInt(r.paidUsdc))}
                </span>
                <span className="when">{dateUTC(r.lastAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sp-org-section">
        <p className="sp-section-label">
          <span>Payments, newest first</span>
          {view.recent.length > 0 ? <span>{view.recent.length}</span> : null}
        </p>
        {view.recent.length === 0 ? (
          <p className="sp-register-empty">No payment has settled yet. The first one appears here, with its receipt.</p>
        ) : (
          <div className="sp-org-rows">
            {view.recent.map((r) => (
              <Link key={r.id} href={`/receipt/${r.sig}`} className="sp-org-row">
                <span className="who">{r.recipientHandle ? `@${r.recipientHandle}` : short(r.recipient)}</span>
                <span className="what">
                  {r.kind === "grant" ? "granted " : r.kind === "vest" ? "vested " : ""}
                  {r.decimals !== null ? unitsFromRaw(BigInt(r.amountRaw), r.decimals) : r.amountRaw} {r.symbol}
                  {r.kind !== "vest" ? ` for ${usdc(BigInt(r.paidUsdc))}` : ""}
                  {r.reason ? <span className="why"> · “{r.reason}”</span> : null}
                </span>
                <span className="when">{since(r.settledUnix, now * 1000)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <p className="sp-fact-note">
        Share this page: <span className="mono">{site}/@{view.handle ?? view.owner}</span>
      </p>
    </div>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="sp-ledger-fact">
      <p className="k">{k}</p>
      <p className="v">{v}</p>
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}
