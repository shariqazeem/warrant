/**
 * THE CERTIFICATE'S TYPE, FOR A SHARE CARD.
 *
 * next/og draws with Satori, which cannot use next/font: without faces handed to it, the
 * card renders in a generic sans and stops looking like the certificate. So the faces are
 * fetched once per process from Google Fonts — asked for as TrueType, which Satori reads
 * (it cannot read WOFF2) — and kept. If the fetch fails the card still renders, in the
 * default face, rather than failing.
 */
type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type OgFont = {name: string; data: ArrayBuffer; weight: Weight; style: "normal" | "italic"};

const FAMILIES = [
  "family=Bodoni+Moda:ital,wght@0,500;0,600;1,400",
  "family=Hanken+Grotesk:wght@400;600",
  "family=JetBrains+Mono:wght@400",
];

/** Google serves TrueType to a client it does not know; a browser's UA would get WOFF2. */
const UA = "Mozilla/5.0 (compatible; warrant-og/1.0)";

let loading: Promise<OgFont[]> | null = null;

async function load(): Promise<OgFont[]> {
  const css = await fetch(`https://fonts.googleapis.com/css2?${FAMILIES.join("&")}&display=swap`, {
    headers: {"User-Agent": UA},
    signal: AbortSignal.timeout(6000),
  }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`fonts ${r.status}`))));

  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);
  const wanted = faces
    .map((f) => {
      const family = /font-family:\s*'([^']+)'/.exec(f)?.[1];
      const style = /font-style:\s*(\w+)/.exec(f)?.[1] === "italic" ? "italic" : "normal";
      const weight = Number(/font-weight:\s*(\d+)/.exec(f)?.[1] ?? 400) as Weight;
      const src = /src:\s*url\(([^)]+)\)\s*format\('(truetype|opentype|woff)'\)/.exec(f);
      return family && src ? {family, style, weight, url: src[1]!} : null;
    })
    .filter((x): x is {family: string; style: "normal" | "italic"; weight: Weight; url: string} => x !== null);

  // Several subsets share a family, weight and style; the Latin one is what a card needs.
  const seen = new Set<string>();
  const unique = wanted.filter((w) => {
    const k = `${w.family}|${w.weight}|${w.style}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return Promise.all(
    unique.map(async (w) => ({
      name: w.family,
      weight: w.weight,
      style: w.style,
      data: await fetch(w.url, {signal: AbortSignal.timeout(6000)}).then((r) => r.arrayBuffer()),
    })),
  );
}

/**
 * A card's ImageResponse options: its size, with the faces when they loaded. Every text a
 * card draws names one of the three families; with faces handed to Satori, a family it does
 * not know falls back to the first face, which is Bodoni.
 */
export async function ogOptions<S extends {width: number; height: number}>(size: S): Promise<S & {fonts?: OgFont[]}> {
  const fonts = await ogFonts();
  return fonts.length > 0 ? {...size, fonts} : {...size};
}

/** The faces, or none: a card never fails because the fonts would not load. */
export async function ogFonts(): Promise<OgFont[]> {
  if (!loading) {
    loading = load().catch(() => {
      loading = null; // try again on the next card
      return [];
    });
  }
  return loading;
}
