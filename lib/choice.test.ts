/**
 * THE CHOICE IS MONEY-CRITICAL: it decides how much of someone's pay is swapped into what.
 *
 * So every rule is tested against a real signature — made here by a viem local account with
 * a random key, exactly as a wallet makes one — and against the ways a signature can lie: a
 * field changed after signing, a different domain, another wallet, the wrong time. None of
 * these tests touch a network: an ordinary wallet is checked locally, and the chain is played
 * by a transport that answers the one question a smart-contract wallet would ask it.
 */
import {
  concat,
  createPublicClient,
  custom,
  encodeAbiParameters,
  getAddress,
  keccak256,
  toHex,
} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";
import {ASSETS} from "./assets";
import {STABLE, xLayer} from "./chain";
import {
  CHOICE_DOMAIN,
  CHOICE_DOMAIN_TYPE,
  CHOICE_FIXTURE,
  CHOICE_TYPES,
  EXAMPLE_PAYMENT,
  MAX_AGE_SECONDS,
  MAX_AHEAD_SECONDS,
  MAX_BPS,
  PAY_CHOICE_TYPE,
  ZERO_ADDRESS,
  checkChoice,
  checkIssuedAt,
  checkSignature,
  choiceDigest,
  choiceParts,
  choiceTypedData,
  choiceWords,
  exampleWords,
  splitByChoice,
  verifyChoice,
  type ChoiceMessage,
} from "./choice";

const NOW = 1_790_000_000;
const SPYX = ASSETS[0]!;

/** The chain, played by a transport. Records every question it is asked. */
function chain(answer: "valid" | "invalid" | "down") {
  const calls: string[] = [];
  const client = createPublicClient({
    chain: xLayer,
    transport: custom(
      {
        async request({method}: {method: string}) {
          calls.push(method);
          if (answer === "down") throw new Error("fetch failed");
          if (method === "eth_chainId") return "0xc4";
          // The ERC-6492 validator answers with one ABI-encoded bool.
          if (method === "eth_call") return answer === "valid" ? `0x${"0".repeat(63)}1` : `0x${"0".repeat(64)}`;
          throw new Error(`not expected in this test: ${method}`);
        },
      },
      {retryCount: 0},
    ),
  });
  return {client, calls};
}

function wallet() {
  const account = privateKeyToAccount(generatePrivateKey());
  return {account, address: account.address.toLowerCase() as `0x${string}`};
}

function stockChoice(person: `0x${string}`, over: Partial<ChoiceMessage> = {}): ChoiceMessage {
  return {person, stockBps: 2_500, asset: SPYX.address, eligible: true, issuedAt: NOW - 5, ...over};
}

// ── the typed data ───────────────────────────────────────────────────────────────────

describe("what a person signs", () => {
  it("is addressed to Warrant on X Layer, and to no single contract", () => {
    expect(CHOICE_DOMAIN).toEqual({name: "Warrant", version: "1", chainId: 196});
    expect("verifyingContract" in CHOICE_DOMAIN).toBe(false);
  });

  it("has the five fields of PayChoice, in the order the Solidity type string names them", () => {
    const fields = PAY_CHOICE_TYPE.match(/^PayChoice\((.*)\)$/)![1]!.split(",").map((f) => {
      const [type, name] = f.split(" ");
      return {name, type};
    });
    expect(fields).toEqual(CHOICE_TYPES.PayChoice.map((f) => ({name: f.name, type: f.type})));
  });

  it("hashes to what a contract would build by hand from the type strings", () => {
    const m = CHOICE_FIXTURE.message;
    const structHash = keccak256(
      encodeAbiParameters(
        [{type: "bytes32"}, {type: "address"}, {type: "uint16"}, {type: "address"}, {type: "bool"}, {type: "uint64"}],
        [keccak256(toHex(PAY_CHOICE_TYPE)), m.person, m.stockBps, m.asset, m.eligible, BigInt(m.issuedAt)],
      ),
    );
    const domainSeparator = keccak256(
      encodeAbiParameters(
        [{type: "bytes32"}, {type: "bytes32"}, {type: "bytes32"}, {type: "uint256"}],
        [keccak256(toHex(CHOICE_DOMAIN_TYPE)), keccak256(toHex("Warrant")), keccak256(toHex("1")), 196n],
      ),
    );
    const byHand = keccak256(concat(["0x1901", domainSeparator, structHash]));
    expect(choiceDigest(m)).toBe(byHand);
  });

  it("still hashes the pinned fixture to the pinned digest", () => {
    // If this fails, every stored signature and any contract checking them just broke.
    expect(choiceDigest(CHOICE_FIXTURE.message)).toBe(CHOICE_FIXTURE.digest);
  });

  it("hashes an address the same whatever its case", () => {
    const m = CHOICE_FIXTURE.message;
    expect(choiceDigest({...m, asset: getAddress(m.asset)})).toBe(CHOICE_FIXTURE.digest);
  });
});

// ── the rules ────────────────────────────────────────────────────────────────────────

describe("the rules a choice must meet", () => {
  const person = "0x00000000000000000000000000000000000000a1" as const;

  it("accepts any listed stock, for whoever confirms they may hold it", () => {
    for (const a of ASSETS) {
      const got = checkChoice(stockChoice(person, {asset: a.address}));
      expect(got.ok, a.symbol).toBe(true);
    }
  });

  it("accepts all cash, which names no stock and needs no statement", () => {
    expect(checkChoice({person, stockBps: 0, asset: ZERO_ADDRESS, eligible: false, issuedAt: NOW}).ok).toBe(true);
    expect(checkChoice({person, stockBps: 0, asset: ZERO_ADDRESS, eligible: true, issuedAt: NOW}).ok).toBe(true);
  });

  it("accepts every whole share from 0 to 100%", () => {
    for (let bps = 0; bps <= MAX_BPS; bps += 100) {
      const m = bps === 0 ? {person, stockBps: 0, asset: ZERO_ADDRESS, eligible: false, issuedAt: NOW} : stockChoice(person, {stockBps: bps});
      expect(checkChoice(m).ok, `${bps} bps`).toBe(true);
    }
  });

  it("keeps the five fields and nothing else, with addresses lowercased", () => {
    const got = checkChoice({...stockChoice(getAddress(person) as `0x${string}`, {asset: getAddress(SPYX.address) as `0x${string}`}), extra: "smuggled"});
    expect(got).toEqual({ok: true, value: {person, stockBps: 2_500, asset: SPYX.address, eligible: true, issuedAt: NOW - 5}});
  });

  it("refuses a share above 100%", () => {
    const got = checkChoice(stockChoice(person, {stockBps: MAX_BPS + 1}));
    expect(got).toEqual({ok: false, why: "The share of each payment that becomes stock must be between 0% and 100%."});
  });

  it("refuses a share that is negative, fractional, or not a number", () => {
    for (const stockBps of [-1, 2_500.5, Number.NaN, Number.POSITIVE_INFINITY, "2500", null]) {
      expect(checkChoice({...stockChoice(person), stockBps}).ok, String(stockBps)).toBe(false);
    }
  });

  it("refuses a stock Warrant does not pay in", () => {
    const got = checkChoice(stockChoice(person, {asset: "0x1111111111111111111111111111111111111111"}));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("not one of them");
  });

  it("refuses the stablecoin as the stock", () => {
    expect(checkChoice(stockChoice(person, {asset: STABLE.address})).ok).toBe(false);
  });

  it("refuses stock for someone who did not confirm they may hold it", () => {
    const got = checkChoice(stockChoice(person, {eligible: false}));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("not a US person");
  });

  it("refuses a stock named on a choice where nothing becomes stock", () => {
    const got = checkChoice({person, stockBps: 0, asset: SPYX.address, eligible: true, issuedAt: NOW});
    expect(got.ok).toBe(false);
  });

  it("refuses a person who is not an address, or whose checksum is wrong", () => {
    expect(checkChoice(stockChoice("0x1234" as `0x${string}`)).ok).toBe(false);
    const good = getAddress("0x52908400098527886e0f7030069857d2e4169ee7");
    // Flip the case of the first letter: same address, broken checksum.
    const i = good.slice(2).search(/[a-fA-F]/) + 2;
    const flipped = good[i] === good[i]!.toLowerCase() ? good[i]!.toUpperCase() : good[i]!.toLowerCase();
    const bad = `${good.slice(0, i)}${flipped}${good.slice(i + 1)}` as `0x${string}`;
    expect(bad.toLowerCase()).toBe(good.toLowerCase());
    expect(checkChoice(stockChoice(good)).ok).toBe(true);
    expect(checkChoice(stockChoice(bad)).ok).toBe(false);
  });

  it("refuses a time that is not a whole, non-negative number of seconds", () => {
    for (const issuedAt of [-1, 1.5, "1790000000", Number.NaN, 2 ** 60]) {
      expect(checkChoice({...stockChoice(person), issuedAt}).ok, String(issuedAt)).toBe(false);
    }
  });

  it("refuses anything that is not a choice at all", () => {
    for (const raw of [null, undefined, 42, "choice", [], {}]) expect(checkChoice(raw).ok).toBe(false);
    expect(checkChoice({...stockChoice(person), eligible: "yes"}).ok).toBe(false);
  });
});

describe("the clock rule", () => {
  it("allows up to ten minutes ahead, and no more", () => {
    expect(checkIssuedAt(NOW + MAX_AHEAD_SECONDS, NOW).ok).toBe(true);
    const got = checkIssuedAt(NOW + MAX_AHEAD_SECONDS + 1, NOW);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("ahead of Warrant's clock");
  });

  it("allows up to a day old, and no older", () => {
    expect(checkIssuedAt(NOW - MAX_AGE_SECONDS, NOW).ok).toBe(true);
    const got = checkIssuedAt(NOW - MAX_AGE_SECONDS - 1, NOW);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("more than a day ago");
  });
});

describe("the shape of a signature", () => {
  it("is whole bytes of hex, lowercased", () => {
    expect(checkSignature(`0x${"AB".repeat(65)}`)).toEqual({ok: true, value: `0x${"ab".repeat(65)}`});
    for (const raw of ["", "0x", "0xabc", `0x${"zz".repeat(65)}`, 42, null, "ab".repeat(65)]) {
      expect(checkSignature(raw).ok, String(raw)).toBe(false);
    }
  });

  it("refuses one too long to be any wallet's", () => {
    expect(checkSignature(`0x${"ab".repeat(8_192)}`).ok).toBe(true);
    expect(checkSignature(`0x${"ab".repeat(8_193)}`).ok).toBe(false);
  });
});

// ── the signature ────────────────────────────────────────────────────────────────────

describe("checking a signed choice", () => {
  it("accepts a real signature from the wallet, without asking the network anything", async () => {
    const {account, address} = wallet();
    const m = stockChoice(address);
    const signature = await account.signTypedData(choiceTypedData(m));
    const {client, calls} = chain("down");

    const got = await verifyChoice(m, signature, {now: NOW, client});
    expect(got).toEqual({ok: true, value: {...m, signature: signature.toLowerCase()}});
    expect(calls).toEqual([]);
  });

  it("accepts the same signature when the wallet shows its address checksummed", async () => {
    const {account} = wallet();
    const m = stockChoice(account.address);
    const signature = await account.signTypedData(choiceTypedData(m));
    const got = await verifyChoice(m, signature.toUpperCase().replace("0X", "0x"), {now: NOW, client: chain("down").client});
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.value.person).toBe(account.address.toLowerCase());
  });

  it("accepts all cash, signed", async () => {
    const {account, address} = wallet();
    const m: ChoiceMessage = {person: address, stockBps: 0, asset: ZERO_ADDRESS, eligible: false, issuedAt: NOW};
    const signature = await account.signTypedData(choiceTypedData(m));
    expect((await verifyChoice(m, signature, {now: NOW, client: chain("down").client})).ok).toBe(true);
  });

  it("refuses the signature once any field has been changed", async () => {
    const {account, address} = wallet();
    const m = stockChoice(address);
    const signature = await account.signTypedData(choiceTypedData(m));
    const other = ASSETS.find((a) => a.address !== SPYX.address);

    const tampered: ChoiceMessage[] = [
      {...m, stockBps: 10_000},
      {...m, stockBps: 2_400},
      {...m, issuedAt: m.issuedAt + 1},
      ...(other ? [{...m, asset: other.address}] : []),
    ];
    for (const t of tampered) {
      const {client} = chain("invalid");
      const got = await verifyChoice(t, signature, {now: NOW, client});
      expect(got.ok, JSON.stringify(t)).toBe(false);
      if (!got.ok) expect(got.why).toContain("not made by this wallet");
    }
  });

  it("refuses a signature made for another domain", async () => {
    const {account, address} = wallet();
    const m = stockChoice(address);
    const td = choiceTypedData(m);
    const elsewhere = [
      {...td, domain: {...td.domain, chainId: 1}},
      {...td, domain: {...td.domain, name: "Warrant2"}},
      {...td, domain: {...td.domain, version: "2"}},
    ];
    for (const d of elsewhere) {
      const signature = await account.signTypedData(d);
      const got = await verifyChoice(m, signature, {now: NOW, client: chain("invalid").client});
      expect(got.ok, JSON.stringify(d.domain)).toBe(false);
    }
  });

  it("refuses a choice for one wallet signed by another", async () => {
    const signer = wallet();
    const victim = wallet();
    const m = stockChoice(victim.address);
    const signature = await signer.account.signTypedData(choiceTypedData(m));
    const got = await verifyChoice(m, signature, {now: NOW, client: chain("invalid").client});
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("not made by this wallet");
  });

  it("refuses a stale choice and a future one before looking at the signature", async () => {
    const {account, address} = wallet();
    for (const issuedAt of [NOW - MAX_AGE_SECONDS - 1, NOW + MAX_AHEAD_SECONDS + 1]) {
      const m = stockChoice(address, {issuedAt});
      const signature = await account.signTypedData(choiceTypedData(m));
      const {client, calls} = chain("valid");
      const got = await verifyChoice(m, signature, {now: NOW, client});
      expect(got.ok, String(issuedAt)).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it("refuses a signed choice that breaks a rule, however good the signature", async () => {
    const {account, address} = wallet();
    const broken: ChoiceMessage[] = [
      stockChoice(address, {asset: "0x1111111111111111111111111111111111111111"}),
      stockChoice(address, {eligible: false}),
      {person: address, stockBps: 0, asset: SPYX.address, eligible: true, issuedAt: NOW},
    ];
    for (const m of broken) {
      const signature = await account.signTypedData(choiceTypedData(m));
      const {client, calls} = chain("valid");
      expect((await verifyChoice(m, signature, {now: NOW, client})).ok, JSON.stringify(m)).toBe(false);
      expect(calls).toEqual([]);
    }
    // A share above 100% cannot even be signed as a uint16 of the right meaning; the rule
    // refuses it before the signature is looked at.
    const m = stockChoice(address, {stockBps: 10_001});
    const signature = await account.signTypedData(choiceTypedData(m));
    expect((await verifyChoice(m, signature, {now: NOW, client: chain("valid").client})).ok).toBe(false);
  });

  it("accepts a smart-contract wallet the chain vouches for", async () => {
    // The wallet is a contract, so its signature does not recover to its address; the owner
    // key signs and the contract's ERC-1271 answer is what counts.
    const owner = wallet();
    const contract = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe" as const;
    const m = stockChoice(contract);
    const signature = await owner.account.signTypedData(choiceTypedData(m));
    const {client, calls} = chain("valid");
    const got = await verifyChoice(m, signature, {now: NOW, client});
    expect(got.ok).toBe(true);
    expect(calls).toContain("eth_call");
  });

  it("says it could not check, never that the signature is wrong, when X Layer is down", async () => {
    const owner = wallet();
    const m = stockChoice("0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe");
    const signature = await owner.account.signTypedData(choiceTypedData(m));
    const got = await verifyChoice(m, signature, {now: NOW, client: chain("down").client});
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.why).toContain("could not be checked");
      expect(got.why).not.toContain("not made by this wallet");
    }
  });

  it("refuses something that is not a signature", async () => {
    const {address} = wallet();
    const got = await verifyChoice(stockChoice(address), "not a signature", {now: NOW, client: chain("valid").client});
    expect(got).toEqual({ok: false, why: "That is not a signature."});
  });
});

// ── the split ────────────────────────────────────────────────────────────────────────

describe("the split", () => {
  it("sends nothing to stock at 0%", () => {
    expect(splitByChoice(123_456_789n, 0)).toEqual({stock: 0n, cash: 123_456_789n});
  });

  it("sends everything to stock at 100%", () => {
    expect(splitByChoice(123_456_789n, MAX_BPS)).toEqual({stock: 123_456_789n, cash: 0n});
  });

  it("rounds odd amounts down into stock and gives the remainder to cash", () => {
    expect(splitByChoice(1n, 2_500)).toEqual({stock: 0n, cash: 1n});
    expect(splitByChoice(3n, 2_500)).toEqual({stock: 0n, cash: 3n});
    expect(splitByChoice(7n, 2_500)).toEqual({stock: 1n, cash: 6n});
    expect(splitByChoice(999_999n, 2_500)).toEqual({stock: 249_999n, cash: 750_000n});
    expect(splitByChoice(1_000_001n, 2_500)).toEqual({stock: 250_000n, cash: 750_001n});
    expect(splitByChoice(25_000_000n, 2_500)).toEqual({stock: 6_250_000n, cash: 18_750_000n});
  });

  it("keeps a single base unit whole: all cash below 100%, all stock at 100%", () => {
    for (let bps = 0; bps < MAX_BPS; bps += 1) expect(splitByChoice(1n, bps)).toEqual({stock: 0n, cash: 1n});
    expect(splitByChoice(1n, MAX_BPS)).toEqual({stock: 1n, cash: 0n});
  });

  it("never creates or loses a unit, and never rounds stock up", () => {
    const amounts = [0n, 1n, 2n, 9_999n, 10_000n, 10_001n, 123_456_789n, 2n ** 64n + 7n, 2n ** 200n - 1n];
    let seed = 7;
    for (let i = 0; i < 200; i++) {
      seed = (seed * 48_271) % 2_147_483_647;
      amounts.push(BigInt(seed) * BigInt(seed % 1_000 + 1));
    }
    const shares = [0, 1, 999, 2_500, 3_333, 5_000, 6_667, 9_999, MAX_BPS];
    for (const stable of amounts) {
      for (const share of shares) {
        const {stock, cash} = splitByChoice(stable, share);
        expect(stock + cash, `${stable} at ${share}`).toBe(stable);
        expect(stock >= 0n && cash >= 0n).toBe(true);
        // floor: stock is the largest whole number with stock × 10 000 ≤ stable × share
        expect(stock * 10_000n <= stable * BigInt(share)).toBe(true);
        expect((stock + 1n) * 10_000n > stable * BigInt(share)).toBe(true);
      }
    }
  });

  it("refuses a share no stored choice can have, rather than guessing", () => {
    for (const share of [-1, MAX_BPS + 1, 2_500.5, Number.NaN]) {
      expect(() => splitByChoice(100n, share), String(share)).toThrow(RangeError);
    }
    expect(() => splitByChoice(-1n, 2_500)).toThrow(RangeError);
  });
});

// ── the words ────────────────────────────────────────────────────────────────────────

describe("the words for a choice", () => {
  it("says all cash plainly", () => {
    expect(choiceWords({stockBps: 0, asset: ZERO_ADDRESS})).toBe(
      "0% of each payment becomes stock: all of it arrives as USDT",
    );
  });

  it("names every listed stock by its name and symbol", () => {
    for (const a of ASSETS) {
      expect(choiceWords({stockBps: 2_500, asset: a.address})).toBe(
        `25% of each payment into ${a.name} (${a.symbol}), the rest as USDT`,
      );
    }
  });

  it("drops 'the rest' when there is no rest", () => {
    expect(choiceWords({stockBps: MAX_BPS, asset: SPYX.address})).toBe(
      `100% of each payment into ${SPYX.name} (${SPYX.symbol})`,
    );
  });

  it("splits into the share, which a page prints large, and the rest", () => {
    expect(choiceParts({stockBps: 1_000, asset: SPYX.address}).share).toBe("10%");
    expect(choiceParts({stockBps: 2_550, asset: SPYX.address}).share).toBe("25.5%");
  });

  it("says so when a stored choice names a stock no longer listed, rather than hiding it", () => {
    expect(choiceWords({stockBps: 2_500, asset: "0x1111111111111111111111111111111111111111"})).toContain(
      "a stock Warrant no longer pays in (0x111111…1111)",
    );
  });

  it("works the $100 example out with the same split the payments use", () => {
    const at = (stockBps: number) => exampleWords({stockBps, asset: SPYX.address});
    expect(at(2_500)).toBe(`On a $100 payment, $25 becomes ${SPYX.symbol} and $75 arrives as USDT.`);
    expect(at(0)).toBe("On a $100 payment, all $100 arrives as USDT.");
    expect(at(MAX_BPS)).toBe(`On a $100 payment, all $100 becomes ${SPYX.symbol}.`);
    expect(at(3_333)).toBe(`On a $100 payment, $33.33 becomes ${SPYX.symbol} and $66.67 arrives as USDT.`);
    expect(EXAMPLE_PAYMENT).toBe(100_000_000n);
  });

  it("never shows an example whose two figures do not add up to the payment", () => {
    for (let percent = 0; percent <= 100; percent++) {
      const {stock, cash} = splitByChoice(EXAMPLE_PAYMENT, percent * 100);
      expect(stock + cash).toBe(EXAMPLE_PAYMENT);
      expect(stock).toBe(BigInt(percent) * 1_000_000n);
    }
  });
});
