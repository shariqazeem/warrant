/**
 * THE ENGRAVING IS EVIDENCE ONLY IF IT IS REPRODUCIBLE. The same seed must always draw the
 * same paths, different grants must draw different ones, and the port must draw exactly the
 * points the design files draw — checked here against the design's own function, copied
 * verbatim below, point by point.
 */
import {describe, expect, it} from "vitest";
import {
  certificateSeed,
  guilloche,
  hashSeed,
  LANDSCAPE,
  PORTRAIT,
  rng,
  SEAL_EDGE,
  sealEdge,
} from "./guilloche";

// ---------------------------------------------------------------------------------------
// The design files' functions, verbatim (Main.dc.html and Recipient.dc.html), as the
// reference. `compact` switches the four constants Recipient.dc.html changes.
function designGuilloche(seedText: string, W: number, H: number, rx: number, ry: number, rr: number, compact: boolean) {
  const r0 = rng(hashSeed(seedText));
  const rnd = () => r0();
  const f = (n: number) => n.toFixed(1);
  const mid = compact ? 24 : 27,
    amp = compact ? 8 : 10;
  const lam = compact ? 22 + Math.floor(rnd() * 10) : 24 + Math.floor(rnd() * 12);
  const out: string[] = [];
  for (let k = 0; k < 5; k++) {
    const ph = (k * 2 * Math.PI) / 5 + rnd() * 0.25;
    let a = "",
      b = "",
      c = "",
      d = "";
    for (let x = mid; x <= W - mid + 0.01; x += 3) {
      const s = amp * Math.sin((2 * Math.PI * x) / lam + ph);
      a += (a ? " L" : "M") + f(x) + " " + f(mid + s);
      b += (b ? " L" : "M") + f(x) + " " + f(H - mid - s);
    }
    for (let y = mid; y <= H - mid + 0.01; y += 3) {
      const s = amp * Math.sin((2 * Math.PI * y) / lam + ph);
      c += (c ? " L" : "M") + f(mid + s) + " " + f(y);
      d += (d ? " L" : "M") + f(W - mid - s) + " " + f(y);
    }
    out.push(a, b, c, d);
  }
  const pairs = [[96, 36], [90, 35], [105, 42], [96, 40], [112, 42], [84, 36]];
  const pr = pairs[Math.floor(rnd() * pairs.length)]!;
  const R = pr[0]!,
    r = pr[1]!;
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  const loops = r / g(R, r);
  const ros: string[] = [];
  [1, 0.74, 0.5].forEach((m) => {
    const dd = r * (0.9 + rnd() * 0.45) * m + 4;
    const sc = rr / (R - r + dd);
    const steps = 420 * loops;
    let p = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI * loops;
      const X = (R - r) * Math.cos(t) + dd * Math.cos(((R - r) / r) * t);
      const Y = (R - r) * Math.sin(t) - dd * Math.sin(((R - r) / r) * t);
      p += (p ? " L" : "M") + f(rx + X * sc) + " " + f(ry + Y * sc);
    }
    ros.push(p + " Z");
  });
  const corners: string[] = [];
  const k1 = compact ? 6 : 7,
    k2 = compact ? 5 : 6;
  [[mid, mid], [W - mid, mid], [mid, H - mid], [W - mid, H - mid]].forEach((pt) => {
    let p = "";
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * 4 * Math.PI;
      const X = k1 * Math.cos(t) + k2 * Math.cos(3.5 * t);
      const Y = k1 * Math.sin(t) - k2 * Math.sin(3.5 * t);
      p += (p ? " L" : "M") + f(pt[0]! + X) + " " + f(pt[1]! + Y);
    }
    corners.push(p + " Z");
  });
  return {waves: out.join(" "), rosette: ros.join(" "), corners: corners.join(" ")};
}

function designSealEdge(c: number, R: number, a: number, N: number) {
  let p = "";
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * 2 * Math.PI;
    const rad = R + a * Math.sin(N * t);
    p += (p ? " L" : "M") + (c + rad * Math.cos(t)).toFixed(2) + " " + (c + rad * Math.sin(t)).toFixed(2);
  }
  return p + " Z";
}
// ---------------------------------------------------------------------------------------

/**
 * Every point a path visits, in integer units of 1/scale: M and L absolute, m and l
 * relative, implicit repetition after either, Z closing. Enough SVG to read both encodings.
 */
function points(d: string, scale: number): Array<[number, number]> {
  const tokens = d.match(/[MmLlZz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const out: Array<[number, number]> = [];
  let cmd = "M";
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i]!;
    if (/[MmLlZz]/.test(t)) {
      cmd = t;
      i++;
      if (t === "Z" || t === "z") out.push([NaN, NaN]); // a subpath boundary
      continue;
    }
    const a = Number(tokens[i]!);
    const b = Number(tokens[i + 1]!);
    i += 2;
    if (cmd === "M" || cmd === "L") {
      x = a;
      y = b;
    } else {
      x += a;
      y += b;
    }
    out.push([Math.round(x * scale), Math.round(y * scale)]);
    if (cmd === "M") cmd = "L";
    if (cmd === "m") cmd = "l";
  }
  return out;
}

const SEED = certificateSeed(196, "0xB238d76499616377abd4908e46f29c7ce50908d1", 1);

describe("the seed", () => {
  it("names the chain, the escrow and the grant, and ignores the address's case", () => {
    expect(SEED).toBe("196|0xb238d76499616377abd4908e46f29c7ce50908d1|1");
    expect(certificateSeed(196, "0xb238d76499616377abd4908e46f29c7ce50908d1", 1)).toBe(SEED);
    expect(certificateSeed(196, "0xb238", 0, "form")).toBe("196|0xb238|0|form");
  });

  it("hashes and generates exactly as the design file does", () => {
    // FNV-1a of the empty string is the offset basis; the design never returns 0.
    expect(hashSeed("")).toBe(2166136261);
    const a = rng(hashSeed("warrant-000001"));
    const b = rng(hashSeed("warrant-000001"));
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("the engraving", () => {
  const L = LANDSCAPE;
  const P = PORTRAIT;

  it("is deterministic: the same seed always draws the same paths", () => {
    const one = guilloche(SEED, L.W, L.H, L.rx, L.ry, L.rr);
    // A second call hits the memo; a different but equal seed string must still agree.
    const two = guilloche(`${SEED}`, L.W, L.H, L.rx, L.ry, L.rr);
    expect(two).toEqual(one);
    const fresh = guilloche(`${SEED}|x`.slice(0, SEED.length), L.W, L.H, L.rx, L.ry, L.rr);
    expect(fresh.waves).toBe(one.waves);
  });

  it("differs from grant to grant", () => {
    const one = guilloche(certificateSeed(196, "0xb238", 1), L.W, L.H, L.rx, L.ry, L.rr);
    const two = guilloche(certificateSeed(196, "0xb238", 2), L.W, L.H, L.rx, L.ry, L.rr);
    expect(two.waves).not.toBe(one.waves);
    // The rosette may pick the same gear pair, but never the same loops.
    expect(two.rosette).not.toBe(one.rosette);
  });

  it("writes paths that start with M and hold only finite numbers", () => {
    for (const g of [
      guilloche(SEED, L.W, L.H, L.rx, L.ry, L.rr),
      guilloche(SEED, P.W, P.H, P.rx, P.ry, P.rr),
    ]) {
      for (const d of [g.waves, g.rosette, g.corners]) {
        expect(d.startsWith("M")).toBe(true);
        expect(d).not.toMatch(/NaN|Infinity|undefined/);
        for (const [x, y] of points(d, 10)) {
          if (Number.isNaN(x)) continue;
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        }
      }
    }
  });

  it("stays inside the certificate", () => {
    for (const [dims, W, H] of [
      [L, L.W, L.H],
      [P, P.W, P.H],
    ] as const) {
      const g = guilloche(SEED, W, H, dims.rx, dims.ry, dims.rr);
      for (const d of [g.waves, g.rosette, g.corners]) {
        for (const [x, y] of points(d, 10)) {
          if (Number.isNaN(x)) continue;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(W * 10);
          expect(y).toBeLessThanOrEqual(H * 10);
        }
      }
    }
  });

  for (const [name, dims, compact] of [
    ["landscape", LANDSCAPE, false],
    ["portrait", PORTRAIT, true],
  ] as const) {
    it(`draws the design file's ${name} points, every one of them`, () => {
      for (const seed of [SEED, "warrant-000001", certificateSeed(196, "0xb238", 7, "form")]) {
        const ours = guilloche(seed, dims.W, dims.H, dims.rx, dims.ry, dims.rr);
        const theirs = designGuilloche(seed, dims.W, dims.H, dims.rx, dims.ry, dims.rr, compact);
        for (const part of ["waves", "rosette", "corners"] as const) {
          expect(points(ours[part], 10)).toEqual(points(theirs[part], 10));
        }
        // And in about half the bytes.
        const size = (g: {waves: string; rosette: string; corners: string}) =>
          g.waves.length + g.rosette.length + g.corners.length;
        expect(size(ours)).toBeLessThan(size(theirs) * 0.65);
      }
    });
  }

  it("follows the width unless told otherwise", () => {
    const auto = guilloche(SEED, 350, 520, 175, 262, 118);
    const forced = guilloche(SEED, 350, 520, 175, 262, 118, false);
    expect(forced.waves).not.toBe(auto.waves);
    expect(guilloche(SEED, 350, 520, 175, 262, 118, true)).toEqual(auto);
  });
});

describe("the seal's edge", () => {
  for (const size of [118, 96] as const) {
    it(`draws the design file's scallops at ${size}`, () => {
      const [c, R, a, N] = SEAL_EDGE[size];
      const ours = sealEdge(c, R, a, N);
      expect(ours.startsWith("M")).toBe(true);
      expect(ours.endsWith("Z")).toBe(true);
      expect(points(ours, 100)).toEqual(points(designSealEdge(c, R, a, N), 100));
      expect(sealEdge(c, R, a, N)).toBe(ours);
    });
  }
});
