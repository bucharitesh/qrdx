// The scene and photo examples on /ai/art (public/images/ai-art-scenes, made
// on the real pipeline by scripts/ai/art-eval.ts): every one is listed, small
// and still scans, through the same check the pipeline delivers by (jsQR as
// drawn and through the phone-camera model), as the WebP that ships.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanQRPixels } from "qrdx";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ART_MODE_EXAMPLES,
  ART_MODE_EXAMPLES_TEXT,
  artModeExampleSrc,
} from "@/components/sections/ai-art/art-mode-examples-data";

const PUBLIC = join(import.meta.dirname, "../../public");
const DIR = join(PUBLIC, "images/ai-art-scenes");

describe("scene and photo examples", () => {
  it("lists every file once, and both modes", () => {
    const files = readdirSync(DIR).sort();
    expect(
      ART_MODE_EXAMPLES.map((example) =>
        artModeExampleSrc(example.id).replace("/images/ai-art-scenes/", ""),
      ).sort(),
    ).toEqual(files);
    const modes = new Set(ART_MODE_EXAMPLES.map((example) => example.mode));
    expect([...modes].sort()).toEqual(["photo", "scene"]);
  });

  it.each(ART_MODE_EXAMPLES.map((example) => [example.id]))(
    "%s is small and scans",
    async (id) => {
      const file = join(PUBLIC, artModeExampleSrc(id));
      expect(statSync(file).size).toBeLessThan(80 * 1024);
      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const scan = await scanQRPixels(
        { width: info.width, height: info.height, data: new Uint8Array(data) },
        ART_MODE_EXAMPLES_TEXT,
      );
      expect(scan.passed).toBe(true);
    },
  );
});
