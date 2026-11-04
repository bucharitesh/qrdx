/** biome-ignore-all lint/style/noMagicNumbers: versions, levels and sizes under test */
// Center logos against each Reed–Solomon block's repair capacity
// (logo-budget.ts, on codeword-map.ts). getQRData caps a logo (size plus
// clear space) at 60% of the worst block's capacity, the scan score's logo
// check uses the same count, and every capped logo decodes: versions 1–6 ×
// L/M/Q/H × logo sizes, through the camera model at three phone distances.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getLogoSizeLimit, getQRData } from "../src/helpers";
import { getLogoBlockDamage } from "../src/logo-budget";
import { getScanScore } from "../src/scan-score";
import type { ErrorLevel, QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { capture, PHONE_MODULE_SIZES } from "./support/qr";
import { createImage, toPng } from "./support/raster";

const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const VERSIONS = [1, 2, 3, 4, 5, 6];
const SIZES = [0.1, 0.15, 0.2, 0.25, 0.3];

/** The longest text that encodes at exactly `version` and `level` (no boost). */
function valueFor(version: number, level: ErrorLevel): string {
  let best = "";
  for (let length = 1; length < 200; length++) {
    // Lowercase letters keep byte mode, as URLs are
    const value = "qrdx.dev/scan-me-".repeat(12).slice(0, length);
    const qr = qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]);
    if (qr.version > version) break;
    if (
      qr.version === version &&
      qr.errorCorrectionLevel === ERROR_LEVEL_MAP[level]
    ) {
      best = value;
    }
  }
  return best;
}

let LOGO = "";
beforeAll(async () => {
  const png = await toPng(createImage(32, 32, "#7a7a7a"));
  LOGO = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
});

function logoProps(
  value: string,
  level: ErrorLevel,
  size: number,
  padding = 0
): QRProps {
  return {
    ...getQRData({
      value,
      size: 256,
      margin: 4,
      level,
      logo: LOGO,
      logoOptions: { size, padding },
    }),
    level,
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  };
}

const CASES = VERSIONS.flatMap((version) =>
  LEVELS.map((level) => ({ version, level, value: valueFor(version, level) }))
).filter((c) => c.value);

describe("the per-block count", () => {
  it("finds a URL for every version 1–6 at every level", () => {
    expect(CASES).toHaveLength(VERSIONS.length * LEVELS.length);
  });

  it("catches what area misses: H version 2 with a 9×9 cleared area", () => {
    const value = valueFor(2, "H");
    const n = 25;
    // 9 modules wide in a 25 + 8 module artwork of 1024 px
    const width = (9 * 1024) / (n + 8);
    const damage = getLogoBlockDamage(
      { value, size: 1024, margin: 4, level: "H" },
      { src: "", width, height: width, excavate: true }
    );
    expect(damage?.version).toBe(2);
    expect(damage?.worst).toBeGreaterThan(damage?.correctable ?? 0);
  });
});

describe("getQRData caps every logo to the budget", () => {
  for (const { version, level, value } of CASES) {
    it(`version ${version}-${level}: each size fits and decodes`, () => {
      const misses: string[] = [];
      for (const size of SIZES) {
        for (const padding of [0, 1]) {
          const props = logoProps(value, level, size, padding);
          if (props.imageSettings) {
            const damage = getLogoBlockDamage(
              { value, size: 256, margin: 4, level },
              props.imageSettings
            );
            expect(damage && damage.worst <= damage.budget).toBe(true);
          }
          for (const modulePx of PHONE_MODULE_SIZES) {
            if (capture(props, { modulePx }) !== value) {
              misses.push(`${size} pad ${padding} at ${modulePx}px`);
            }
          }
        }
      }
      expect(misses).toEqual([]);
    });
  }

  it("keeps a logo that fits exactly as asked", () => {
    const value = valueFor(6, "H");
    expect(logoProps(value, "H", 0.2).imageSettings?.width).toBeCloseTo(51.2);
  });

  it("reports the largest size the slider may offer", () => {
    const small = getLogoSizeLimit({
      value: valueFor(2, "L"),
      level: "L",
      margin: 4,
    });
    const big = getLogoSizeLimit({
      value: valueFor(6, "H"),
      level: "H",
      margin: 4,
    });
    expect(small).toBeLessThan(big);
    expect(big).toBeLessThanOrEqual(0.3);
    // The cap and the size limit agree
    const capped = logoProps(valueFor(2, "L"), "L", 0.3).imageSettings;
    expect((capped?.width ?? 0) / 256).toBeCloseTo(small, 2);
  });
});

describe("the scan score counts per block", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("passes a capped logo and fails one past a block's capacity", async () => {
    const value = valueFor(2, "H");
    const capped = await getScanScore(logoProps(value, "H", 0.3));
    expect(capped.checks.find((c) => c.id === "logo")?.passed).toBe(true);
    // Raw imageSettings are never capped: a 7-module cleared area at H v2
    // (9 would reach the format information beside the eyes)
    const width = (7 * 256) / (25 + 8);
    const raw = await getScanScore({
      value,
      size: 256,
      margin: 4,
      level: "H",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      imageSettings: { src: LOGO, width, height: width, excavate: true },
    });
    const logo = raw.checks.find((c) => c.id === "logo");
    expect(logo?.passed).toBe(false);
    expect(logo?.message).toMatch(/codewords/);
  });
});
