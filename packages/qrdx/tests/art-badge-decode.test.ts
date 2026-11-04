/** biome-ignore-all lint/style/noMagicNumbers: test matrix */
// Logo QR "badge" must decode in small codes too, where the plate used to
// cover more codewords than a block repairs (version 2–3 codes stopped
// scanning above strength 0.8, and version 1–3 codes at L and M at any
// strength). Every sample logo, versions 1–6, every level, two payloads per
// version (shortest and longest that land on it, so the data differs) and
// strengths 0.6–1, decoded with jsQR:
// - as rendered at 8 and 16 px per module;
// - through the phone-camera model at 4, 6 and 9 px per module, each at
//   exactly that scale. This is stricter than the quality gate (which also
//   passes a size when 0.9× and 1.1× read): it is what keeps the plate's
//   error correction margin honest (see BADGE_EC_SAFETY in src/art.tsx).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createQRArtImage } from "../src/art";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { parseSvgMarkup } from "../src/utils/svg-geometry";
import type { ErrorLevel, QRArtImage, QRProps } from "../types";
import { renderSvg } from "./support/qr";
import { decodeQR, rasterizeSvg, simulateCamera } from "./support/raster";

const FIXTURES = new URL("./fixtures/art/", import.meta.url);
const LOGOS = ["bloom", "cafe", "summit", "wave", "leaf", "monogram"];
const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const STRENGTHS = [0.6, 0.7, 0.8, 0.9, 1];
const MARGIN = 4;
const TEXT = `https://qrdx.dev/q/${"abcdefghijklmnopqrstuvwxyz0123456789".repeat(4)}`;

/**
 * Fail today with or without a plate (the version 1-L code draws none): the
 * finder eyes take the logo's color and read wrong at 6 px per module
 * through the camera model. With `matchEyes: false` they decode. Tracked
 * here (level:payload length:logo) so the matrix stays strict; fixing it
 * makes the `it.fails` below fail until the entry is removed.
 */
// (The wave entries went once the test rasterizer honoured the logo's
// clip-path, as browsers do: unclipped, wave read as a different color.)
const KNOWN_EYE_COLOR = new Set(["L:15:bloom"]);

const images = new Map<string, QRArtImage>();
function logo(name: string): QRArtImage {
  let image = images.get(name);
  if (!image) {
    const svg = readFileSync(new URL(`${name}.svg`, FIXTURES), "utf8");
    image = createQRArtImage(
      rasterizeSvg(svg, { width: 640, background: null }),
      { maxSize: 160 }
    );
    images.set(name, image);
  }
  return image;
}

/** Shortest and longest prefixes of TEXT that encode at exactly `version`-`level`. */
function payloads(version: number, level: ErrorLevel): string[] {
  const fits: number[] = [];
  for (let n = 1; n <= TEXT.length; n++) {
    const qr = qrcodegen.QrCode.encodeText(
      TEXT.slice(0, n),
      ERROR_LEVEL_MAP[level]
    );
    if (
      qr.version === version &&
      qr.errorCorrectionLevel === ERROR_LEVEL_MAP[level]
    ) {
      fits.push(n);
    }
  }
  const lengths = [...new Set([fits[0], fits.at(-1)])] as number[];
  return lengths.map((n) => TEXT.slice(0, n));
}

const propsFor = (
  value: string,
  level: ErrorLevel,
  name: string,
  intensity: number
): QRProps => ({
  value,
  size: 512,
  level,
  margin: MARGIN,
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
  art: { mode: "logo", variant: "badge", image: logo(name), intensity },
});

const results = new Map<string, string | null>();

/** The first way `props` fails to decode, or null. Same markup, same answer. */
function failure(props: QRProps, version: number): string | null {
  const svg = renderSvg(props);
  const cached = results.get(svg);
  if (cached !== undefined) return cached;
  const root = parseSvgMarkup(svg);
  if (!root) throw new Error("render is not SVG");
  const modules = version * 4 + 17 + 2 * MARGIN;
  const reads = (modulePx: number, camera: boolean) => {
    const width = Math.round(modules * modulePx);
    const image = rasterizeSvg(root, { width, pad: Math.round(4 * modulePx) });
    const seen = camera ? simulateCamera(image, width / modules) : image;
    return decodeQR(seen) === props.value;
  };
  let result: string | null = null;
  for (const px of [8, 16]) {
    if (!(result || reads(px, false))) result = `as rendered at ${px} px`;
  }
  for (const px of [4, 6, 9]) {
    if (!(result || reads(px, true))) result = `through the camera at ${px} px`;
  }
  results.set(svg, result);
  return result;
}

const CASES: [number, ErrorLevel, string][] = [];
for (let version = 1; version <= 6; version++) {
  for (const level of LEVELS) {
    for (const value of payloads(version, level)) {
      CASES.push([version, level, value]);
    }
  }
}

describe("Logo QR badge decodes in small codes", () => {
  it("covers versions 1–6 at every level with two payloads each", () => {
    expect(CASES).toHaveLength(48);
  });

  it.each(CASES)("version %i-%s: %s", (version, level, value) => {
    const failed: string[] = [];
    for (const name of LOGOS) {
      if (KNOWN_EYE_COLOR.has(`${level}:${value.length}:${name}`)) continue;
      for (const intensity of STRENGTHS) {
        const why = failure(propsFor(value, level, name, intensity), version);
        if (why) failed.push(`${name} @ ${intensity}: ${why}`);
      }
    }
    expect(failed).toEqual([]);
  });

  it.fails.each([...KNOWN_EYE_COLOR])(
    "known: %s (logo-colored eyes)",
    (key) => {
      const [level, length, name] = key.split(":") as [
        ErrorLevel,
        string,
        string,
      ];
      const value = TEXT.slice(0, Number(length));
      const version = qrcodegen.QrCode.encodeText(
        value,
        ERROR_LEVEL_MAP[level]
      ).version;
      for (const intensity of STRENGTHS) {
        expect(
          failure(propsFor(value, level, name, intensity), version)
        ).toBeNull();
      }
    }
  );
});
