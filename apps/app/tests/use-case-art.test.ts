// The home page's use-case illustrations (public/images/use-cases/*.svg,
// written by scripts/use-case-art/generate.ts) each carry a real QR code.
// Every baked code, in both themes, must scan as the data its card promises.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useCaseImages } from "@/components/mockups/visuals";
import { USE_CASE_ART_IDS, USE_CASE_CODES } from "@/scripts/use-case-art/codes";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../packages/qrdx/tests/support/raster";

const PUBLIC = join(import.meta.dirname, "../public");
const THEMES = ["light", "dark"] as const;

/** The code symbol baked into an illustration, as a flat black-on-white SVG. */
function bakedCode(file: string) {
  const svg = readFileSync(join(PUBLIC, "images/use-cases", file), "utf8");
  const match = svg.match(
    /<symbol id="code" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/,
  );
  if (!match) throw new Error(`${file} has no #code symbol`);
  const [, viewBox = "", inner = ""] = match;
  const [, , width, height] = viewBox.split(" ");
  const flat = inner
    .replace(/class="q[123]"/g, 'fill="#000000"')
    .replace(/class="qp"/g, 'fill="#ffffff"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${flat}</svg>`;
}

describe("use-case illustrations", () => {
  it.each(USE_CASE_ART_IDS.flatMap((id) => THEMES.map((theme) => [id, theme])))(
    "%s (%s) carries a code that decodes to its data",
    (id, theme) => {
      const image = rasterizeSvg(bakedCode(`${id}-${theme}.svg`), {
        width: 480,
        pad: 24,
      });
      expect(decodeQR(simulateCamera(image, 4))).toBe(
        USE_CASE_CODES[id as keyof typeof USE_CASE_CODES].value,
      );
    },
  );

  it("every card image points at an illustration that exists", () => {
    for (const image of Object.values(useCaseImages)) {
      for (const src of [image.src, image.darkSrc]) {
        expect(src).toMatch(/^\/images\/use-cases\/.+\.svg$/);
        expect(existsSync(join(PUBLIC, src ?? ""))).toBe(true);
      }
    }
  });
});
