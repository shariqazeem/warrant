"use client";

/**
 * ISSUE A GRANT.
 *
 * The form on the left, and on the right the certificate it will become, following every
 * choice as it is made. Everything works without a wallet — the live quote, the specimen,
 * the schedule — so anyone can feel what a grant is; a wallet is needed only to issue.
 *
 * NOTHING ON THIS PAGE IS A SAMPLE. The units, the minimum and the route come from a live
 * OKX DEX quote built on the server (app/grants/actions.ts); the dates from the calendar and
 * the person's own inputs; the balances from X Layer. Until a figure exists, the page says
 * what will fill it.
 *
 * THE QUOTE IS A MOMENT. It is asked 400 ms after the last change, refreshed every 15 s while
 * someone is here, paused when the tab is hidden or nobody has touched the form for five
 * minutes (the aggregator is one paced line shared by every visitor), and asked again at the
 * moment of issuing if it is older than 30 s.
 */
import {useRouter} from "next/navigation";
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {getAddress} from "viem";
import {useGasPrice} from "wagmi";
import {buildGrant, rememberRoute, type BuiltGrant, type GrantRequest} from "@/app/grants/actions";
import {readChoices, type ChoiceView} from "@/app/pay/actions";
import {syncFromChain} from "@/app/sync/actions";
import {Certificate, type CertificateData} from "@/components/cert/certificate";
import {AssetNote} from "@/components/pay/asset-note";
import {useTxToast} from "@/components/toast/use-tx-toast";
import {WalletPanel} from "@/components/wallet/wallet-panel";
import {useWallet} from "@/components/wallet/use-wallet";
import {ASSETS, assetByAddress, defaultAsset} from "@/lib/assets";
import {EXPLORER_TX, xLayer} from "@/lib/chain";
import {parseMoney, recipientFromCell} from "@/lib/csv";
import {age, short, stampUTC} from "@/lib/format";
import {
  DEFAULT_TIP_BPS,
  MAX_DURATION_DAYS,
  MAX_TIP_BPS,
  SCHEDULE_UNITS,
  STABLE_NAME,
  ceilCents,
  ceilOkb,
  checkStart,
  choiceNote,
  feeText,
  floorUnits,
  localInputToUnix,
  parseFeePercent,
  parseSpan,
  scheduleFor,
  scheduleWords,
  stampOrDate,
  unitPrice,
  unixToLocalInput,
  usdExact,
  type GrantSchedule,
  type ScheduleUnit,
  type Span,
} from "@/lib/grant-terms";
import {held, type Outcome} from "@/lib/outcome";
import {checkAddress, toBase} from "@/lib/payment";
import {QUOTE_LOST} from "@/lib/quote-age";
import {MAX_REASON_LENGTH} from "@/lib/reason";
import {
  CUSTOM_START,
  DEFAULT_PRESET,
  PRESETS,
  curvePath,
  featuredAssets,
  presetDetail,
  reviewLine,
  searchAssets,
  shortName,
  type PresetId,
} from "./presets";
import {useOpenGrant, type IssuePhase} from "./use-open-grant";
import "./issue.css";

const DEBOUNCE_MS = 400;
const REFRESH_MS = 15_000;
const IDLE_MS = 5 * 60_000;
const REQUOTE_AFTER_MS = 30_000;
/** Gas budgets for the network-fee check: about twice what opening a grant measured on a
 *  fork (~700,000), because a route's legs vary; plus an approval when it takes two steps. */
const GAS_OPEN = 1_500_000n;
const GAS_APPROVE = 100_000n;
const REVIEWED_KEY = "warrant.issue.reviewed";

type Quote = {sig: string; priceSig: string; value: BuiltGrant; at: number};
type Req = {sig: string; priceSig: string; full: boolean; body: GrantRequest};
type Custom = {lengthText: string; lengthUnit: ScheduleUnit; cliffText: string; cliffUnit: ScheduleUnit};

/** "12 s ago", ticking on its own so nothing else re-renders every second. */
function Ago({at}: {at: number}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Paused while the tab is hidden; it catches up the moment it is looked at again.
    const t = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1_000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, (now - at) / 1000);
  return <span className="wa-issue-tick">{seconds < 2 ? "just now" : `${age(seconds)} ago`}</span>;
}

/**
 * A certificate drawn at its own size and scaled down to the space it is given, never up,
 * with the space it takes kept honest so nothing below it jumps.
 */
function Fit({width, height, children}: {width: number; height: number; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className="wa-issue-fit" style={{height: height * scale}}>
      <div style={{width, height, transform: `scale(${scale})`, transformOrigin: "top left"}}>{children}</div>
    </div>
  );
}

function PresetCurve({cliffFraction}: {cliffFraction: number}) {
  return (
    <svg width="64" height="30" aria-hidden="true" className="wa-issue-curve">
      <path d="M2 27 H62" className="base" />
      <path d={curvePath(cliffFraction)} className="line" />
    </svg>
  );
}

function customSpans(c: Custom): Outcome<{length: Span; cliff: Span}> {
  const length = parseSpan(c.lengthText, c.lengthUnit);
  if (!length.ok) return held(`How long it vests: ${length.why}`);
  const cliff = c.cliffText.trim() === "" ? {ok: true as const, value: {value: 0, unit: c.cliffUnit}} : parseSpan(c.cliffText, c.cliffUnit);
  if (!cliff.ok) return held(`The cliff: ${cliff.why}`);
  return {ok: true, value: {length: length.value, cliff: cliff.value}};
}

export function IssueForm({escrow, initialNow}: {escrow: `0x${string}`; initialNow: number}) {
  const router = useRouter();
  const wallet = useWallet();
  const gasPrice = useGasPrice({chainId: xLayer.id, query: {refetchInterval: 60_000}});

  // --- what the company typed ------------------------------------------------------------
  const [recipientText, setRecipientText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [assetAddr, setAssetAddr] = useState<`0x${string}`>(defaultAsset().address);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET);
  const [custom, setCustom] = useState<Custom>({
    lengthText: String(CUSTOM_START.length.value),
    lengthUnit: CUSTOM_START.length.unit,
    cliffText: String(CUSTOM_START.cliff.value),
    cliffUnit: CUSTOM_START.cliff.unit,
  });
  const [after, setAfter] = useState<"revocable" | "seal">("revocable");
  const [advOpen, setAdvOpen] = useState(false);
  const [feeInput, setFeeInput] = useState(feeText(DEFAULT_TIP_BPS).replace("%", ""));
  const [startInput, setStartInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [reviewed, setReviewed] = useState(false);

  // A coarse clock for dates and the start check. The server's moment first, so the first
  // render matches the HTML it sent; the browser's own from then on.
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(REVIEWED_KEY) === "1") setReviewed(true);
    } catch {
      // Storage refused (a private window): the line is simply ticked again.
    }
  }, []);
  const tickReviewed = (v: boolean) => {
    setReviewed(v);
    try {
      if (v) sessionStorage.setItem(REVIEWED_KEY, "1");
      else sessionStorage.removeItem(REVIEWED_KEY);
    } catch {
      // as above
    }
  };

  // --- what it means ---------------------------------------------------------------------
  const recipientRaw = recipientFromCell(recipientText);
  const recipientCheck = recipientText.trim() === "" ? null : checkAddress(recipientRaw, "their wallet address");
  const recipient = recipientCheck?.ok ? getAddress(recipientCheck.value) : null;
  const isSelf = Boolean(recipient && wallet.address && recipient.toLowerCase() === wallet.address.toLowerCase());

  const amountRead = amountText.trim() === "" ? null : parseMoney(amountText);
  const baseRead = amountRead?.ok ? toBase(amountRead.value) : null;
  const base = baseRead?.ok ? baseRead.value : 0n;
  const amountWhy =
    amountRead && !amountRead.ok ? amountRead.why : baseRead && !baseRead.ok ? baseRead.why : null;
  const amountUsd = amountRead?.ok && baseRead?.ok && base > 0n ? amountRead.value : null;

  const asset = assetByAddress(assetAddr) ?? null;

  const startUnix = startInput.trim() === "" ? 0 : localInputToUnix(startInput);
  const start: Outcome<number> =
    startUnix === null ? held("Pick a date and time, or leave it empty.") : checkStart(startUnix, now);
  const scheduleFrom = start.ok && start.value > 0 ? start.value : now;

  const preset = PRESETS.find((p) => p.id === presetId) ?? null;
  const spans: Outcome<{length: Span; cliff: Span}> = preset
    ? {ok: true, value: {length: preset.length, cliff: preset.cliff}}
    : customSpans(custom);
  const schedule: Outcome<GrantSchedule> = spans.ok
    ? scheduleFor(scheduleFrom, spans.value.length, spans.value.cliff)
    : spans;

  const tip = parseFeePercent(feeInput);
  const note = noteInput.trim();
  const noteOk = note.length <= MAX_REASON_LENGTH;

  // What is asked of the server: the whole grant when it is complete, else a price alone.
  const req: Req | null = useMemo(() => {
    if (!asset || amountUsd === null) return null;
    const priceSig = `${asset.address}|${base}`;
    if (recipient && schedule.ok && tip.ok && start.ok && noteOk) {
      const body: GrantRequest = {
        beneficiary: recipient,
        asset: asset.address,
        usd: amountUsd,
        cliffSeconds: schedule.value.cliffSeconds,
        durationSeconds: schedule.value.durationSeconds,
        tipBps: tip.value,
        start: start.value,
        reason: note,
      };
      return {full: true, priceSig, sig: JSON.stringify(["full", priceSig, ...Object.values(body)]), body};
    }
    return {
      full: false,
      priceSig,
      sig: `price|${priceSig}`,
      body: {beneficiary: "", asset: asset.address, usd: amountUsd, cliffSeconds: 0, durationSeconds: 86_400, tipBps: 0},
    };
    // The outcomes are rebuilt every render; their contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    asset?.address,
    amountUsd,
    base,
    recipient,
    schedule.ok && schedule.value.durationSeconds,
    schedule.ok && schedule.value.cliffSeconds,
    tip.ok && tip.value,
    start.ok && start.value,
    noteOk,
    note,
  ]);

  // --- the quote -------------------------------------------------------------------------
  const [quoted, setQuoted] = useState<Quote | null>(null);
  const [quoteWhy, setQuoteWhy] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [attemptAt, setAttemptAt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const asleepRef = useRef(false);
  const lastInput = useRef(0);
  const seq = useRef(0);
  const prevSig = useRef<string | null>(null);
  const reqRef = useRef(req);
  reqRef.current = req;

  const {phase, issue, recheck, reset, oneSignature} = useOpenGrant(
    escrow,
    useMemo(() => ({symbol: asset?.symbol ?? "units", decimals: asset?.decimals ?? 18}), [asset?.symbol, asset?.decimals]),
  );
  const [requoting, setRequoting] = useState(false);

  // One toast, in the same words as the button, while the wallet has the grant.
  useTxToast(
    phase.kind === "checking"
      ? "building"
      : phase.kind === "waiting"
        ? "signing"
        : phase.kind === "approving" || phase.kind === "submitted"
          ? "confirming"
          : phase.kind === "issued"
            ? "done"
            : phase.kind === "failed"
              ? "failed"
              : "idle",
    "Issue the certificate",
    {
      href: phase.kind === "issued" && phase.id !== null ? `/g/${phase.id}` : undefined,
      detail: phase.kind === "failed" ? phase.why : undefined,
    },
  );

  const walletBusy =
    phase.kind === "checking" ||
    phase.kind === "waiting" ||
    phase.kind === "approving" ||
    phase.kind === "submitted" ||
    phase.kind === "issued";
  const busy = walletBusy || requoting;

  // A refusal or a closed request was about the terms that were on screen then. Once the
  // terms change, it no longer describes anything, so it goes.
  const phaseKind = phase.kind;
  useEffect(() => {
    if (phaseKind === "failed" || phaseKind === "rejected") reset();
    // Only a change of terms clears it, not the refusal arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.sig]);

  /** After a grant whose id could not be read: clear the form for the next one. */
  const issueAnother = () => {
    reset();
    setRecipientText("");
    setAmountText("");
    setNoteInput("");
    setStartInput("");
  };

  useEffect(() => {
    const sig = req?.sig ?? null;
    if (!sig || !reqRef.current) {
      seq.current++;
      prevSig.current = null;
      setQuoting(false);
      setQuoteWhy(null);
      return;
    }
    const changed = prevSig.current !== sig;
    prevSig.current = sig;
    if (changed) setQuoteWhy(null);
    const mine = ++seq.current;
    const asked = reqRef.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      let out: Outcome<BuiltGrant>;
      try {
        out = await buildGrant(asked.body);
      } catch {
        out = held(QUOTE_LOST);
      }
      if (mine !== seq.current) return;
      setQuoting(false);
      setAttemptAt(Date.now());
      if (out.ok) {
        setQuoted({sig: asked.sig, priceSig: asked.priceSig, value: out.value, at: Date.now()});
        setQuoteWhy(null);
      } else {
        setQuoteWhy(out.why);
      }
    }, changed ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [req?.sig, nonce]);

  // Refreshed every 15 s while someone is here; asleep while the tab is hidden or the form
  // has sat untouched for five minutes. Never while the wallet has the grant open.
  useEffect(() => {
    if (!req || busy || asleep || attemptAt === 0) return;
    const t = setTimeout(() => {
      if (document.hidden || Date.now() - lastInput.current > IDLE_MS) {
        asleepRef.current = true;
        setAsleep(true);
        return;
      }
      setNonce((n) => n + 1);
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, [req, busy, asleep, attemptAt]);

  const wake = useCallback(() => {
    lastInput.current = Date.now();
    if (asleepRef.current) {
      asleepRef.current = false;
      setAsleep(false);
      setNonce((n) => n + 1);
    }
  }, []);
  useEffect(() => {
    lastInput.current = Date.now();
    const onVisible = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [wake]);

  /** The quote the page may show: one for this stock and this amount. */
  const shown = quoted && req && quoted.priceSig === req.priceSig ? quoted : null;
  const shownUnits = shown ? BigInt(shown.value.expectedUnits) : null;
  const shownMin = shown ? BigInt(shown.value.minUnits) : null;
  const price = shown && asset && shownUnits !== null ? unitPrice(base, shownUnits, asset.decimals) : null;

  // --- the person's choice ---------------------------------------------------------------
  const [choiceRead, setChoiceRead] = useState<{address: string; state: "loading" | "done" | "failed"; choice: ChoiceView | null} | null>(null);
  useEffect(() => {
    if (!recipient) {
      setChoiceRead(null);
      return;
    }
    let live = true;
    setChoiceRead({address: recipient, state: "loading", choice: null});
    readChoices([recipient])
      .then((found) => {
        if (!live) return;
        const choice = found[recipient.toLowerCase()] ?? null;
        setChoiceRead({address: recipient, state: "done", choice});
        // Preselected, as they signed it. The company may still pick another.
        const chosen = choice?.asset ? assetByAddress(choice.asset) : undefined;
        if (chosen) setAssetAddr(chosen.address);
      })
      .catch(() => {
        if (live) setChoiceRead({address: recipient, state: "failed", choice: null});
      });
    return () => {
      live = false;
    };
  }, [recipient]);
  const choiceHere = choiceRead && recipient && choiceRead.address === recipient ? choiceRead : null;

  // --- balances --------------------------------------------------------------------------
  const usdtShort = wallet.usdt !== undefined && base > 0n && wallet.usdt < base ? base - wallet.usdt : 0n;
  const okbNeed = gasPrice.data !== undefined ? gasPrice.data * (GAS_OPEN + (oneSignature ? 0n : GAS_APPROVE)) : null;
  const okbShort: bigint | null =
    wallet.okb === undefined
      ? 0n
      : okbNeed !== null
        ? wallet.okb < okbNeed
          ? okbNeed - wallet.okb
          : 0n
        : wallet.noGas
          ? null
          : 0n;

  // --- the button ------------------------------------------------------------------------
  const blocker: string | null = (() => {
    if (recipientText.trim() === "") return "Add their wallet address";
    if (!recipient) return "Check their wallet address";
    if (amountText.trim() === "") return "Enter a grant value";
    if (amountWhy) return "Check the grant value";
    if (amountUsd === null) return "Enter a grant value";
    if (!asset) return "Pick a stock";
    if (!schedule.ok) return "Check the vesting schedule";
    if (!tip.ok) return "Check the release fee";
    if (!start.ok) return "Pick a start in the future";
    if (!noteOk) return "Shorten the note";
    if (isSelf) return "Use their address, not yours";
    if (!reviewed) return "Tick the review line";
    if (wallet.status === "disconnected" || wallet.status === "connecting") return "Connect a wallet to issue";
    if (wallet.status === "wrong-chain") return "Switch to X Layer to issue";
    if (usdtShort > 0n) return `Top up ${ceilCents(usdtShort)} ${STABLE_NAME}`;
    if (okbShort === null) return "Top up a little OKB for the network fee";
    if (okbShort > 0n) return `Top up ${ceilOkb(okbShort)} OKB for the network fee`;
    if (!shown && quoteWhy) return "No live quote yet";
    if (!shown) return "Getting a live quote…";
    return null;
  })();

  const doIssue = async () => {
    if (blocker || busy || !req?.full) return;
    reset();
    // The start is checked again against the real clock: a start that has just passed would
    // hand over part of the grant the moment it lands.
    if (req.body.start && checkStart(req.body.start, Math.floor(Date.now() / 1000)).ok === false) {
      setNow(Math.floor(Date.now() / 1000));
      return;
    }
    let q: Quote | null = quoted && quoted.sig === req.sig ? quoted : null;
    if (!q || !q.value.terms || Date.now() - q.at > REQUOTE_AFTER_MS || phase.kind === "failed") {
      setRequoting(true);
      seq.current++;
      let out: Outcome<BuiltGrant>;
      try {
        out = await buildGrant(req.body);
      } catch {
        out = held(QUOTE_LOST);
      }
      setRequoting(false);
      setAttemptAt(Date.now());
      if (!out.ok) {
        setQuoteWhy(out.why);
        return;
      }
      q = {sig: req.sig, priceSig: req.priceSig, value: out.value, at: Date.now()};
      setQuoted(q);
      setQuoteWhy(null);
    }
    if (!q.value.terms) return;
    const sealAfter = after === "seal";
    const done = await issue(q.value.terms);
    if (!done) return;
    landed(done, q.value.route, sealAfter);
  };

  const landed = (done: {hash: `0x${string}`; id: number | null}, route: string[], sealAfter: boolean) => {
    // The route for the certificate, and the grant onto the public record, in the background.
    void rememberRoute(done.hash, route).catch(() => undefined);
    void syncFromChain(done.hash).catch(() => undefined);
    if (done.id !== null) router.push(`/g/${done.id}?issued=1${sealAfter ? "&seal=1" : ""}&tx=${done.hash}`);
  };

  const doRecheck = async (hash: `0x${string}`) => {
    const done = await recheck(hash);
    if (done) landed(done, quoted?.value.route ?? [], after === "seal");
  };

  const buttonLabel =
    phase.kind === "checking"
      ? "Checking the grant with X Layer…"
      : phase.kind === "waiting"
        ? "Confirm in your wallet"
        : phase.kind === "approving"
          ? `Approving the ${STABLE_NAME}…`
          : phase.kind === "submitted"
            ? "Engraving…"
            : phase.kind === "issued"
              ? "Issued"
              : requoting
                ? "Getting a fresh quote…"
                : phase.kind === "unconfirmed"
                  ? "Check again"
                  : (blocker ?? `Issue certificate for ${usdExact(base)}`);
  const ready = !blocker && !busy;
  const buttonEnabled = phase.kind === "unconfirmed" ? true : ready;

  // --- the specimen ----------------------------------------------------------------------
  const shownSchedule: GrantSchedule =
    schedule.ok
      ? schedule.value
      : (scheduleFor(scheduleFrom, preset?.length ?? CUSTOM_START.length, preset?.cliff ?? CUSTOM_START.cliff) as {
          ok: true;
          value: GrantSchedule;
        }).value;
  const specimenAsset = asset ?? defaultAsset();
  const specimen: CertificateData = {
    id: 0,
    recipient,
    grantor: wallet.address ?? null,
    asset: {
      symbol: specimenAsset.symbol,
      name: specimenAsset.name,
      address: specimenAsset.address,
      decimals: specimenAsset.decimals,
    },
    units: shownUnits,
    stableCost: base > 0n ? base : null,
    unitPriceUsd: price,
    route: shown?.value.route ?? [],
    start: shownSchedule.start,
    cliffSeconds: shownSchedule.cliffSeconds,
    durationSeconds: shownSchedule.durationSeconds,
    tipBps: tip.ok ? tip.value : DEFAULT_TIP_BPS,
    sealed: false,
    revoked: false,
    closed: false,
    tx: null,
  };
  const seedExtra = `${recipient ?? ""}|${specimenAsset.address}|${amountUsd ?? ""}|${presetId}`;

  const when = (t: number) => stampOrDate(t, shownSchedule.durationSeconds);
  const presetName = preset ? preset.label : "Custom";
  const vestingWords = spans.ok ? scheduleWords(spans.value.length, spans.value.cliff) : "set it below";

  const featured = featuredAssets(assetAddr);
  const results = searchAssets(stockQuery);

  return (
    <div className="wa-issue" onInputCapture={wake} onClickCapture={wake}>
      <header className="wa-issue-head">
        <h1>Issue a grant</h1>
        <p>The certificate on the right follows every choice you make, and becomes real when you issue it.</p>
      </header>

      <form
        className="wa-issue-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (phase.kind === "unconfirmed") void doRecheck(phase.hash);
          else void doIssue();
        }}
      >
        <fieldset className="wa-issue-fields" disabled={busy}>
          {/* 1. Who receives it */}
          <div className="wa-issue-field">
            <label htmlFor="issue-recipient" className="wa-issue-label">
              Who receives it
            </label>
            <input
              id="issue-recipient"
              className="wa-issue-input is-mono"
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="issue-recipient-help"
              aria-invalid={recipientCheck !== null && !recipientCheck.ok}
            />
            <div id="issue-recipient-help" className="wa-issue-help" aria-live="polite">
              {recipientCheck && !recipientCheck.ok ? (
                <p className="is-refused">{recipientCheck.why}</p>
              ) : recipient ? (
                <>
                  <p className="wa-issue-address">
                    {recipient.slice(0, -4)}
                    <strong>{recipient.slice(-4)}</strong>
                  </p>
                  <p>
                    Check the last four characters with them: <strong className="is-mono">{recipient.slice(-4)}</strong>.
                  </p>
                  {isSelf ? <p className="is-refused">That is the wallet you are issuing from. A grant goes to someone else.</p> : null}
                  {choiceHere?.state === "loading" ? (
                    <p>Checking whether they have chosen a stock…</p>
                  ) : choiceHere?.state === "done" ? (
                    <p className="wa-issue-choice">
                      {choiceNote(
                        choiceHere.choice ? {symbol: choiceHere.choice.symbol, asset: choiceHere.choice.asset} : null,
                        {symbol: asset?.symbol ?? "", address: asset?.address ?? ""},
                      ) ?? "They haven't chosen a stock on Warrant yet, so you pick one."}
                    </p>
                  ) : null}
                </>
              ) : (
                <p>A wallet address or their Warrant link. If they&apos;ve already chosen a stock on Warrant, it&apos;s picked for you.</p>
              )}
            </div>
          </div>

          {/* 2. Stock */}
          <div className="wa-issue-field">
            <div id="issue-stock-label" className="wa-issue-label">
              Stock
            </div>
            <div role="group" aria-labelledby="issue-stock-label" className="wa-issue-chips">
              {featured.map((a) => (
                <button
                  key={a.address}
                  type="button"
                  className="wa-issue-chip"
                  aria-pressed={a.address === assetAddr}
                  onClick={() => setAssetAddr(a.address)}
                >
                  <span className="sym">{a.symbol}</span>
                  <span className="name">{shortName(a)}</span>
                </button>
              ))}
              <button
                type="button"
                className="wa-issue-more"
                aria-expanded={stockOpen}
                aria-controls="issue-stock-all"
                onClick={() => setStockOpen((v) => !v)}
              >
                {stockOpen ? "Show fewer" : `All ${ASSETS.length} stocks`}
              </button>
            </div>
            {stockOpen ? (
              <div id="issue-stock-all" className="wa-issue-stocks">
                <label htmlFor="issue-stock-search" className="wa-issue-sublabel">
                  Search the {ASSETS.length} stocks
                </label>
                <input
                  id="issue-stock-search"
                  type="search"
                  className="wa-issue-input"
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="Symbol or name, like NVDA or Apple"
                  autoComplete="off"
                />
                {results.length === 0 ? (
                  <p className="wa-issue-help">
                    No stock matches &ldquo;{stockQuery.trim()}&rdquo;. Warrant lists these {ASSETS.length}: search by
                    symbol or company name.
                  </p>
                ) : (
                  <ul className="wa-issue-stocklist">
                    {results.map((a) => (
                      <li key={a.address}>
                        <button
                          type="button"
                          className="wa-issue-stockrow"
                          aria-pressed={a.address === assetAddr}
                          onClick={() => setAssetAddr(a.address)}
                        >
                          <span className="sym">{a.symbol}</span>
                          <span className="name">{shortName(a)}</span>
                        </button>
                        <AssetNote symbol={a.symbol} name={a.name} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : asset ? (
              <AssetNote symbol={asset.symbol} name={asset.name} />
            ) : null}
          </div>

          {/* 3. Grant value */}
          <div className="wa-issue-field">
            <label htmlFor="issue-amount" className="wa-issue-label">
              Grant value
            </label>
            <div className="wa-issue-money">
              <span aria-hidden="true" className="sign">
                $
              </span>
              <input
                id="issue-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
                aria-describedby="issue-amount-help"
                aria-invalid={Boolean(amountWhy)}
              />
              <span className="unit">{STABLE_NAME}</span>
            </div>
            <div id="issue-amount-help" className="wa-issue-help">
              {amountWhy ? (
                <p className="is-refused">{amountWhy}</p>
              ) : amountUsd === null ? (
                <p>What the grant costs you, in {STABLE_NAME}. OKX DEX quotes it live, and it buys the stock today.</p>
              ) : shown && asset && shownUnits !== null && shownMin !== null ? (
                <p>
                  About {floorUnits(shownUnits, asset.decimals)} {asset.symbol}. The contract guarantees at least{" "}
                  {floorUnits(shownMin, asset.decimals)}. Quote from <Ago at={shown.at} />
                  {asleep ? ", paused while you're away" : ""}.
                  {quoteWhy ? <span className="is-warn"> The latest refresh failed: {quoteWhy}</span> : null}
                </p>
              ) : quoteWhy ? (
                <p className="is-refused">
                  {quoteWhy}{" "}
                  <button type="button" className="wa-issue-link" onClick={() => setNonce((n) => n + 1)} disabled={quoting}>
                    {quoting ? "Trying again…" : "Try again"}
                  </button>
                </p>
              ) : (
                <p className="is-waiting">Getting a live quote from OKX DEX…</p>
              )}
            </div>
          </div>

          {/* 4. Vesting */}
          <div className="wa-issue-field">
            <div id="issue-vest-label" className="wa-issue-label">
              Vesting
            </div>
            <div role="group" aria-labelledby="issue-vest-label" className="wa-issue-presets">
              {PRESETS.map((p) => {
                const s = scheduleFor(scheduleFrom, p.length, p.cliff);
                const cf = s.ok ? s.value.cliffSeconds / s.value.durationSeconds : 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="wa-issue-preset"
                    aria-pressed={presetId === p.id}
                    onClick={() => setPresetId(p.id)}
                  >
                    <span className="text">
                      <span className="label">{p.label}</span>
                      <span className="detail">{presetDetail(p)}</span>
                    </span>
                    <PresetCurve cliffFraction={cf} />
                  </button>
                );
              })}
              <button
                type="button"
                className="wa-issue-preset"
                aria-pressed={presetId === "custom"}
                onClick={() => setPresetId("custom")}
              >
                <span className="text">
                  <span className="label">Custom</span>
                  <span className="detail">
                    {presetId === "custom" && spans.ok ? scheduleWords(spans.value.length, spans.value.cliff) : "Any length, down to minutes"}
                  </span>
                </span>
                <PresetCurve
                  cliffFraction={
                    presetId === "custom" && schedule.ok ? schedule.value.cliffSeconds / schedule.value.durationSeconds : 0
                  }
                />
              </button>
            </div>
            {presetId === "custom" ? (
              <div className="wa-issue-custom">
                <div className="wa-issue-span">
                  <label htmlFor="issue-length">Vests over</label>
                  <input
                    id="issue-length"
                    className="wa-issue-input"
                    inputMode="decimal"
                    value={custom.lengthText}
                    onChange={(e) => setCustom((c) => ({...c, lengthText: e.target.value}))}
                  />
                  <select
                    aria-label="Unit for how long it vests"
                    className="wa-issue-input"
                    value={custom.lengthUnit}
                    onChange={(e) => setCustom((c) => ({...c, lengthUnit: e.target.value as ScheduleUnit}))}
                  >
                    {SCHEDULE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wa-issue-span">
                  <label htmlFor="issue-cliff">Cliff</label>
                  <input
                    id="issue-cliff"
                    className="wa-issue-input"
                    inputMode="decimal"
                    value={custom.cliffText}
                    onChange={(e) => setCustom((c) => ({...c, cliffText: e.target.value}))}
                  />
                  <select
                    aria-label="Unit for the cliff"
                    className="wa-issue-input"
                    value={custom.cliffUnit}
                    onChange={(e) => setCustom((c) => ({...c, cliffUnit: e.target.value as ScheduleUnit}))}
                  >
                    {SCHEDULE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="wa-issue-help" aria-live="polite">
                  {!schedule.ok ? (
                    <span className="is-refused">{schedule.why}</span>
                  ) : (
                    <>
                      Any length up to {MAX_DURATION_DAYS.toLocaleString("en-US")} days. Months and years count on the
                      calendar. Nothing vests before the cliff; at the cliff, everything accrued since the start arrives at
                      once.
                    </>
                  )}
                </p>
              </div>
            ) : null}
          </div>

          {/* 5. After issuing */}
          <fieldset className="wa-issue-after">
            <legend className="wa-issue-label">After issuing</legend>
            <label className="wa-issue-radio">
              <input
                type="radio"
                name="issue-after"
                checked={after === "revocable"}
                onChange={() => setAfter("revocable")}
              />
              <span>
                <span className="title">Keep it revocable</span>
                <span className="detail">You can cancel the unvested part until you seal it. What has vested stays theirs.</span>
              </span>
            </label>
            <label className="wa-issue-radio">
              <input type="radio" name="issue-after" checked={after === "seal"} onChange={() => setAfter("seal")} />
              <span>
                <span className="title">Seal it</span>
                <span className="detail">
                  Irrevocable. Nobody can cancel any part of it, including you. Sealing is a second transaction, on the
                  certificate&apos;s page, right after it&apos;s issued.
                </span>
              </span>
            </label>
          </fieldset>

          {/* 6. Advanced */}
          <div className="wa-issue-fold">
            <button
              type="button"
              className="wa-issue-fold-toggle"
              aria-expanded={advOpen}
              aria-controls="issue-advanced"
              onClick={() => setAdvOpen((v) => !v)}
            >
              <span>
                Release fee: {tip.ok ? feeText(tip.value) : "not set"}.{" "}
                {start.ok && start.value > 0 ? `Starts ${stampUTC(start.value)}.` : "Starts when issued."}
              </span>
              <span aria-hidden="true" className="sign">
                {advOpen ? "−" : "+"}
              </span>
            </button>
            {advOpen ? (
              <div id="issue-advanced" className="wa-issue-fold-body">
                <div className="wa-issue-field">
                  <label htmlFor="issue-fee" className="wa-issue-sublabel">
                    Release fee
                  </label>
                  <div className="wa-issue-money is-short">
                    <input
                      id="issue-fee"
                      inputMode="decimal"
                      autoComplete="off"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      aria-describedby="issue-fee-help"
                      aria-invalid={!tip.ok}
                    />
                    <span className="unit">%</span>
                  </div>
                  <p id="issue-fee-help" className="wa-issue-help">
                    {tip.ok ? (
                      <>
                        Whoever releases what&apos;s due earns this share of that release, so the stock arrives on schedule
                        even if nobody remembers. It comes out of what is released. They pay nothing when they claim it
                        themselves. Anything from 0% to {feeText(MAX_TIP_BPS)}.
                      </>
                    ) : (
                      <span className="is-refused">{tip.why}</span>
                    )}
                  </p>
                </div>
                <div className="wa-issue-field">
                  <label htmlFor="issue-start" className="wa-issue-sublabel">
                    Start date and time
                  </label>
                  <input
                    id="issue-start"
                    type="datetime-local"
                    className="wa-issue-input"
                    value={startInput}
                    min={unixToLocalInput(now + 60)}
                    onChange={(e) => setStartInput(e.target.value)}
                    aria-describedby="issue-start-help"
                    aria-invalid={!start.ok}
                  />
                  <p id="issue-start-help" className="wa-issue-help">
                    {!start.ok ? (
                      <span className="is-refused">{start.why}</span>
                    ) : start.value > 0 ? (
                      <>
                        Vesting starts {stampUTC(start.value)}, on your clock&apos;s date and time.{" "}
                        <button type="button" className="wa-issue-link" onClick={() => setStartInput("")}>
                          Start when issued instead
                        </button>
                      </>
                    ) : (
                      "Leave it empty to start vesting the moment the grant is issued."
                    )}
                  </p>
                </div>
                <div className="wa-issue-field">
                  <label htmlFor="issue-note" className="wa-issue-sublabel">
                    Note (optional)
                  </label>
                  <input
                    id="issue-note"
                    className="wa-issue-input"
                    value={noteInput}
                    maxLength={MAX_REASON_LENGTH + 50}
                    onChange={(e) => setNoteInput(e.target.value)}
                    aria-describedby="issue-note-help"
                    aria-invalid={!noteOk}
                  />
                  <p id="issue-note-help" className="wa-issue-help">
                    {noteOk ? (
                      "Kept with the grant's public record, for example what it is for."
                    ) : (
                      <span className="is-refused">A note can be at most {MAX_REASON_LENGTH} characters.</span>
                    )}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* 7. Review */}
          <label className="wa-issue-review">
            <input type="checkbox" checked={reviewed} onChange={(e) => tickReviewed(e.target.checked)} />
            <span>{reviewLine(recipient ? short(recipient) : null)}</span>
          </label>
        </fieldset>

        {/* 8. Pay from, and the button */}
        <div className="wa-issue-act">
          <WalletPanel need={base > 0n ? base : undefined} okbShort={okbShort === null || okbShort > 0n} purpose="issue this grant" />
          <button
            type="submit"
            className={`wa-issue-btn${buttonEnabled ? "" : " is-blocked"}`}
            disabled={!buttonEnabled}
          >
            {buttonLabel}
          </button>
          <Status phase={phase} base={base} onRetry={() => void doIssue()} onAnother={issueAnother} requoting={requoting} />
          <p className="wa-issue-fine">
            {oneSignature
              ? "One signature approves the USDT and issues the grant."
              : "Your wallet will ask twice: once to approve the USDT, then once to issue."}{" "}
            If the price moves and the contract would buy less than the guaranteed minimum, nothing happens and no USDT
            leaves your wallet.
          </p>
        </div>
      </form>

      {/* The specimen, and what it rests on */}
      <div className="wa-issue-aside">
        <section className="wa-issue-cert" aria-label="Specimen certificate, updating as you fill in the form">
          <div className="wa-issue-cert-land">
            <Fit width={760} height={468}>
              <Certificate data={specimen} variant="landscape" specimen seedExtra={seedExtra} sealPending={after === "seal"} />
            </Fit>
          </div>
          <div className="wa-issue-cert-port">
            <Fit width={350} height={520}>
              <Certificate data={specimen} variant="portrait" specimen seedExtra={seedExtra} sealPending={after === "seal"} />
            </Fit>
          </div>
        </section>

        <dl className="wa-issue-summary">
          <div>
            <dt>Quote</dt>
            <dd>
              {shown && asset && price !== null ? (
                <>
                  1 {asset.symbol} ≈ ${price} through OKX DEX, <Ago at={shown.at} />
                </>
              ) : amountUsd === null ? (
                "Enter a grant value for a live quote from OKX DEX."
              ) : quoteWhy ? (
                "No live quote yet."
              ) : (
                <span className="is-waiting">Getting a live quote…</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Guaranteed minimum</dt>
            <dd>
              {shown && asset && shownMin !== null ? (
                <>
                  {floorUnits(shownMin, asset.decimals)} {asset.symbol}. Below that, the contract cancels and no USDT moves.
                </>
              ) : (
                "Set by the live quote. Below it, the contract cancels and no USDT moves."
              )}
            </dd>
          </div>
          <div>
            <dt>Vesting</dt>
            <dd>
              {presetName}: {vestingWords}
              {schedule.ok ? (
                <span className="sub">
                  {start.ok && start.value > 0 ? `Starts ${when(schedule.value.start)}.` : `Starts when issued, ${when(now)} if now.`}{" "}
                  {schedule.value.cliffSeconds > 0 ? `Cliff ${when(schedule.value.cliffAt)}. ` : ""}
                  Fully vested {when(schedule.value.endsAt)}.
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Network fee</dt>
            <dd>A fraction of a cent, paid in OKB</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** What the wallet is doing, or what just happened, said where the button is. */
function Status({
  phase,
  base,
  onRetry,
  onAnother,
  requoting,
}: {
  phase: IssuePhase;
  base: bigint;
  onRetry: () => void;
  onAnother: () => void;
  requoting: boolean;
}) {
  const link = (hash: `0x${string}`, text = "See it on OKLink") => (
    <a href={EXPLORER_TX(hash)} target="_blank" rel="noreferrer" className="wa-issue-link">
      {text}
    </a>
  );
  let body: ReactNode = null;
  let tone = "";
  switch (phase.kind) {
    case "checking":
      body = "Checking the grant against X Layer before your wallet asks. Nothing is sent yet.";
      break;
    case "waiting":
      body =
        phase.step === "permit"
          ? `Sign the approval in your wallet. It costs nothing and lets this one grant take exactly ${usdExact(base)} of ${STABLE_NAME}.`
          : phase.step === "approve"
            ? `Step 1 of 2: approve exactly ${usdExact(base)} of ${STABLE_NAME} in your wallet.`
            : phase.twoStep
              ? "Step 2 of 2: confirm the grant in your wallet."
              : "Confirm the grant in your wallet.";
      break;
    case "approving":
      body = <>Approval sent. Waiting for X Layer to confirm it. {link(phase.hash)}</>;
      break;
    case "submitted":
      body = <>Sent. Engraving the certificate on X Layer. {link(phase.hash)}</>;
      break;
    case "issued":
      tone = "is-settled";
      body =
        phase.id !== null ? (
          <>Issued on X Layer. Opening certificate No. {String(phase.id).padStart(6, "0")}… {link(phase.hash)}</>
        ) : (
          <>
            Issued on X Layer. {link(phase.hash)} Its certificate appears under Your grants below in a moment.{" "}
            <button type="button" className="wa-issue-link" onClick={onAnother}>
              Issue another
            </button>
          </>
        );
      break;
    case "rejected":
      body = "You closed the request in your wallet. Nothing was sent.";
      break;
    case "unconfirmed":
      tone = "is-warn";
      body = (
        <>
          X Layer hasn&apos;t confirmed it yet, and it may still land. {link(phase.hash, "Check it on OKLink")}. Don&apos;t
          issue again until it settles.
        </>
      );
      break;
    case "failed":
      tone = "is-refused";
      body = (
        <>
          {phase.why} {phase.hash ? link(phase.hash) : null}{" "}
          <button type="button" className="wa-issue-link" onClick={onRetry} disabled={requoting}>
            Try again
          </button>
        </>
      );
      break;
    default:
      body = null;
  }
  return (
    <p className={`wa-issue-status ${tone}`} role="status" aria-live="polite">
      {phase.kind === "issued" ? <CheckIcon /> : null}
      {body}
    </p>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="wa-issue-check">
      <path d="M4 10.5 L8.5 15 L16.5 6" />
    </svg>
  );
}
