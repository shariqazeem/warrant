import { keepAlivePost } from "./http";
import { gateFor } from "./limiter";

/**
 * THE ONE PLACE A REQUEST MEETS THE ENDPOINT. Every call waits its turn at the endpoint's
 * gate; if the answer is 429, the gate is told, and then EVERY caller waits out the same
 * cool-off instead of each retrying into the same refusal. A call is retried a couple of
 * times behind that wait and then gives up, so the surface above can say what it could not
 * read rather than hanging on a queue of doomed retries.
 */
const TRIES = 2;

export function gatedFetch(url: string): (input: unknown, init: unknown) => Promise<Response> {
  const gate = gateFor(url);
  const trace = process.env.SCRIP_RPC_DEBUG === "1";
  return async (input: unknown, init: unknown) => {
    const at = Date.now();
    let last: Awaited<ReturnType<typeof keepAlivePost>> | null = null;
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const res = await gate.run(() => keepAlivePost(input, init));
      if (res.status !== 429) {
        gate.reward();
        if (trace) console.log(`rpc ${methodOf(init)} ${Date.now() - at}ms${attempt > 0 ? ` after ${attempt} refusal(s)` : ""}`);
        return res as unknown as Response;
      }
      gate.penalize();
      last = res;
    }
    // Refusals with a widening pause between them: the endpoint means it.
    if (trace) console.log(`rpc ${methodOf(init)} REFUSED ${Date.now() - at}ms`);
    return last as unknown as Response;
  };
}

/** The JSON-RPC method, for a trace line. A batch is named by its first call and its size. */
function methodOf(init: unknown): string {
  const body = (init as { body?: unknown } | null)?.body;
  if (typeof body !== "string") return "?";
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed)) {
      const first = parsed[0] as { method?: string } | undefined;
      return `${first?.method ?? "?"}×${parsed.length}`;
    }
    return (parsed as { method?: string }).method ?? "?";
  } catch {
    return "?";
  }
}
