/**
 * ONE PROCESS-WIDE LINE FOR EVERY PRICE ON THE SITE.
 *
 * Every visitor's quote waits in the same queue, so the queue's two failure shapes are
 * everyone's failure: a call that never answers stalls the whole line, and a line with no
 * end makes the last visitor wait minutes for a price. Both must come back as a sentence.
 */
import {afterEach, describe, expect, it, vi} from "vitest";
import {BUSY, TIMED_OUT, fetchText, pacer, routerOf} from "./okx";
import {ok, type Outcome} from "./outcome";

/** A promise the test resolves by hand, standing in for a slow aggregator. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return {promise, resolve};
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the queue in front of the aggregator", () => {
  it("runs one call at a time, in the order they were asked", async () => {
    const pace = pacer(0, 20);
    const events: string[] = [];
    const call = (name: string) =>
      pace(async () => {
        events.push(`start ${name}`);
        await tick();
        events.push(`end ${name}`);
        return ok(name);
      });

    const results = await Promise.all([call("a"), call("b"), call("c")]);
    expect(results.map((r) => r.ok && r.value)).toEqual(["a", "b", "c"]);
    expect(events).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("keeps a gap between calls", async () => {
    const pace = pacer(25, 20);
    const starts: number[] = [];
    const call = () =>
      pace(async () => {
        starts.push(Date.now());
        return ok(true);
      });
    await Promise.all([call(), call()]);
    // A timer can fire a millisecond early; the gap is a floor, not an exact figure.
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(24);
  });

  it("refuses at once, in words, when the line behind the running call is full", async () => {
    const pace = pacer(0, 3);
    const gate = deferred<void>();
    const slow = () =>
      pace(async () => {
        await gate.promise;
        return ok("priced");
      });

    // One running and three waiting are admitted; the fifth and sixth are not.
    const admitted = [slow(), slow(), slow(), slow()];
    const refused = await Promise.all([slow(), slow()]);
    expect(refused).toEqual([
      {ok: false, why: BUSY},
      {ok: false, why: BUSY},
    ]);

    gate.resolve();
    const done = await Promise.all(admitted);
    expect(done.every((r) => r.ok)).toBe(true);

    // The line drained, so the next caller is admitted again.
    const after = await pace(async () => ok("again"));
    expect(after).toEqual({ok: true, value: "again"});
  });

  it("does not jam when a call throws", async () => {
    const pace = pacer(0, 20);
    const broken = pace<string>(async () => {
      throw new Error("boom");
    });
    const next = pace(async () => ok("still priced"));
    await expect(broken).rejects.toThrow("boom");
    expect(await next).toEqual({ok: true, value: "still priced"});
  });
});

describe("one request to the aggregator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("holds with a sentence when the aggregator never answers", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });
    const out: Outcome<unknown> = await fetchText("https://aggregator.invalid", {}, 20);
    expect(out).toEqual({ok: false, why: TIMED_OUT});
  });

  it("holds, naming the cause, when the connection fails outright", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const out = await fetchText("https://aggregator.invalid", {}, 1_000);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.why).toMatch(/Could not reach the OKX aggregator \(fetch failed\)/);
  });

  it("returns the status and body when it answers in time", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"code":"0"}', {status: 200}));
    const out = await fetchText("https://aggregator.invalid", {}, 1_000);
    expect(out).toEqual({ok: true, value: {status: 200, text: '{"code":"0"}'}});
  });
});

describe("the router a route is checked against", () => {
  const ROUTER = "0x8b773d83bc66be128c60e07e17c8901f7a64f000";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** An RPC that answers `router()` with ROUTER, counting how often it is asked. */
  function chainAnswering() {
    const asked = {count: 0};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      asked.count++;
      const {id} = JSON.parse(String(init.body)) as {id: number};
      const result = `0x${ROUTER.slice(2).padStart(64, "0")}`;
      return new Response(JSON.stringify({jsonrpc: "2.0", id, result}), {
        headers: {"content-type": "application/json"},
      });
    });
    return asked;
  }

  it("reads the contract's own router, once, because it can never change", async () => {
    const asked = chainAnswering();
    const contract = "0x00000000000000000000000000000000000ca511";
    for (let i = 0; i < 2; i++) {
      const out = await routerOf(contract);
      // viem hands back the checksummed form; the check that uses it ignores case.
      expect(out.ok && out.value.toLowerCase()).toBe(ROUTER);
    }
    expect(asked.count).toBe(1);
  });

  it("falls back to the router it was deployed with when the chain will not answer", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubEnv("OKX_ROUTER", ROUTER);
    expect(await routerOf("0x00000000000000000000000000000000000ca512")).toEqual({ok: true, value: ROUTER});
  });

  it("prices nothing when it cannot tell which router the contract calls", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubEnv("OKX_ROUTER", "");
    const out = await routerOf("0x00000000000000000000000000000000000ca513");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.why).toMatch(/Could not confirm which exchange contract/);
  });
});
