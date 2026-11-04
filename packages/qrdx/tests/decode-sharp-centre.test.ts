// Circle eye centres in sharp renders (no camera blur), as screens, PNG
// exports and high-resolution prints deliver them. jsQR misses a circle
// centre inside square-cornered eyes at some sizes (zbar reads them all);
// the camera-model tests (decode-eye-dot) blur the effect away. These tests
// pin the measurements behind WEAK_SHARP_DOT_EYES and keep getStylePairRisk
// in step with them: if a renderer change makes a pair read, its test fails
// until the table entry is removed.
import { describe, expect, it } from "vitest";
import {
  getStylePairRisk,
  SHARP_DOT_EYE_SAFE_BODIES,
  WEAK_SHARP_DOT_EYES,
} from "../src/scan-risk";
import {
  CORNER_EYE_PATTERNS,
  type CornerEyePattern,
} from "../types/corner-eye";
import type { BodyPattern } from "../types/image-pattern";
import { capture } from "./support/qr";

const VALUES = [
  "https://qrdx.dev/?ref=research",
  "https://qrdx.dev/q/Ab3dE9x?utm=campaign",
  "WIFI:T:WPA;S:Home;P:hunter22;;",
] as const;
/** Pixels per module: small on a phone screen up to a large print */
const SIZES = [4, 6, 9, 14, 20] as const;

function sharpFailures(
  bodyPattern: BodyPattern,
  cornerEyePattern: CornerEyePattern,
  cornerEyeDotPattern: "circle" | "rounded",
  sizes: readonly number[] = SIZES,
  values: readonly string[] = VALUES
): string[] {
  const failed: string[] = [];
  for (const modulePx of sizes) {
    for (const value of values) {
      const decoded = capture(
        {
          value,
          level: "M",
          size: 256,
          bodyPattern,
          cornerEyePattern,
          cornerEyeDotPattern,
        },
        { modulePx, camera: false }
      );
      if (decoded !== value) failed.push(`${modulePx}px ${value}`);
    }
  }
  return failed;
}

describe("circle centres in sharp renders (the research table)", () => {
  // body / eye: each fails jsQR in some of the 15 renders
  const weak: [BodyPattern, CornerEyePattern][] = [
    ["circle", "rounded"],
    ["circle", "extra-rounded"],
    ["circle", "square"],
    ["rounded", "square"],
    ["rounded", "rounded"],
    ["square", "square"],
  ];
  for (const [body, eye] of weak) {
    it(`${body} body, ${eye} eyes, circle centre: misses and warns`, () => {
      expect(sharpFailures(body, eye, "circle").length).toBeGreaterThan(0);
      expect(
        getStylePairRisk({
          bodyPattern: body,
          cornerEyePattern: eye,
          cornerEyeDotPattern: "circle",
        })?.kind
      ).toBe("sharp-dot-eye");
    });
  }

  // Round rings keep the ratio; a rounded centre is a full 3×3 block
  const sound: [BodyPattern, CornerEyePattern, "circle" | "rounded"][] = [
    ["circle", "gear", "circle"],
    ["square", "gear", "circle"],
    ["circle", "octagon", "circle"],
    ["circle", "rounded", "rounded"],
    ["circle", "square", "rounded"],
  ];
  for (const [body, eye, dot] of sound) {
    it(`${body} body, ${eye} eyes, ${dot} centre: reads, no warning`, () => {
      expect(sharpFailures(body, eye, dot)).toEqual([]);
      expect(
        getStylePairRisk({
          bodyPattern: body,
          cornerEyePattern: eye,
          cornerEyeDotPattern: dot,
        })
      ).toBeNull();
    });
  }
});

describe("WEAK_SHARP_DOT_EYES matches the decoder", () => {
  const weakEyes = WEAK_SHARP_DOT_EYES.circle ?? [];

  it("lists every eye but the round ones", () => {
    expect(
      CORNER_EYE_PATTERNS.filter((eye) => !weakEyes.includes(eye))
    ).toEqual(["gear", "circle", "octagon"]);
  });

  // One render each eye was measured to fail (body, px per module, value)
  const KNOWN_MISS: Partial<
    Record<CornerEyePattern, [BodyPattern, number, number]>
  > = {
    square: ["circle", 4, 0],
    rounded: ["circle", 9, 0],
    diya: ["circle", 4, 0],
    "extra-rounded": ["circle", 9, 0],
    message: ["circle", 9, 0],
    pointy: ["circle", 9, 0],
    leaf: ["circle", 4, 0],
    "leaf-reverse": ["circle", 9, 0],
    drop: ["circle", 9, 0],
    bevel: ["circle", 9, 0],
    squircle: ["circle-large", 20, 0],
    cushion: ["circle", 9, 0],
    shield: ["circle", 9, 0],
    petal: ["circle", 9, 0],
  };
  for (const eye of weakEyes) {
    it(`a circle centre in ${eye} eyes misses and warns`, () => {
      const miss = KNOWN_MISS[eye];
      expect(miss, "a measured miss").toBeDefined();
      const [body, modulePx, value] = miss as [BodyPattern, number, number];
      expect(
        sharpFailures(body, eye, "circle", [modulePx], [VALUES[value]])
      ).toHaveLength(1);
      expect(
        getStylePairRisk({
          bodyPattern: body,
          cornerEyePattern: eye,
          cornerEyeDotPattern: "circle",
        })?.kind
      ).toBe("sharp-dot-eye");
    });
  }

  // Bodies listed as safe read every render and get no warning
  for (const [pair, bodies] of Object.entries(SHARP_DOT_EYE_SAFE_BODIES)) {
    const eye = pair.split("/")[1] as CornerEyePattern;
    for (const body of bodies ?? []) {
      it(`${body} body, ${eye} eyes, circle centre reads`, () => {
        expect(sharpFailures(body, eye, "circle", [6, 9, 14])).toEqual([]);
        expect(
          getStylePairRisk({
            bodyPattern: body,
            cornerEyePattern: eye,
            cornerEyeDotPattern: "circle",
          })
        ).toBeNull();
      });
    }
  }
});
