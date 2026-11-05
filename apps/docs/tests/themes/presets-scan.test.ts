// Every built-in theme must scan: contrast floors, a real render decoded by
// jsQR through the camera model at 160 and 320 px (each gradient stop), a
// longer URL at 320 px, and a scan score of at least 75. The same judge picks
// the library in scripts/themes/generate.ts. Shuffle's runtime themes come
// from the same building blocks, so a fixed sample of seeds is judged too.
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
  GRADIENT_FRAME_DEFAULTS,
  getContrastRatio,
  mixFrameColors,
} from "qrdx";
import type { ColorConfig } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { FRAME_CATALOG } from "@/lib/pattern-catalog";
import { CATEGORY_ORDER } from "@/lib/themes/categories";
import { isInverted } from "@/lib/themes/color";
import { FRAME_TEXT_CONTRAST } from "@/lib/themes/compose";
import { shuffleId, shuffleSeed, shuffleTheme } from "@/lib/themes/shuffle";
import { defaultPresets } from "@/utils/qr-presets";
import { judgeTheme } from "../../scripts/themes/judge";

const entries = Object.entries(defaultPresets);

/** Frame styles that set their label on the code's background. */
const LABEL_ON_BACKGROUND = new Set<string>(
  FRAME_CATALOG.filter((frame) => frame.textOnLight).map(
    (frame) => frame.value,
  ),
);

const firstStop = (color: ColorConfig | undefined) =>
  !color || typeof color === "string"
    ? color
    : color.type === "solid"
      ? color.color
      : color.type === "image"
        ? color.underlay
        : color.stops[0]?.color;

describe("built-in themes pass the hard filters", () => {
  for (const [id, preset] of entries) {
    it(`${preset.label ?? id} (${id})`, async () => {
      const verdict = await judgeTheme(preset.styles, { editorScore: false });
      expect(verdict.reasons, `${id} fails`).toEqual([]);
    });
  }
});

const colorKind = (color: ColorConfig | undefined) =>
  !color || typeof color === "string" ? "solid" : color.type;

describe("the built-in library covers the editor's options", () => {
  const styles = entries.map(([, preset]) => preset.styles);
  const used = (pick: (s: (typeof styles)[number]) => unknown) =>
    new Set(styles.map(pick).filter(Boolean));

  it("uses every body pattern", () => {
    const bodies = used((s) => s.bodyPattern);
    for (const pattern of BODY_PATTERN)
      expect(bodies, pattern).toContain(pattern);
  });

  it("uses every offered eye except circle, which only lenient apps read", () => {
    const eyes = used((s) => s.cornerEyePattern);
    for (const pattern of CORNER_EYE_PATTERNS) {
      if (pattern === "circle") continue;
      expect(eyes, pattern).toContain(pattern);
    }
  });

  it("uses every offered eye centre", () => {
    const dots = used((s) => s.cornerEyeDotPattern);
    for (const pattern of CORNER_EYE_DOT_PATTERNS) {
      expect(dots, pattern).toContain(pattern);
    }
  });

  it("uses every frame style", () => {
    const frames = used((s) => s.frame?.style);
    for (const style of FRAME_STYLES) {
      if (style === "none") continue;
      expect(frames, style).toContain(style);
    }
  });

  it("mixes solid, linear and radial color, accents, a border and the logo", () => {
    const kinds = used((s) => colorKind(s.fgColor));
    for (const kind of ["solid", "linear", "radial"]) {
      expect(kinds, kind).toContain(kind);
    }
    const accented = styles.filter(
      (s) =>
        JSON.stringify(s.dotColor ?? s.fgColor) !== JSON.stringify(s.fgColor),
    );
    expect(accented.length).toBeGreaterThanOrEqual(20);
    // The other border templates draw the code under half the artwork's
    // width and score below Great, so only this one is a theme.
    expect(used((s) => s.templateId)).toContain("SquareBorder");
    expect(styles.filter((s) => s.showLogo).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the built-in library", () => {
  it("names, files and tags every theme", () => {
    const labels = new Set<string>();
    for (const [id, preset] of entries) {
      expect(preset.label, id).toBeTruthy();
      expect(preset.label, id).not.toMatch(/\d/);
      expect(
        labels.has(preset.label as string),
        `duplicate ${preset.label}`,
      ).toBe(false);
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

  it("draws every frame label in a color that reads on what it sits on", () => {
    // Some frame styles set the label on the code's own background (the
    // pattern catalog's textOnLight: border, rounded-border, focus, phone,
    // gradient-border, menu-card), in textColor or else the frame color; the
    // rest set it on the frame, in textColor or else white. The contrast bar
    // is the theme generator's (lib/themes/compose.ts). A textColor equal to
    // the background hid three border labels and the Bistro Menu card's.
    const unreadable: string[] = [];
    for (const [id, preset] of entries) {
      const { frame, bgColor } = preset.styles;
      if (!frame || frame.style === "custom") continue;
      if (!(frame.text || frame.secondaryText)) continue;
      const onBackground = LABEL_ON_BACKGROUND.has(frame.style);
      // Each style's default label color (packages/qrdx/src/frame-styles.ts).
      const label =
        frame.textColor ||
        (frame.style === "gradient-border"
          ? mixFrameColors(
              frame.color || GRADIENT_FRAME_DEFAULTS.from,
              frame.secondaryColor || GRADIENT_FRAME_DEFAULTS.to,
              0.5,
            )
          : onBackground
            ? frame.color
            : "#FFFFFF");
      const backdrop = onBackground ? firstStop(bgColor) : frame.color;
      if (!(label && backdrop)) continue;
      const ratio = getContrastRatio(label, backdrop);
      if (ratio < FRAME_TEXT_CONTRAST) {
        unreadable.push(
          `${id}: ${frame.style} label ${label} on ${backdrop} (${ratio.toFixed(2)}:1)`,
        );
      }
    }
    expect(unreadable).toEqual([]);
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
