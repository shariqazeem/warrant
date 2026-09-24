/**
 * THE VESTING PRESETS, AND THE STOCKS THE PICKER SHOWS FIRST.
 *
 * Each preset is a length and a cliff in the words a company already uses for grants. Its
 * card names it ("2 years, 6-month cliff") from those same two spans, so the words on the
 * card cannot say something the schedule does not do; `presets.test.ts` holds them together.
 *
 * Relative imports, so the tests resolve without the app's alias.
 */
import {ASSETS, type Asset} from "../../lib/assets";
import {scheduleWords, type Span} from "../../lib/grant-terms";

export type PresetId = "bonus" | "retention" | "standard" | "custom";

export type Preset = {
  id: Exclude<PresetId, "custom">;
  label: string;
  length: Span;
  cliff: Span;
};

export const PRESETS: readonly Preset[] = [
  {id: "bonus", label: "Bonus", length: {value: 6, unit: "months"}, cliff: {value: 0, unit: "months"}},
  {
    id: "retention",
    label: "Retention",
    length: {value: 2, unit: "years"},
    cliff: {value: 6, unit: "months"},
  },
  {id: "standard", label: "Standard", length: {value: 4, unit: "years"}, cliff: {value: 1, unit: "years"}},
];

/** The preset a new form starts on: the standard retention grant. */
export const DEFAULT_PRESET: PresetId = "retention";

/**
 * What Custom starts at: two hours, no cliff. Short enough to watch vest in a live demo,
 * which is what a custom schedule is most often for.
 */
export const CUSTOM_START: {length: Span; cliff: Span} = {
  length: {value: 2, unit: "hours"},
  cliff: {value: 0, unit: "hours"},
};

export function presetById(id: PresetId): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** "2 years, 6-month cliff": what a preset's card says under its name. */
export function presetDetail(p: Pick<Preset, "length" | "cliff">): string {
  return scheduleWords(p.length, p.cliff);
}

/**
 * THE SMALL CURVE ON A PRESET'S CARD, drawn in a 64×30 box: flat until the cliff, a step up
 * to where the line would already be, then straight to the top. That is the contract's own
 * shape — vesting is linear from the start, so at the cliff everything accrued lands at
 * once. `cliffFraction` is the cliff over the length, 0 to 1.
 */
export function curvePath(cliffFraction: number): string {
  const cf = Math.max(0, Math.min(1, Number.isFinite(cliffFraction) ? cliffFraction : 0));
  if (cf === 0) return "M2 27 L62 4";
  const x = (2 + 60 * cf).toFixed(1);
  const y = (27 - 23 * cf).toFixed(1);
  return `M2 27 L${x} 27 L${x} ${y} L62 4`;
}

/**
 * The stocks the picker shows before it is opened. The rest of the fifteen are one press
 * away, searchable; these four are the ones a team asks for first.
 */
export const FEATURED_SYMBOLS = ["SPYx", "QQQx", "NVDAx", "AAPLx"] as const;

/**
 * The chips shown in the closed picker: the featured four, with the chosen stock always
 * among them — in place of the last one when it is not already there.
 */
export function featuredAssets(chosen: string): Asset[] {
  const featured = FEATURED_SYMBOLS.map((s) => ASSETS.find((a) => a.symbol === s)).filter(
    (a): a is Asset => Boolean(a),
  );
  if (featured.some((a) => a.address.toLowerCase() === chosen.toLowerCase())) return featured;
  const picked = ASSETS.find((a) => a.address.toLowerCase() === chosen.toLowerCase());
  return picked ? [...featured.slice(0, featured.length - 1), picked] : featured;
}

/** "S&P 500" for the S&P 500 xStock: every one of them is an xStock, so a chip drops the word. */
export function shortName(asset: Pick<Asset, "name">): string {
  return asset.name.replace(/\s*xStock$/i, "");
}

/** The fifteen, narrowed by what was typed into the picker's search: symbol or name. */
export function searchAssets(query: string): Asset[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...ASSETS];
  return ASSETS.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
}
