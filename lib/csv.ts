/**
 * A FILE OF NAMES AND AMOUNTS BECOMES LINES, BEFORE ANYTHING IS SIGNED.
 *
 * This is the first half of `/run` and it is money-critical: a row parsed wrongly is a
 * payment to the wrong person, or the right person for the wrong amount, and the receipt
 * will agree with the parse rather than with what the payer meant.
 *
 * So: every row is parsed independently and carries its own verdict. A bad row never
 * silently disappears and never quietly becomes a good one — it is shown, in place, with
 * the rule it broke, and the run cannot be signed until it is fixed or removed.
 */
import {checkLine} from "./payment";
import {held, ok, type Outcome} from "./outcome";

export type ParsedRow = {
  /** 1-based, as a spreadsheet counts, because that is what the payer is looking at. */
  lineNumber: number;
  raw: string;
  recipient: string;
  usd: number;
  cashUsd: number;
  reason: string;
  /** Held with the rule it broke, in the words the form uses. */
  verdict: Outcome<{total: bigint; cash: bigint; swapAmount: bigint}>;
};

/**
 * THE MOST PEOPLE ONE RUN CAN PAY.
 *
 * Measured: a line costs 413,063 gas through payManyWithPermit (five lines on a fork of X
 * Layer), and rpc.xlayer.tech refuses an eth_call above 50,000,000 gas. A wallet estimates
 * a run's gas with exactly that call, so past about 121 lines the estimate is refused and
 * the run cannot even be signed. A hundred leaves room for the permit and for routes with
 * more hops than the one measured.
 */
export const MAX_RUN_LINES = 100;

export type ParsedFile = {
  rows: ParsedRow[];
  /** Rows that are ready to pay. */
  good: ParsedRow[];
  /** Rows that are not, each with its reason. */
  bad: ParsedRow[];
  /** The sum of the good rows, in stablecoin base units. */
  total: bigint;
  /** Header row dropped, if one was recognised. */
  headerDropped: boolean;
  /** Why this file cannot be paid as one run — more than MAX_RUN_LINES people — or null. */
  tooMany: string | null;
};

/**
 * A PERSON'S PAY LINK STANDS FOR THEIR WALLET. People send the link /me gives them
 * (warrant.world/@0x…) rather than a bare address, so a cell that is exactly such a link, or
 * the address with an @ in front, is read as the address in it.
 *
 * Only that shape. Anything else is handed back as it was, for the address check to refuse
 * in its own words: a cell is never searched for something that looks like an address.
 */
const PAY_LINK = /^(?:https?:\/\/)?[^\s/?#@]+\/@(0x[0-9a-fA-F]{40})\/?(?:[?#]\S*)?$/;
const AT_ADDRESS = /^@(0x[0-9a-fA-F]{40})$/;

export function recipientFromCell(cell: string): string {
  const value = cell.trim();
  return (AT_ADDRESS.exec(value) ?? PAY_LINK.exec(value))?.[1] ?? value;
}

/** Splits one CSV line, honouring double quotes so a reason may contain a comma. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** What a payer is told when a comma is doing a dot's job. */
export const COMMA_FOR_CENTS = "Use a dot for cents, like 2.50";

/** "25", "25.50", "2." while it is still being typed, ".5". */
const PLAIN_AMOUNT = /^(\d+(\.\d*)?|\.\d+)$/;
/** "1,250", "1,250.50", "12,345,678.9" — a comma before every three digits, and nowhere else. */
const GROUPED_AMOUNT = /^\d{1,3}(,\d{3})+(\.\d*)?$/;

/**
 * Money as typed by a person: "$25", "25.00", "1,250", "25 USDT".
 *
 * Deliberately strict about what it will NOT accept. "1.2.3" and "" are refused rather
 * than coerced, because `Number("")` is 0 and a row that silently becomes a zero-dollar
 * payment is the worst possible outcome of a parse.
 *
 * A COMMA ONLY EVER SEPARATES THOUSANDS. Stripping every comma read "2,50" — two dollars
 * fifty, written the way half the world writes it — as 250: a hundred times the payment
 * that was meant. So "1,250.50" is accepted and "2,50" is refused with COMMA_FOR_CENTS.
 * The pay and grant forms read their amounts with this too, so a file and a form cannot
 * disagree about what a figure means.
 */
export function parseMoney(text: string): Outcome<number> {
  const cleaned = text.trim().replace(/^\$/, "").replace(/\s*(usdt|usd)$/i, "").trim();
  if (cleaned === "") return held("no amount");
  if (cleaned.includes(",")) {
    if (!GROUPED_AMOUNT.test(cleaned)) return held(COMMA_FOR_CENTS);
  } else if (!PLAIN_AMOUNT.test(cleaned)) {
    return held(`"${text.trim()}" is not an amount`);
  }
  const n = Number(cleaned.replace(/,/g, ""));
  if (!Number.isFinite(n)) return held(`"${text.trim()}" is not an amount`);
  return ok(n);
}

const HEADER_WORDS = /^(address|wallet|recipient|to|who)$/i;

/**
 * Parse a pasted or dropped file into lines.
 *
 * Columns: `address, amount, reason` and an optional fourth, `cash`, being the part of the
 * line paid as the stablecoin rather than as ownership. A header row is recognised and
 * dropped; anything else is a row.
 */
export function parseRunFile(text: string, asset: string): ParsedFile {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let headerDropped = false;

  for (const [index, raw] of lines.entries()) {
    const lineNumber = index + 1;
    if (raw.trim() === "") continue;

    const cells = splitCsvLine(raw);

    // A header only counts as one if it is the first row that had any content.
    if (rows.length === 0 && !headerDropped && HEADER_WORDS.test(cells[0] ?? "")) {
      headerDropped = true;
      continue;
    }

    const recipient = recipientFromCell(cells[0] ?? "");
    const amountText = cells[1] ?? "";
    const reason = cells[2] ?? "";
    const cashText = cells[3] ?? "";

    const amount = parseMoney(amountText);
    const cash = cashText.trim() === "" ? ok(0) : parseMoney(cashText);

    if (!amount.ok || !cash.ok) {
      rows.push({
        lineNumber,
        raw,
        recipient,
        usd: 0,
        cashUsd: 0,
        reason,
        verdict: held(!amount.ok ? amount.why : (cash as {ok: false; why: string}).why),
      });
      continue;
    }

    rows.push({
      lineNumber,
      raw,
      recipient,
      usd: amount.value,
      cashUsd: cash.value,
      reason,
      verdict: checkLine({recipient, usd: amount.value, cashUsd: cash.value, asset, reason}),
    });
  }

  const good = rows.filter((r) => r.verdict.ok);
  const bad = rows.filter((r) => !r.verdict.ok);
  const total = good.reduce(
    (sum, r) => sum + (r.verdict.ok ? r.verdict.value.total : 0n),
    0n,
  );

  // The whole file is refused rather than paying the first hundred and leaving the rest
  // for someone to notice: a split is the payer's decision, not the parser's.
  const tooMany =
    good.length > MAX_RUN_LINES
      ? `One run can pay at most ${MAX_RUN_LINES} people, and this file has ${good.length}. ` +
        `Split it into ${Math.ceil(good.length / MAX_RUN_LINES)} files of ${MAX_RUN_LINES} or fewer.`
      : null;

  return {rows, good, bad, total, headerDropped, tooMany};
}

/** The template a payer downloads, so the columns are never guessed at. */
export const RUN_TEMPLATE = [
  "address,amount,reason,cash",
  "0x1e4a5963abfd975d8c9021ce480b42188849d41d,25,Design review week 38,",
  "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48,40,Shipped the indexer,10",
].join("\n");
