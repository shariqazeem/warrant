/**
 * THE ENGRAVING: a guilloche border, a rosette and four corner knots, unique to each
 * certificate and reproducible from the chain.
 *
 * A port of `guilloche()` and `sealEdge()` from the design files (Main, Grant and Recipient
 * .dc.html): the same FNV-1a seed hash, the same xorshift32 generator drawn in the same
 * order, the same five phase-shifted waves, the same hypotrochoid rosette and the same
 * corner knots, rounded to the same 0.1 (0.01 for the seal). The portrait certificate uses
 * the finer geometry of Recipient.dc.html (waves at 24 with amplitude 8, wavelength 22–31,
 * knots 6/5); anything narrower than 400 is drawn that way unless told otherwise.
 *
 * WHAT CHANGED IS ONLY HOW THE POINTS ARE WRITTEN. The design wrote every point as an
 * absolute "L123.4 56.7"; a certificate carries about thirteen thousand of them, and a
 * server-rendered page carries each path twice (the HTML and the React payload). Here each
 * subpath starts with an absolute M and continues as one relative `l` run of exact
 * integer-tenth steps, so the points drawn are identical — lib/guilloche.test.ts decodes
 * both and compares every one — at about half the bytes.
 *
 * SEEDED FROM THE CHAIN. `certificateSeed(196, escrow, id)` names a grant uniquely and
 * anyone can recompute it, so the engraving on a certificate is evidence, not decoration:
 * the same grant always draws the same pattern. A specimen re-seeds from the form, so it
 * visibly changes as the grant is filled in.
 *
 * Pure and memoised by every argument. Safe on the server and in the browser.
 */

export type GuillochePaths = {
  /** Five phase-shifted sine waves along all four sides. */
  waves: string;
  /** Three nested hypotrochoids around (rx, ry). */
  rosette: string;
  /** A knot at each corner. */
  corners: string;
};

/** The two certificates' geometry, as the design files draw them. */
export const LANDSCAPE = {W: 760, H: 468, rx: 552, ry: 190, rr: 150} as const;
export const PORTRAIT = {W: 350, H: 520, rx: 175, ry: 262, rr: 118} as const;

/** The seal's scalloped edge at its two sizes: sealEdge(c, R, a, N). */
export const SEAL_EDGE = {
  118: [59, 54, 2.2, 30],
  96: [48, 44, 1.8, 26],
} as const satisfies Record<number, readonly [number, number, number, number]>;

/**
 * THE SEED OF A REAL CERTIFICATE: the chain, the escrow and the grant. Lowercased, so a
 * checksummed and a plain address draw the same pattern. `extra` is for a specimen, which
 * is seeded from the form rather than from a grant that does not exist yet.
 */
export function certificateSeed(chainId: number, escrow: string, grantId: number, extra?: string): string {
  return `${chainId}|${escrow.toLowerCase()}|${grantId}` + (extra ? `|${extra}` : "");
}

/** FNV-1a over UTF-16 code units, as the design file hashes its seed text. Never 0. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/** xorshift32, returning [0, 1). The design file's generator, bit for bit. */
export function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function gcd(a: number, b: number): number {
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** A coordinate exactly as the design rounds it, in integer units of 1/scale. */
const snap = (n: number, dp: 1 | 2): number => {
  const scale = dp === 1 ? 10 : 100;
  return Math.round(Number(n.toFixed(dp)) * scale);
};

/** An integer count of 1/scale as the shortest SVG number: 12, 1.5, .5, -.25. */
function num(t: number, scale: 10 | 100): string {
  const negative = t < 0;
  const a = Math.abs(t);
  const whole = Math.floor(a / scale);
  const part = a - whole * scale;
  let s: string;
  if (part === 0) {
    s = String(whole);
  } else {
    const digits = String(part).padStart(scale === 10 ? 1 : 2, "0").replace(/0+$/, "");
    s = `${whole === 0 ? "" : whole}.${digits}`;
  }
  return negative ? `-${s}` : s;
}

/** A separator before a number, unless its minus sign already is one. */
const sep = (s: string): string => (s.startsWith("-") ? s : ` ${s}`);

/**
 * One subpath from snapped points (flat [x0, y0, x1, y1, …]): an absolute M, then one
 * relative `l` run. Every step is an exact integer difference, so decoding it lands on the
 * same points the design's absolute path names.
 */
function encode(points: number[], scale: 10 | 100, close: boolean): string {
  if (points.length < 2) return "";
  let out = `M${num(points[0]!, scale)}${sep(num(points[1]!, scale))}`;
  if (points.length > 2) {
    out += "l";
    for (let i = 2; i < points.length; i += 2) {
      const dx = num(points[i]! - points[i - 2]!, scale);
      const dy = num(points[i + 1]! - points[i - 1]!, scale);
      out += (i === 2 ? dx : sep(dx)) + sep(dy);
    }
  }
  return close ? `${out}Z` : out;
}

/** Bounded memo: a specimen re-seeds on every keystroke, and a server renders many grants. */
function memo<V>(limit: number) {
  const cache = new Map<string, V>();
  return (key: string, make: () => V): V => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = make();
    cache.set(key, value);
    if (cache.size > limit) cache.delete(cache.keys().next().value as string);
    return value;
  };
}

const patterns = memo<GuillochePaths>(48);
const edges = memo<string>(8);

/**
 * The engraving for one certificate. `compact` picks the portrait geometry; left out, it
 * follows the width (under 400 is portrait), as the design files do.
 */
export function guilloche(
  seed: string,
  W: number,
  H: number,
  rx: number,
  ry: number,
  rr: number,
  compact: boolean = W < 400,
): GuillochePaths {
  const key = `${seed}\u0000${W}|${H}|${rx}|${ry}|${rr}|${compact ? 1 : 0}`;
  return patterns(key, () => draw(seed, W, H, rx, ry, rr, compact));
}

function draw(
  seed: string,
  W: number,
  H: number,
  rx: number,
  ry: number,
  rr: number,
  compact: boolean,
): GuillochePaths {
  const rnd = rng(hashSeed(seed));
  const mid = compact ? 24 : 27;
  const amp = compact ? 8 : 10;
  const lam = compact ? 22 + Math.floor(rnd() * 10) : 24 + Math.floor(rnd() * 12);

  // THE BORDER: five waves, each drawn along all four sides in the order the design does.
  const waves: string[] = [];
  for (let k = 0; k < 5; k++) {
    const ph = (k * 2 * Math.PI) / 5 + rnd() * 0.25;
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    const d: number[] = [];
    for (let x = mid; x <= W - mid + 0.01; x += 3) {
      const s = amp * Math.sin((2 * Math.PI * x) / lam + ph);
      a.push(snap(x, 1), snap(mid + s, 1));
      b.push(snap(x, 1), snap(H - mid - s, 1));
    }
    for (let y = mid; y <= H - mid + 0.01; y += 3) {
      const s = amp * Math.sin((2 * Math.PI * y) / lam + ph);
      c.push(snap(mid + s, 1), snap(y, 1));
      d.push(snap(W - mid - s, 1), snap(y, 1));
    }
    waves.push(encode(a, 10, false), encode(b, 10, false), encode(c, 10, false), encode(d, 10, false));
  }

  // THE ROSETTE: one of six gear pairs, three nested loops of it.
  const pairs = [
    [96, 36],
    [90, 35],
    [105, 42],
    [96, 40],
    [112, 42],
    [84, 36],
  ] as const;
  const [R, r] = pairs[Math.floor(rnd() * pairs.length)]!;
  const loops = r / gcd(R, r);
  const rosette: string[] = [];
  for (const m of [1, 0.74, 0.5]) {
    const dd = r * (0.9 + rnd() * 0.45) * m + 4;
    const sc = rr / (R - r + dd);
    const steps = 420 * loops;
    const p: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI * loops;
      const X = (R - r) * Math.cos(t) + dd * Math.cos(((R - r) / r) * t);
      const Y = (R - r) * Math.sin(t) - dd * Math.sin(((R - r) / r) * t);
      p.push(snap(rx + X * sc, 1), snap(ry + Y * sc, 1));
    }
    rosette.push(encode(p, 10, true));
  }

  // THE CORNERS: a small knot centred where the border waves meet.
  const k1 = compact ? 6 : 7;
  const k2 = compact ? 5 : 6;
  const corners: string[] = [];
  const centres = [
    [mid, mid],
    [W - mid, mid],
    [mid, H - mid],
    [W - mid, H - mid],
  ] as const;
  for (const [cx, cy] of centres) {
    const p: number[] = [];
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * 4 * Math.PI;
      const X = k1 * Math.cos(t) + k2 * Math.cos(3.5 * t);
      const Y = k1 * Math.sin(t) - k2 * Math.sin(3.5 * t);
      p.push(snap(cx + X, 1), snap(cy + Y, 1));
    }
    corners.push(encode(p, 10, true));
  }

  return {waves: waves.join(" "), rosette: rosette.join(" "), corners: corners.join(" ")};
}

/**
 * The seal's scalloped edge: a circle of radius R around (c, c) with N scallops of depth a,
 * at 0.01, as the design draws it. Memoised by every argument.
 */
export function sealEdge(c: number, R: number, a: number, N: number): string {
  return edges(`${c}|${R}|${a}|${N}`, () => {
    const p: number[] = [];
    for (let i = 0; i <= 360; i++) {
      const t = (i / 360) * 2 * Math.PI;
      const rad = R + a * Math.sin(N * t);
      p.push(snap(c + rad * Math.cos(t), 2), snap(c + rad * Math.sin(t), 2));
    }
    return encode(p, 100, true);
  });
}
