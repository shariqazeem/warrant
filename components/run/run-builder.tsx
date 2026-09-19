"use client";

import {AlertCircle, Download, FileText, Loader2} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {buildPayment, type BuiltLine} from "@/app/pay/actions";
import {ASSETS, ISSUER_NOTE, defaultAsset} from "@/lib/assets";
import {RUN_TEMPLATE, parseRunFile, type ParsedRow} from "@/lib/csv";
import {short, unitsFromRaw, usdt} from "@/lib/format";
import {newRunId} from "@/lib/run-id";
import {freshness, quoteAge} from "@/lib/quote-age";
import {Connect} from "@/components/wallet/connect";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {usePay} from "@/components/pay/use-pay";
import "@/components/pay/pay.css";
import "./run.css";

type Built = {row: ParsedRow; line: BuiltLine; expectedOut: string};

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
  const {isConnected} = useAccount();

  const [text, setText] = useState("");
  const [asset, setAsset] = useState(defaultAsset().address);
  const [built, setBuilt] = useState<Built[] | null>(null);
  const [builtAt, setBuiltAt] = useState<number | null>(null);
  /** Ticks so the age of the prices stays true on screen. */
  const [, setTick] = useState(0);
  const [building, setBuilding] = useState(false);
  const [buildDone, setBuildDone] = useState(0);
  const [buildWhy, setBuildWhy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const {pay, phase, why, reset} = usePay(payroll);
  const chosen = ASSETS.find((a) => a.address === asset) ?? defaultAsset();

  const parsed = useMemo(() => parseRunFile(text, asset), [text, asset]);

  useTxToast(phase === "idle" ? "idle" : phase, `Pay ${parsed.good.length} people`, {
    detail: why ?? undefined,
  });

  useEffect(() => {
    if (builtAt === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [builtAt]);

  const takeFile = useCallback(async (file: File) => {
    setBuilt(null);
    setBuiltAt(null);
    setBuildWhy(null);
    setText(await file.text());
  }, []);

  const buildRoutes = useCallback(async () => {
    setBuilding(true);
    setBuildWhy(null);
    setBuildDone(0);
    const out: Built[] = [];

    for (const row of parsed.good) {
      const res = await buildPayment({
        recipient: row.recipient,
        usd: row.usd,
        cashUsd: row.cashUsd,
        asset,
        reason: row.reason,
      });
      if (!res.ok) {
        setBuilding(false);
        setBuildWhy(`Line ${row.lineNumber}: ${res.why}`);
        return;
      }
      out.push({row, line: res.value.line, expectedOut: res.value.expectedOut});
      setBuildDone(out.length);
    }

    setBuilt(out);
    setBuiltAt(Date.now());
    setBuilding(false);
  }, [parsed.good, asset]);

  const send = useCallback(async () => {
    if (!built || built.length === 0) return;
    const total = built.reduce((sum, b) => sum + BigInt(b.line.stableAmount), 0n);
    const result = await pay(
      built.map((b) => b.line),
      asset,
      newRunId(),
      total,
    );
    if (result) router.push(`/receipt/${result.hash}`);
  }, [built, asset, pay, router]);

  // N ROUTES ARE EXPENSIVE TO REBUILD, so this does not do it behind the payer's back the
  // way /pay does. It says how old the prices are and refuses to sign once they are too
  // old — the gap between pricing a run and connecting a wallet is exactly where minutes
  // go, and a run that reverts in front of an audience is worth avoiding.
  const age = builtAt === null ? null : freshness(builtAt);
  const busy = phase === "building" || phase === "signing" || phase === "confirming";
  const totalOut = built?.reduce((sum, b) => sum + BigInt(b.expectedOut), 0n) ?? 0n;

  return (
    <div className="wa-run">
      {/* ── the file ─────────────────────────────────────────────── */}
      <section
        className={`wa-drop${dragging ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void takeFile(file);
        }}
      >
        <textarea
          className="wa-drop-text wa-mono"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setBuilt(null);
            setBuiltAt(null);
            setBuildWhy(null);
          }}
          placeholder={`address,amount,reason\n0x…,25,Design review week 38\n0x…,40,Shipped the indexer`}
          rows={6}
          aria-label="The run, as address, amount, reason"
        />
        <div className="wa-drop-act">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void takeFile(file);
            }}
          />
          <button type="button" className="wa-btn" onClick={() => fileInput.current?.click()}>
            <FileText size={16} strokeWidth={2} aria-hidden />
            Choose a file
          </button>
          <a
            className="wa-btn"
            download="warrant-run.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(RUN_TEMPLATE)}`}
          >
            <Download size={16} strokeWidth={2} aria-hidden />
            Template
          </a>
          <span className="wa-drop-hint">
            Drop a CSV, or paste it. Columns: address, amount, reason, and an optional
            fourth for the part paid as cash.
          </span>
        </div>
      </section>

      {/* ── the asset ────────────────────────────────────────────── */}
      <label className="wa-field">
        <span className="k">Everyone is paid in</span>
        <select
          className="wa-input"
          value={asset}
          onChange={(e) => {
            setAsset(e.target.value as typeof asset);
            setBuilt(null);
          }}
        >
          {ASSETS.map((a) => (
            <option key={a.address} value={a.address}>
              {a.symbol} — {a.name}
            </option>
          ))}
        </select>
      </label>

      {/* ── the lines ────────────────────────────────────────────── */}
      {parsed.rows.length === 0 ? (
        <p className="wa-quote-waiting">
          The file becomes lines here before anything is signed, so you can read the whole
          run — including anything wrong with it — before a wallet opens.
        </p>
      ) : (
        <>
          <ol className="wa-lines">
            {parsed.rows.map((row) => {
              const ok = row.verdict.ok;
              const route = built?.find((b) => b.row.lineNumber === row.lineNumber);
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
              <strong>{parsed.good.length}</strong> {parsed.good.length === 1 ? "line" : "lines"} ready,
              totalling <strong className="wa-mono">{usdt(parsed.total)}</strong>
              {parsed.bad.length > 0 ? (
                <>
                  {" "}
                  — <span className="is-bad">{parsed.bad.length} will not pay</span> and are
                  not included.
                </>
              ) : null}
            </p>
            {built ? (
              <p className="wa-run-out">
                They receive{" "}
                <strong className="wa-mono">
                  {unitsFromRaw(totalOut, chosen.decimals)} {chosen.symbol}
                </strong>{" "}
                between them, each into their own wallet.
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
          {!built ? (
            <button type="button" className="wa-btn is-primary" disabled={building} onClick={() => void buildRoutes()}>
              {building ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {building
                ? `Building routes, ${buildDone} of ${parsed.good.length}`
                : `Build ${parsed.good.length} ${parsed.good.length === 1 ? "route" : "routes"}`}
            </button>
          ) : !isConnected ? (
            <>
              <p className="wa-run-sum">
                The run is priced. Connect a wallet to sign it once.
              </p>
              <Connect />
            </>
          ) : (
            <button
              type="button"
              className="wa-btn is-primary"
              disabled={busy || age === "stale"}
              onClick={() => void send()}
            >
              {busy ? <Loader2 size={16} strokeWidth={2} aria-hidden className="wa-spin" /> : null}
              {phase === "signing"
                ? "Waiting for your wallet"
                : phase === "confirming"
                  ? "Confirming"
                  : `Pay ${parsed.good.length} people, ${usdt(parsed.total)}, one signature`}
            </button>
          )}

          {built && builtAt !== null ? (
            <p className={`wa-quote-age${age === "stale" ? " is-stale" : ""}`}>
              {parsed.good.length} routes priced {quoteAge(builtAt)}
              {age === "stale" ? ", which is too long ago to sign. " : ". "}
              <button
                type="button"
                className="wa-linkish"
                disabled={building}
                onClick={() => {
                  setBuilt(null);
                  setBuiltAt(null);
                  void buildRoutes();
                }}
              >
                {building ? "Repricing…" : "Reprice them"}
              </button>
            </p>
          ) : null}

          {buildWhy ? <p className="wa-refusal">{buildWhy}</p> : null}
          {phase === "failed" && why ? (
            <p className="wa-refusal">
              {why}{" "}
              <button type="button" className="wa-linkish" onClick={reset}>
                Try again
              </button>
            </p>
          ) : null}

          {built ? (
            <p className="wa-quote-issuer">
              {chosen.symbol} — {ISSUER_NOTE}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
