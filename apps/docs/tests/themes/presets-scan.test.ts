// Every built-in theme must scan: contrast floors, a real render decoded by
// jsQR through the camera model at 160 and 320 px (each gradient stop), a
// longer URL at 320 px, and a scan score of at least 75. The same judge picks
// the library in scripts/themes/generate.ts. Shuffle's runtime themes come
// from the same building blocks, so a fixed sample of seeds is judged too.
import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER } from "@/lib/themes/categories";
import { isInverted } from "@/lib/themes/color";
import { shuffleId, shuffleSeed, shuffleTheme } from "@/lib/themes/shuffle";
import { defaultPresets } from "@/utils/qr-presets";
import { judgeTheme } from "../../scripts/themes/judge";

const entries = Object.entries(defaultPresets);

describe("built-in themes pass the hard filters", () => {
  for (const [id, preset] of entries) {
    it(`${preset.label ?? id} (${id})`, async () => {
      const verdict = await judgeTheme(preset.styles, { editorScore: false });
      expect(verdict.reasons, `${id} fails`).toEqual([]);
    });
  }
});

describe("the built-in library", () => {
  it("names, files and tags every theme", () => {
    const labels = new Set<string>();
    for (const [id, preset] of entries) {
      expect(preset.label, id).toBeTruthy();
      expect(preset.label, id).not.toMatch(/\d/);
      expect(labels.has(preset.label as string), `duplicate ${preset.label}`).toBe(false);
      labels.add(preset.label as string);
      expect(CATEGORY_ORDER, id).toContain(preset.category);
      expect(preset.tags?.length ?? 0, id).toBeGreaterThanOrEqual(3);
      expect(preset.tags?.length ?? 0, id).toBeLessThanOrEqual(4);
    }
  });

  it("keeps light-on-dark themes to about a tenth, all on the Dark shelf", () => {
    const year = entries.filter(([, preset]) => preset.category !== "seasonal");
    const inverted = year.filter(([, preset]) =>
      isInverted(preset.styles.fgColor, preset.styles.bgColor),
    );
    expect(inverted.length / year.length).toBeLessThanOrEqual(0.12);
    for (const [id, preset] of inverted) {
      expect(preset.category, id).toBe("dark");
    }
  });

  it("gives every industry starter a frame with a call to action", () => {
    const starters = entries.filter(([, p]) => p.category === "industry");
    expect(starters.length).toBeGreaterThanOrEqual(6);
    for (const [id, preset] of starters) {
      expect(preset.styles.frame?.text, id).toBeTruthy();
    }
  });
});

describe("Shuffle", () => {
  // Fixed seeds: the sample is the same on every run.
  const seeds = Array.from({ length: 24 }, (_, i) => (i + 1) * 2_654_435_761);

  it("composes the same theme for the same seed", () => {
    const seed = seeds[3] as number;
    expect(shuffleTheme(seed)).toEqual(shuffleTheme(seed));
    expect(shuffleSeed(shuffleId(seed))).toBe(seed >>> 0);
    expect(shuffleSeed("classic")).toBeNull();
  });

  for (const seed of seeds) {
    it(`seed ${seed >>> 0} scans`, async () => {
      const theme = shuffleTheme(seed >>> 0);
      const verdict = await judgeTheme(theme.styles, { editorScore: false });
      expect(verdict.reasons, theme.name).toEqual([]);
    });
  }
});
