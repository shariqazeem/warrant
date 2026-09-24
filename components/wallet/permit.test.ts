/**
 * ONE SIGNATURE WHEN IT CAN WORK, AN APPROVAL WHEN IT CANNOT.
 *
 * The permit path is the product's one-signature promise, and the fallback is what keeps a
 * smart-contract wallet from failing on every retry. These read the decision with a real
 * signer, a wallet that signs as someone else, one that returns a long contract signature,
 * one that cannot sign typed data, and a payer who says no.
 */
import {describe, expect, it} from "vitest";
import {keccak256, recoverTypedDataAddress, toHex, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {buildDomain} from "../../lib/permit";
import {grantEscrowAbi, payrollAbi} from "../../lib/payroll-abi";
import {held, ok} from "../../lib/outcome";
import {
  PERMIT_FAILED_SELECTOR,
  approveFirst,
  isPermitRefusal,
  isUserRejection,
  signPermit,
  splitPermitSignature,
  type PermitTypedData,
} from "./permit";

// Anvil's first two development keys: public, and never used for anything real.
const payer = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const someoneElse = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const PAYROLL = "0x00000000000000000000000000000000000ca511" as const;

/** A permit request for $25, with the wallet call supplied by the test. */
const ask = (sign: (typed: PermitTypedData) => Promise<Hex>, owner = payer.address) =>
  signPermit({
    owner,
    spender: PAYROLL,
    value: 25_000_000n,
    domain: async () => ok({domain: buildDomain("Tether USD", "1")}),
    nonce: async () => 0n,
    deadline: async () => 1_900_000_000n,
    sign,
  });

describe("a permit signature", () => {
  const r = "11".repeat(32);
  const s = "22".repeat(32);

  it("splits 65 bytes into v, r and s, reading 0/1 as 27/28", () => {
    expect(splitPermitSignature(`0x${r}${s}1b`)).toEqual({v: 27, r: `0x${r}`, s: `0x${s}`});
    expect(splitPermitSignature(`0x${r}${s}00`)?.v).toBe(27);
    expect(splitPermitSignature(`0x${r}${s}01`)?.v).toBe(28);
  });

  it("is refused when it is not 65 bytes the token can read", () => {
    expect(splitPermitSignature(`0x${r}${s}`)).toBeNull(); // compact, 64 bytes
    expect(splitPermitSignature(`0x${r}${s}1b${"00".repeat(40)}`)).toBeNull(); // a contract's
    expect(splitPermitSignature(`0x${r}${s}1d`)).toBeNull(); // v is neither 27 nor 28
  });
});

describe("asking a wallet for a permit", () => {
  it("uses a signature the token will recover to the payer", async () => {
    let asked: PermitTypedData | null = null;
    const out = await ask(async (typed) => {
      asked = typed;
      return payer.signTypedData(typed);
    });
    expect(out.kind).toBe("signed");
    if (out.kind !== "signed" || !asked) return;
    expect(out.permit.value).toBe(25_000_000n);
    expect(out.permit.deadline).toBe(1_900_000_000n);
    const {v, r, s} = out.permit;
    const signature = `${r}${s.slice(2)}${v.toString(16)}` as Hex;
    expect(await recoverTypedDataAddress({...(asked as PermitTypedData), signature})).toBe(payer.address);
  });

  it("falls back when the signature recovers to someone else, as a smart wallet's does", async () => {
    const out = await ask((typed) => someoneElse.signTypedData(typed));
    expect(out).toEqual({kind: "unusable", why: "This wallet signs in a form USD₮0 cannot check."});
  });

  it("falls back when the wallet returns a contract signature the token cannot read", async () => {
    const out = await ask(async () => `0x${"ab".repeat(200)}` as Hex);
    expect(out.kind).toBe("unusable");
  });

  it("falls back when the wallet cannot sign typed data at all", async () => {
    const out = await ask(async () => {
      throw new Error("The method eth_signTypedData_v4 does not exist / is not available.");
    });
    expect(out).toEqual({kind: "unusable", why: "This wallet cannot sign an approval."});
  });

  it("stops, with no fallback, when the payer says no", async () => {
    const rejected = Object.assign(new Error("User rejected the request."), {code: 4001});
    expect(await ask(async () => Promise.reject(rejected))).toEqual({kind: "dismissed"});
  });

  it("falls back, without asking the wallet, when the token's domain cannot be reproduced", async () => {
    let walletAsked = false;
    const out = await signPermit({
      owner: payer.address,
      spender: PAYROLL,
      value: 1n,
      domain: async () => held("USDT reports a domain separator nothing here reproduces."),
      nonce: async () => 0n,
      deadline: async () => 1n,
      sign: async () => {
        walletAsked = true;
        return "0x";
      },
    });
    expect(out).toEqual({kind: "unusable", why: "USDT reports a domain separator nothing here reproduces."});
    expect(walletAsked).toBe(false);
  });

  it("falls back when the nonce cannot be read", async () => {
    const out = await signPermit({
      owner: payer.address,
      spender: PAYROLL,
      value: 1n,
      domain: async () => ok({domain: buildDomain("Tether USD", "1")}),
      nonce: async () => {
        throw new Error("HTTP request failed");
      },
      deadline: async () => 1n,
      sign: (typed) => payer.signTypedData(typed),
    });
    expect(out.kind).toBe("unusable");
  });

  it("says plainly that the fallback takes two requests", () => {
    expect(approveFirst("pay")).toBe(
      "Your wallet can't approve by signature, so it will ask twice: once to approve the USD₮0, then once to pay.",
    );
  });
});

describe("reading a wallet's error", () => {
  it("knows a dismissal however deep the wallet nested it", () => {
    expect(isUserRejection({code: 4001})).toBe(true);
    expect(isUserRejection(new Error("outer", {cause: new Error("User denied transaction signature")}))).toBe(true);
    expect(isUserRejection(new Error("execution reverted"))).toBe(false);
  });

  it("knows the contract refused the permit, by name or by selector", () => {
    // viem, when it decoded the revert against the ABI.
    const decoded = new Error("The contract function reverted.", {
      cause: Object.assign(new Error("reverted"), {data: {errorName: "PermitFailed"}}),
    });
    expect(isPermitRefusal(decoded)).toBe(true);
    // A wallet that passed the raw revert data through.
    expect(isPermitRefusal(Object.assign(new Error("execution reverted"), {data: PERMIT_FAILED_SELECTOR}))).toBe(true);
    expect(isPermitRefusal(new Error(`reverted with the following signature: ${PERMIT_FAILED_SELECTOR}`))).toBe(true);
    expect(isPermitRefusal(new Error("Error: PermitFailed()"))).toBe(true);
  });

  it("does not mistake another refusal for the permit's", () => {
    expect(isPermitRefusal(new Error("Error: BelowMinimum(0, 1, 2)"))).toBe(false);
    expect(isPermitRefusal(new Error("User rejected the request."))).toBe(false);
  });

  it("uses the selector of the error both contracts actually declare", () => {
    expect(PERMIT_FAILED_SELECTOR).toBe(keccak256(toHex("PermitFailed()")).slice(0, 10));
    for (const abi of [payrollAbi, grantEscrowAbi]) {
      const declared = abi.find((e) => e.type === "error" && e.name === "PermitFailed");
      expect(declared, "PermitFailed missing from an ABI").toBeDefined();
      // No arguments, so its signature is exactly "PermitFailed()" and the selector above.
      expect((declared as {inputs: readonly unknown[]}).inputs).toHaveLength(0);
    }
  });
});
