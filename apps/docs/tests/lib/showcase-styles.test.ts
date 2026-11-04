// Marketing QR codes (lib/landing/showcase-styles.ts): every showcase style,
// and every code a marketing section draws, must grade "ok" or "great" with
// the engine's scan score, the bar the editor shows. Runs the real
// getScanScore (camera blur, contrast loss, jsQR at three sizes) on the
// engine's test canvas.
import { readFileSync } from "node:fs";
import {
  createQRArtImage,
  decodePNGPixels,
  getScanScore,
  getStylePairRisk,
} from "qrdx";
import {
  BODY_PATTERN,
  pickableCornerEyeDotPatternSchema,
  pickableCornerEyePatternSchema,
  type QRArtImage,
  type QRProps,
} from "qrdx/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLUGIN_CODES } from "@/app/(home)/plugins/mock-codes";
import { HOME_CODES } from "@/components/sections/home/demos/codes";
import {
  SHOWCASE_PLACEMENTS,
  SHOWCASE_STYLE_NAMES,
  SHOWCASE_STYLES,
  type ShowcaseStyleName,
  showcaseProps,
} from "@/lib/landing/showcase-styles";
import { installFakeDom } from "../../../../packages/qrdx/tests/support/fake-dom";

const VALUE = "https://qrdx.dev/m/studio";

// The art samples as loadQRArtImage samples them in the browser (160 × 160),
// saved as PNG: public/images/art-samples/logos/wave.svg and
// photos/portrait.webp. Regenerate them if those samples change.
const ART_FIXTURES: Record<string, string> = {
  "/images/art-samples/logos/wave.svg": "wave.png",
  "/images/art-samples/photos/portrait.webp": "portrait.png",
};

async function artImage(src: string): Promise<QRArtImage> {
  const file = ART_FIXTURES[src];
  if (!file) throw new Error(`No fixture for art sample ${src}`);
  const bytes = readFileSync(
    new URL(`./fixtures/showcase-art/${file}`, import.meta.url),
  );
  const pixels = await decodePNGPixels(new Uint8Array(bytes));
  if (!pixels) throw new Error(`Could not decode ${file}`);
  return createQRArtImage(pixels);
}

async function styleProps(name: ShowcaseStyleName): Promise<QRProps> {
  const { art } = SHOWCASE_STYLES[name];
  return showcaseProps(name, {
    value: VALUE,
    size: 160,
    artImage: art ? await artImage(art.src) : undefined,
  });
}

async function expectScans(label: string, props: QRProps) {
  const { score, grade, checks } = await getScanScore(props);
  const failed = checks.filter((check) => !check.passed).map((c) => c.id);
  expect(["great", "ok"], `${label}: ${score} ${grade} [${failed}]`).toContain(
    grade,
  );
}

/** Showcase styles whose centre and eye warn in sharp renders only. */
const SHARP_RENDER_WARNINGS = new Set<string>(["dots"]);

describe("showcase styles", () => {
  it.each(SHOWCASE_STYLE_NAMES)(
    "%s uses offered shapes and no weak pair",
    (name) => {
      const style = SHOWCASE_STYLES[name];
      expect(BODY_PATTERN).toContain(style.bodyPattern);
      expect(
        pickableCornerEyePatternSchema.safeParse(style.cornerEyePattern)
          .success,
      ).toBe(true);
      expect(
        pickableCornerEyeDotPatternSchema.safeParse(style.cornerEyeDotPattern)
          .success,
      ).toBe(true);
      const risk = getStylePairRisk(style);
      // Sharp-render warnings (one strict decoder, screens and sharp prints)
      // are listed so a new one shows up here; they await a phone check.
      if (SHARP_RENDER_WARNINGS.has(name)) {
        expect(risk?.kind).toBe("sharp-dot-eye");
      } else {
        expect(risk).toBeNull();
      }
    },
  );

  it("places a different style next to each other, none more than twice", () => {
    const placements = Object.entries(SHOWCASE_PLACEMENTS);
    const page = (key: string) => key.split(".")[0];
    for (const [index, [key, style]] of placements.entries()) {
      expect(SHOWCASE_STYLE_NAMES).toContain(style);
      const previous = placements[index - 1];
      if (previous && page(previous[0]) === page(key)) {
        expect(style, `${previous[0]} and ${key}`).not.toBe(previous[1]);
      }
    }
    const uses = new Map<string, number>();
    for (const [, style] of placements) {
      uses.set(style, (uses.get(style) ?? 0) + 1);
    }
    for (const [style, count] of uses) {
      expect(count, style).toBeLessThanOrEqual(2);
    }
  });
});

describe("marketing codes scan", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it.each(SHOWCASE_STYLE_NAMES)("the %s style", async (name) => {
    await expectScans(name, await styleProps(name));
  });

  it.each(Object.entries(HOME_CODES))("home: %s", async (name, props) => {
    await expectScans(name, props);
  });

  const pluginCodes = Object.entries(PLUGIN_CODES).flatMap(([name, codes]) =>
    Array.isArray(codes)
      ? codes.map((props, index) => [`${name}[${index}]`, props] as const)
      : [[name, codes] as const],
  );

  it.each(pluginCodes)("plugins: %s", async (name, props) => {
    expect(getStylePairRisk(props), name).toBeNull();
    await expectScans(name, props);
  });
});
