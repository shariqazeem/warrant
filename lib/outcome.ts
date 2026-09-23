/**
 * FAILURE RETURNS A VALUE AND NEVER THROWS FOR CONTROL FLOW.
 *
 * A refused quote, a route that will not build, a log range the endpoint will not
 * serve: each one HOLDS and says why. This is the single habit carried into Warrant
 * that is worth more than any of the code — it is the reason a failed read never
 * turns into a number nobody can defend.
 *
 * A thrown exception in money-critical code has two bad outcomes and no good one: it is
 * caught somewhere generic and becomes a shrug, or it escapes and takes the request with it.
 * A held value carries its reason all the way to the surface, where it can be rendered as an
 * honest waiting state instead of a number nobody can defend.
 *
 * `why` is written to be READ BY A USER, not only logged. "The aggregator has no
 * route for this pair right now" is a sentence a person can act on; "code 50103"
 * is not.
 */
export type Outcome<T> = { ok: true; value: T } | { ok: false; why: string };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

/** Hold, and say why. The name is the instruction. */
export const held = <T = never>(why: string): Outcome<T> => ({ ok: false, why });

/** Narrowing helper for call sites that only care about the happy path. */
export function isOk<T>(o: Outcome<T>): o is { ok: true; value: T } {
  return o.ok;
}

/**
 * Chain an outcome without unwrapping it by hand. A hold passes straight through with its
 * reason intact — the reason must never be replaced by a generic one further up the stack,
 * because the specific sentence is the whole point.
 */
export function map<A, B>(o: Outcome<A>, f: (a: A) => B): Outcome<B> {
  return o.ok ? ok(f(o.value)) : o;
}

export function flatMap<A, B>(o: Outcome<A>, f: (a: A) => Outcome<B>): Outcome<B> {
  return o.ok ? f(o.value) : o;
}

/**
 * Collect a list of outcomes, holding on the FIRST failure with its reason. Used where a
 * partial answer is worse than none — an allocation with one leg missing is not an
 * allocation, it is a different allocation nobody signed.
 */
export function all<T>(items: readonly Outcome<T>[]): Outcome<T[]> {
  const out: T[] = [];
  for (const it of items) {
    if (!it.ok) return it;
    out.push(it.value);
  }
  return ok(out);
}

/**
 * THE LAST GUARD. A reader that is all `Outcome` can still meet a throw from below — an RPC
 * that refuses, a decoder that meets a byte it did not expect, an address that will not
 * parse. This turns that into a hold with the reason on it, so the surface renders an honest
 * waiting state instead of the request dying with a 500 and the visitor seeing nothing.
 *
 * `what` names the thing that could not be read, in the words a user reads: "the register",
 * "this grant". It is not a substitute for guarding a call whose failure has a better
 * sentence available; it is the floor beneath every one of them.
 */
export async function attempt<T>(what: string, fn: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await fn();
  } catch (err) {
    return held(
      isThrottle(err)
        ? `X Layer's endpoint is refusing reads right now, so ${what} could not be read. ` +
          `It is not lost; try again in a moment.`
        : `Could not read ${what} (${shortReason(err)}).`,
    );
  }
}

type RpcLike = {status?: unknown; code?: unknown; details?: unknown; shortMessage?: unknown; cause?: unknown};

/**
 * A THROTTLE, TOLD BY WHAT THE ENDPOINT SAID. Not by a "429" found anywhere in the text:
 * viem puts the request body in its message, and the GrantOpened topic hash has "429" in
 * it, so every failed escrow read used to look like rate limiting. The public endpoint
 * answers a throttle with HTTP 429 and JSON-RPC code -32016, "over rate limit".
 */
export function isThrottle(err: unknown, depth = 0): boolean {
  if (typeof err !== "object" || err === null || depth > 5) return false;
  const e = err as RpcLike;
  if (e.status === 429 || e.code === 429 || e.code === -32016) return true;
  const said =
    `${typeof e.details === "string" ? e.details : ""} ` +
    `${typeof e.shortMessage === "string" ? e.shortMessage : ""} ` +
    `${err instanceof Error ? err.message : ""}`;
  // Phrases, never a bare number: "HTTP 429" and "Status: 429" are what an endpoint says;
  // a lone "429" can be part of any hex string in a request body.
  if (/over rate limit|rate limited|too many requests|\bHTTP 429\b|Status: 429\b/i.test(said)) return true;
  return isThrottle(e.cause, depth + 1);
}

/** The one line of an error a person can read: viem's short message, never its request dump. */
export function shortReason(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const s = (err as RpcLike).shortMessage;
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  const m = err instanceof Error ? err.message : String(err);
  return m.split("\n")[0]!.slice(0, 200);
}
