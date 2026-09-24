/**
 * THE CARDS' COLOURS ARE THE TOKEN CONTRACT'S COLOURS. A value in two places gets a test
 * that reads both (CLAUDE.md): every named colour here must equal its token in tokens.css.
 */
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {OG} from "./og-theme";

const tokens = readFileSync(join(__dirname, "..", "styles", "tokens.css"), "utf8");
const token = (name: string): string | null => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  return m ? m[1]!.toUpperCase() : null;
};

const PAIRS: Array<[keyof typeof OG, string]> = [
  ["ink", "ink"],
  ["paper", "canvas"],
  ["sheet", "surface"],
  ["muted", "muted"],
  ["line", "rule"],
  ["ok", "settled"],
  ["accent", "vault"],
  ["vault", "vault"],
  ["vaultLine", "vault-line"],
  ["onVault", "on-vault"],
  ["onVault2", "on-vault-2"],
  ["bond", "bond"],
  ["engrave", "engrave"],
  ["mutedBond", "muted-bond"],
  ["seal", "seal"],
  ["foil", "foil"],
];

describe("the share cards' palette", () => {
  for (const [key, name] of PAIRS) {
    it(`${key} is --${name}`, () => {
      expect(token(name), `--${name} missing from tokens.css`).not.toBeNull();
      expect(OG[key].toUpperCase()).toBe(token(name));
    });
  }
});
