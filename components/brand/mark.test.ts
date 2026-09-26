/**
 * THE MARK IS DRAWN FROM ONE PLACE. Its geometry is generated into mark-geometry.ts by
 * ~/projects/warrant-brand/mark.py, and every surface that shows it (the nav, the icons, the
 * share cards and the seal) draws those paths. The old sheet-and-seal drawing was copied into
 * five files in three sizes, one of them still in a colour the palette no longer has.
 */
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {MARK_CHANNEL, MARK_LEVEL, MARK_VESTED, MARK_VESTING, MARK_VIEWBOX} from "./mark-geometry";

const points = (d: string) =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe("the W that vests", () => {
  it("fits its 100 x 100 box", () => {
    expect(MARK_VIEWBOX).toBe("0 0 100 100");
    for (const d of [MARK_VESTED, MARK_VESTING, MARK_LEVEL]) {
      for (const [x, y] of points(d)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("fills its second V only partway, inside the engraved channel", () => {
    const channel = points(MARK_CHANNEL).map(([, y]) => y);
    const level = points(MARK_LEVEL).map(([, y]) => y);
    expect(Math.min(...level)).toBeGreaterThan(Math.min(...channel));
    expect(Math.max(...level)).toBeLessThanOrEqual(Math.max(...channel) + 0.01);
    expect(MARK_VESTING).toContain(MARK_CHANNEL);
  });

  it("is drawn from the geometry wherever it appears, and nowhere by hand", () => {
    const surfaces = [
      "components/brand/warrant-mark.tsx",
      "app/icon.tsx",
      "app/apple-icon.tsx",
      "app/opengraph-image.tsx",
      "components/cert/seal.tsx",
      "components/cert/cert-card.tsx",
    ];
    for (const f of surfaces) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/markPaths\(|MARK_VESTED/);
      expect(src, f).not.toMatch(/M-10 -13 H4|M6 3 H18|M5 3h9|#2b4acb/i);
    }
  });
});
