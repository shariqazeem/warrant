/**
 * ONE PROCESS-WIDE LINE FOR EVERY PRICE ON THE SITE.
 *
 * Every visitor's quote waits in the same queue, so the queue's two failure shapes are
 * everyone's failure: a call that never answers stalls the whole line, and a line with no
 * end makes the last visitor wait minutes for a price. Both must come back as a sentence.
 */
import {afterEach, describe, expect, it, vi} from "vitest";
import {BUSY, TIMED_OUT, fetchText, pacer} from "./okx";
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
