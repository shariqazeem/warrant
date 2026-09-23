import {describe, expect, it} from "vitest";
import {runLabel} from "./format";
import {newRunId, runTag, singlePayRunId} from "./run-id";

const AT = new Date(Date.UTC(2026, 8, 25, 13, 0, 5));

describe("run ids", () => {
  it("read back as a name a person can say", () => {
    expect(runLabel(newRunId(AT, "k3f9"))).toBe("run-260925-130005-k3f9");
    expect(runLabel(singlePayRunId(AT, "k3f9"))).toBe("pay-260925-130005-k3f9");
  });

  it("carry a tag nobody can guess, so a name cannot be taken in advance", () => {
    const a = newRunId(AT);
    const b = newRunId(AT);
    expect(a).not.toBe(b);
    expect(runTag()).toMatch(/^[a-hj-km-np-z2-9]{4}$/);
  });

  it("fit in bytes32", () => {
    expect(newRunId(AT)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
