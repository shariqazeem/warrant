"use client";

import {AlertCircle, Download, FileText, Loader2} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {buildPayment, type BuiltLine, type BuiltPayment} from "@/app/pay/actions";
import {ASSETS, defaultAsset} from "@/lib/assets";
import {MAX_RUN_LINES, RUN_TEMPLATE, parseRunFile, type ParsedRow} from "@/lib/csv";
import {short, unitsFromRaw, usdt} from "@/lib/format";
import {impactText, worstPriceImpact} from "@/lib/payment";
import {newRunId} from "@/lib/run-id";
import {held, type Outcome} from "@/lib/outcome";
import {QUOTE_LOST, freshness, quoteAge} from "@/lib/quote-age";
import {WalletPanel} from "@/components/wallet/wallet-panel";
import {NEEDS_OKB, useWallet} from "@/components/wallet/use-wallet";
import {syncFromChain} from "@/app/sync/actions";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {usePay} from "@/components/pay/use-pay";
import {AssetNote} from "@/components/pay/asset-note";
import "@/components/pay/pay.css";
import "./run.css";

/** One priced line. `impact` is the aggregator's price impact for it, or null if unsaid. */
type Built = {row: ParsedRow; line: BuiltLine; expectedOut: string; impact: number | null};

/**
 * Priced lines, and the lines they were priced FOR. `sig` is the run's inputs at the
 * moment the first price was asked for; `at` is when that first, oldest, price was asked.
 */
type BuiltRun = {sig: string; lines: Built[]; at: number};

/**
 * A FILE OF NAMES BECOMES LINES, THEN ONE SIGNATURE, THEN N RECEIPTS.
 *
 * The file becomes lines BEFORE anything is signed, and a line that will not pay is shown
 * in place with the rule it broke rather than dropped. A payer must be able to see the
 * whole run — including what is wrong with it — before a wallet ever opens.
 *
 * Routes are built one line at a time, on purpose. The aggregator rate-limits, and a
 * progress count that moves is honest where a spinner for nine seconds is not.
 */
export function RunBuilder({payroll}: {payroll: `0x${string}` | undefined}) {
  const router = useRouter();
  const wallet = useWallet();

  const [text, setText] = useState("");
  const [asset, setAsset] = useState(defaultAsset().address);
  const [built, setBuilt] = useState<BuiltRun | null>(null);
  /** Ticks so the age of the prices stays true on screen. */
  const [, setTick] = useState(0);
  const [building, setBuilding] = useState(false);
  const [buildDone, setBuildDone] = useState(0);
  const [buildWhy, setBuildWhy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const {pay, phase, why, note, reset} = usePay(payroll);
  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();

  const parsed = useMemo(() => parseRunFile(text, asset), [text, asset]);

  // ROUTES BELONG TO THE LINES THAT PRODUCED THEM. A route's calldata names its recipient
  // and its amount, so a route priced for yesterday's version of line 3 pays yesterday's
  // line 3. Every route is kept with the signature of the lines it was built for, and one
  // whose signature no longer matches what is on screen is not shown and cannot be signed.
  const signature = useMemo(
    () =>
      JSON.stringify([
        asset,
        parsed.good.map((r) => [r.lineNumber, r.recipient, r.usd, r.cashUsd, r.reason]),
      ]),
    [asset, parsed.good],
  );
  const current = built?.sig === signature ? built : null;

  useTxToast(phase === "idle" ? "idle" : phase, `Pay ${parsed.good.length} ${parsed.good.length === 1 ? "person" : "people"}`, {
    detail: why ?? undefined,
  });

  const builtAt = current?.at ?? null;
  useEffect(() => {
    if (builtAt === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [builtAt]);

  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  // Once paid, these routes are spent: the button stays down while the receipt opens and
  // never offers to pay the same prices again.
  const paid = phase === "done";
  // While prices are loading, or a payment is in flight or done, the lines on screen must
  // stay the lines being priced or paid.
  const locked = building || busy || paid;

  // Each build takes a number. A build whose number is no longer the latest — stopped, or
  // superseded — drops whatever it was about to write.
  const seq = useRef(0);

  const takeFile = useCallback(async (file: File) => {
    setBuilt(null);
    setBuildWhy(null);
    setText(await file.text());
  }, []);

  const buildRoutes = useCallback(async () => {
    if (parsed.tooMany || parsed.good.length === 0) return;
    const mine = ++seq.current;
    const sig = signature;
    const rows = parsed.good;

    setBuilding(true);
    setBuildWhy(null);
    setBuildDone(0);
    setBuilt(null);
    const out: Built[] = [];
    // A run is as old as its OLDEST price, and that is the first one asked for. Timing the
    // run from its last line would call a two-minute-old first price fresh.
    let firstAskedAt: number | null = null;

    for (const row of rows) {
      const askedAt = Date.now();
      let res: Outcome<BuiltPayment>;
      try {
        res = await buildPayment({
          recipient: row.recipient,
          usd: row.usd,
          cashUsd: row.cashUsd,
          asset,
          reason: row.reason,
        });
      } catch {
        // The request never came back. The build stops here rather than spinning for ever,
        // and "Get prices" is the way to try again.
        res = held(QUOTE_LOST);
      }
      if (mine !== seq.current) return;
      if (!res.ok) {
        setBuilding(false);
        setBuildWhy(`Line ${row.lineNumber}: ${res.why}`);
        return;
      }
      firstAskedAt ??= askedAt;
      out.push({
        row,
        line: res.value.line,
        expectedOut: res.value.expectedOut,
        impact: res.value.priceImpactPercent,
      });
      setBuildDone(out.length);
    }

    setBuilt({sig, lines: out, at: firstAskedAt ?? Date.now()});
    setBuilding(false);
  }, [parsed.good, parsed.tooMany, asset, signature]);

  const stopBuilding = useCallback(() => {
    seq.current++;
    setBuilding(false);
  }, []);

  const send = useCallback(async () => {
    // Only routes built for exactly the lines on screen are ever signed.
    if (!built || built.sig !== signature || built.lines.length === 0) return;
    if (built.lines.length > MAX_RUN_LINES) return;
    const total = built.lines.reduce((sum, b) => sum + BigInt(b.line.stableAmount), 0n);
    const result = await pay(
      built.lines.map((b) => b.line),
      asset,
      newRunId(),
      total,
    );
    if (result) {
      // Receipt first, as in pay-form: it reads its own transaction, so it is already true.
      // The run and company pages catch up behind it, without holding the payer here.
      router.push(`/receipt/${result.hash}`);
      void syncFromChain().catch(() => undefined);
    }
  }, [built, signature, asset, pay, router]);

  // N ROUTES ARE EXPENSIVE TO REBUILD, so this does not do it behind the payer's back the
  // way /pay does. It says how old the prices are and refuses to sign once they are too
  // old — the gap between pricing a run and connecting a wallet is exactly where minutes
  // go, and a run that reverts in front of an audience is worth avoiding.
  const age = builtAt === null ? null : freshness(builtAt);
  const totalOut = current?.lines.reduce((sum, b) => sum + BigInt(b.expectedOut), 0n) ?? 0n;
  // The run's price impact is its worst line's. A line paid all in USDT swaps nothing and
  // has none; if any line that swaps went unmeasured, the run's figure is not claimed.
  const worstImpact = worstPriceImpact(
    (current?.lines ?? [])
      .filter((b) => BigInt(b.line.stableAmount) > BigInt(b.line.cashAmount))
      .map((b) => b.impact),
  );

  return (
    <div className="wa-run">
      {/* ── the file ─────────────────────────────────────────────── */}
      <section
        className={`wa-drop${dragging ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !locked) void takeFile(file);
        }}
      >
        <textarea
          className="wa-drop-text wa-mono"
          value={text}
          spellCheck={false}
          disabled={locked}
          onChange={(e) => {
            setText(e.target.value);
            setBuilt(null);
            setBuildWhy(null);
          }}
          placeholder={`address, amount, note\n0x…, 25, Design review week 38\n0x…, 40, Shipped the indexer`}
          rows={6}
          aria-label="Your team, one per line: address, amount, note"
        />
        <div className="wa-drop-act">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared, so choosing the same file again after an edit still loads it.
              e.target.value = "";
              if (file && !locked) void takeFile(file);
            }}
          />
          <button
            type="button"
            className="wa-btn"
            disabled={locked}
            onClick={() => fileInput.current?.click()}
          >
            <FileText size={16} strokeWidth={2} aria-hidden />
            Upload a CSV
          </button>
          <a
            className="wa-btn"
            download="warrant-run.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(RUN_TEMPLATE)}`}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Download template
          </a>
          <span className="wa-drop-hint">
            Paste your team or drop a CSV here — one person per line: wallet address,
            amount in USD, and a note for their receipt. An optional fourth column pays
            part of it as USDT instead.
          </span>
        </div>
      </section>

      {/* ── the asset ────────────────────────────────────────────── */}
      <label className="wa-field">
        <span className="k">Everyone receives</span>
        <span className="wa-field-v">
          <select
            className="wa-input"
            value={asset}
            disabled={locked}
            onChange={(e) => {
              setAsset(e.target.value as typeof asset);
              setBuilt(null);
              setBuildWhy(null);
            }}
          >
            {ASSETS.map((a) => (
              <option key={a.address} value={a.address}>
                {a.name} ({a.symbol})
              </option>
            ))}
          </select>
          {/* What the issuer can do, and who may hold it, on the row where it is chosen —
              the same note /pay and /grants carry. */}
          <AssetNote symbol={chosen.symbol} name={chosen.name} />
        </span>
      </label>

      {/* ── the lines ────────────────────────────────────────────── */}
      {parsed.rows.length === 0 ? (
        <p className="wa-quote-waiting">
          Your team appears here as a list before anything is signed, with any line that
          needs fixing clearly marked.
        </p>
      ) : (
        <>
          <ol className="wa-lines">
            {parsed.rows.map((row) => {
              const ok = row.verdict.ok;
              const route = current?.lines.find((b) => b.row.lineNumber === row.lineNumber);
              return (
                <li key={row.lineNumber} className={`wa-line${ok ? "" : " is-bad"}`}>
                  <span className="wa-line-n wa-mono">{row.lineNumber}</span>
                  <span className="wa-line-who wa-mono">
                    {ok ? short(row.recipient) : row.recipient || "—"}
                  </span>
                  <span className="wa-line-why">{row.reason || <em>no reason</em>}</span>
                  {ok ? (
                    <>
                      <span className="wa-line-amt wa-mono">
                        {usdt(row.verdict.value.total)}
                      </span>
                      <span className="wa-line-gets wa-mono">
                        {route
                          ? `${unitsFromRaw(BigInt(route.expectedOut), chosen.decimals)} ${chosen.symbol}`
                          : ""}
                      </span>
                    </>
                  ) : (
                    <span className="wa-line-refusal">
                      <AlertCircle size={14} strokeWidth={2} aria-hidden />
                      {row.verdict.why}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="wa-run-sum">
            <p>
              <strong>{parsed.good.length}</strong> {parsed.good.length === 1 ? "person" : "people"} ready,{" "}
              <strong className="wa-mono">{usdt(parsed.total)}</strong> in total
              {parsed.bad.length > 0 ? (
                <>
                  {" "}
                  — <span className="is-bad">{parsed.bad.length} {parsed.bad.length === 1 ? "line needs" : "lines need"} fixing</span>{" "}
                  and will not be paid.
                </>
              ) : null}
            </p>
            {current ? (
              <p className="wa-run-out">
                Together they receive{" "}
                <strong className="wa-mono">
                  {unitsFromRaw(totalOut, chosen.decimals)} {chosen.symbol}
                </strong>
                , each straight into their own wallet.
              </p>
            ) : null}
            {current && worstImpact !== null ? (
              <p className="wa-run-impact">
                Price impact at most <span className="wa-mono">{impactText(worstImpact)}</span> on
                any line.
              </p>
            ) : null}
          </div>
        </>
      )}

      {/*
        THE ONE SIGNATURE.

        Building a route needs no wallet, so this does not ask for one. A payer sees what
        every person would receive before anything of theirs is involved — the same
        principle as the file becoming lines before it is signed. The wallet is asked for
        once, at the only moment it is needed.
      */}
      {parsed.good.length > 0 ? (
        <div className="wa-pay-act">
          <WalletPanel need={current ? parsed.total : undefined} />

          {(() => {
            // THE BUTTON ALWAYS SAYS WHAT IT WILL DO, OR WHAT IS STOPPING IT.
            if (!current) {
              return (
                <button
                  type="button"
                  className={`wa-btn is-primary is-wide${parsed.tooMany ? " is-blocked" : ""}`}
                  disabled={building || Boolean(parsed.tooMany)}
                  onClick={() => void buildRoutes()}
                >
                  {building ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
                  {building
                    ? `Getting prices… ${buildDone} of ${parsed.good.length}`
                    : parsed.tooMany
                      ? "Too many people for one run"
                      : `Get prices for ${parsed.good.length} ${parsed.good.length === 1 ? "person" : "people"}`}
                </button>
              );
            }

            const blocker =
              wallet.status === "disconnected" || wallet.status === "connecting"
                ? "Connect a wallet to pay"
                : wallet.status === "wrong-chain"
                  ? "Switch to X Layer to pay"
                  : wallet.noGas
                    ? NEEDS_OKB
                    : age === "stale"
                      ? "Prices are out of date — refresh them"
                      : wallet.usdt !== undefined && wallet.usdt < parsed.total
                        ? `Not enough USDT — you have ${usdt(wallet.usdt)}`
                        : null;

            return (
              <button
                type="button"
                className={`wa-btn is-primary is-wide${blocker && !busy && !paid ? " is-blocked" : ""}`}
                disabled={Boolean(blocker) || busy || paid}
                onClick={() => void send()}
              >
                {busy || paid ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
                {paid
                  ? "Paid — opening the receipt…"
                  : phase === "signing"
                    ? "Confirm in your wallet…"
                    : phase === "confirming"
                      ? "Sending…"
                      : phase === "building"
                        ? "Preparing…"
                        : (blocker ??
                          `Pay ${parsed.good.length} ${parsed.good.length === 1 ? "person" : "people"} · ${usdt(parsed.total)}`)}
              </button>
            );
          })()}

          {building ? (
            <p className="wa-quote-age">
              The list is locked until the prices are in.{" "}
              <button type="button" className="wa-linkish" onClick={stopBuilding}>
                Stop
              </button>
            </p>
          ) : null}

          {current && builtAt !== null ? (
            <p className={`wa-quote-age${age === "stale" ? " is-stale" : ""}`}>
              {/* The oldest price in the run: the first line's. */}
              Prices from {quoteAge(builtAt)}.{" "}
              <button
                type="button"
                className="wa-linkish"
                disabled={locked}
                onClick={() => void buildRoutes()}
              >
                {building ? "Refreshing…" : "Refresh prices"}
              </button>
            </p>
          ) : null}

          {note && busy ? <p className="wa-fine">{note}</p> : null}
          {parsed.tooMany ? <p className="wa-refusal">{parsed.tooMany}</p> : null}
          {buildWhy ? <p className="wa-refusal">{buildWhy}</p> : null}
          {phase === "failed" && why ? (
            <p className="wa-refusal">
              {why}{" "}
              <button type="button" className="wa-linkish" onClick={reset}>
                Try again
              </button>
            </p>
          ) : null}

          <p className="wa-fine">
            One signature pays everyone in a single transaction. Each payment has a minimum
            amount of stock that the contract enforces; if the price moves too far on any
            line, the whole batch is cancelled and no USDT leaves your wallet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
