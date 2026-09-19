/**
 * ONE QUEUE PER ENDPOINT. Solana's public endpoints refuse an IP that asks too fast
 * ("Connection rate limits exceeded", 429), and a paid RPC bills by the request; a page
 * that reads twenty accounts, or an indexer walking a thousand signatures, will find either
 * limit without help. Every RPC call the server makes passes through a gate: at most
 * `concurrency` in flight, and at most one start every `1000 / rps` milliseconds.
 *
 * The defaults are chosen for the endpoint: Solana's own `api.*.solana.com` gets a
 * deliberately slow rate, anything else (a paid RPC) a fast one. `SOLANA_RPC_RPS` and
 * `SOLANA_RPC_CONCURRENCY` override both.
 *
 * It queues, it never drops: a call waits its turn and then happens. Slow is a cost; a
 * refused read would be a wrong number on a surface.
 */
export type Gate = {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The endpoint refused: hold ALL traffic for a while, not just this call. */
  penalize: () => void;
  /** It answered: forget the penalty. */
  reward: () => void;
  /** How long every caller is currently waiting out, in ms. For a health line. */
  coolingFor: () => number;
  readonly rps: number;
  readonly concurrency: number;
};

/**
 * After a refusal: wait this long, doubling to the cap, before anyone asks again. The cap is
 * deliberately short. A long pause is the polite thing for the endpoint and the wrong thing
 * for the reader: a page that waits thirty seconds shows nothing, while a page that gives up
 * in six can show the last good read and say so.
 */
const COOL_FIRST_MS = 1_500;
const COOL_MAX_MS = 6_000;

const PUBLIC = /(^|\.)(api\.(devnet|testnet|mainnet-beta)\.solana\.com)$/i;

export function limitsFor(url: string): { rps: number; concurrency: number } {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const isPublic = PUBLIC.test(host);
  const isLocal = host === "127.0.0.1" || host === "localhost";
  // Solana's public endpoints cap an IP at 100 calls per 10 s AND a single method at 40 per
  // 10 s; an indexer walking signatures is one method, so the public budget is the tighter one.
  const rps = Number(process.env.SOLANA_RPC_RPS) || (isLocal ? 2_000 : isPublic ? 4 : 100);
  const concurrency = Number(process.env.SOLANA_RPC_CONCURRENCY) || (isLocal ? 64 : isPublic ? 2 : 32);
  return { rps, concurrency };
}

/**
 * ONE GATE PER ENDPOINT PER PROCESS, kept on `globalThis`. A dev server (and a route handler
 * under some bundlers) can evaluate the same module more than once; a gate held in a module
 * variable would then be one gate per copy, and the endpoint would see the sum of them. The
 * limit belongs to the process, so the gate lives where the process can find it.
 */
const KEY = Symbol.for("scrip.rpc.gates");
type Store = { gates?: Map<string, Gate> };
function store(): Map<string, Gate> {
  const g = globalThis as unknown as Record<symbol, Store>;
  const slot = (g[KEY] ??= {});
  return (slot.gates ??= new Map());
}

export function gateFor(url: string): Gate {
  const gates = store();
  const hit = gates.get(url);
  if (hit) return hit;
  const made = makeGate(url);
  gates.set(url, made);
  return made;
}

/** A gate of its own, for a test. Prefer `gateFor`, which shares one per endpoint. */
export function makeGate(url: string): Gate {
  const { rps, concurrency } = limitsFor(url);
  const minGap = 1000 / rps;
  const waiting: Array<() => void> = [];
  let inFlight = 0;
  let lastStart = 0;
  let coolUntil = 0;
  let cool = 0;

  const pump = () => {
    if (inFlight >= concurrency || waiting.length === 0) return;
    const wait = Math.max(0, lastStart + minGap - Date.now(), coolUntil - Date.now());
    if (wait > 0) {
      setTimeout(pump, wait);
      return;
    }
    const next = waiting.shift();
    if (!next) return;
    lastStart = Date.now();
    inFlight += 1;
    next();
    if (waiting.length > 0) setTimeout(pump, minGap);
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      pump();
    });
    try {
      return await fn();
    } finally {
      inFlight -= 1;
      pump();
    }
  };
  return {
    run,
    penalize: () => {
      cool = cool === 0 ? COOL_FIRST_MS : Math.min(cool * 2, COOL_MAX_MS);
      coolUntil = Date.now() + cool;
    },
    reward: () => {
      cool = 0;
      coolUntil = 0;
    },
    coolingFor: () => Math.max(0, coolUntil - Date.now()),
    rps,
    concurrency,
  };
}
