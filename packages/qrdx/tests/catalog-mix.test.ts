// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// Three-way combinations and moduleScale.
import { describe, expect, it } from "vitest";
import type { QRProps } from "../types";
import { CORNER_EYE_DOT_PATTERNS } from "../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { BODY_PATTERN } from "../types/image-pattern";
import { qrPropsSchema } from "../types/qr";
import {
  INVERTED,
  PLAIN,
  unreadable,
  VALUE,
  WEAK_BODIES,
  WEAK_DOTS,
} from "./support/catalog";
import { knownUnreadable } from "./support/known-issues";
import { PHONE_MODULE_SIZES, renderSvg } from "./support/qr";

describe("mixed combinations", () => {
  // A spread of three-way combinations (every body, eye and dot appears),
  // skipping the partners that fail on their own.
  // small-square (0.71-module squares) is also too thin for some old eyes
  // and dots, so it sits out the three-way mix too.
  const bodies = BODY_PATTERN.filter(
    (body) => !(WEAK_BODIES.has(body) || body === "small-square")
  );
  const dots = CORNER_EYE_DOT_PATTERNS.filter((dot) => !WEAK_DOTS.has(dot));
  // Circle and curly eyes are flagged as risky by scan-score itself; they
  // stay in the pairwise matrices above but not in the three-way mix.
  const knownPair = (body: string, eye: string, dot: string) =>
    eye === "circle" ||
    eye === "curly" ||
    knownUnreadable.bodyEye(body, eye) ||
    knownUnreadable.dotEye(dot, eye);
  const all: [string, string, string][] = bodies.map((body, i) => [
    body,
    CORNER_EYE_PATTERNS[(i * 5) % CORNER_EYE_PATTERNS.length] as string,
    dots[(i * 7) % dots.length] as string,
  ]);
  for (const [i, eye] of CORNER_EYE_PATTERNS.entries()) {
    all.push([
      bodies[(i * 3 + 1) % bodies.length] as string,
      eye,
      dots[(i * 11 + 2) % dots.length] as string,
    ]);
  }
  for (const [i, dot] of dots.entries()) {
    all.push([
      bodies[(i * 5 + 3) % bodies.length] as string,
      CORNER_EYE_PATTERNS[(i * 7 + 4) % CORNER_EYE_PATTERNS.length] as string,
      dot,
    ]);
  }
  const combos = all.filter(([body, eye, dot]) => !knownPair(body, eye, dot));

  it.each(
    combos
  )("%s body, %s eyes, %s dots", (bodyPattern, cornerEyePattern, cornerEyeDotPattern) => {
    expect(
      unreadable({
        bodyPattern: bodyPattern as QRProps["bodyPattern"],
        cornerEyePattern: cornerEyePattern as QRProps["cornerEyePattern"],
        cornerEyeDotPattern:
          cornerEyeDotPattern as QRProps["cornerEyeDotPattern"],
      })
    ).toEqual([]);
  });
});

describe("moduleScale", () => {
  it("leaves the output unchanged at 1 and when unset", () => {
    for (const bodyPattern of BODY_PATTERN) {
      const base = renderSvg({ value: VALUE, size: 256, bodyPattern });
      expect(
        renderSvg({ value: VALUE, size: 256, bodyPattern, moduleScale: 1 })
      ).toBe(base);
    }
  });

  // Each pattern stops shrinking at the smallest size that still scans
  it.each(
    BODY_PATTERN.filter((body) => !WEAK_BODIES.has(body))
  )("%s still decodes at the smallest moduleScale", (bodyPattern) => {
    expect(unreadable({ ...PLAIN, bodyPattern, moduleScale: 0.5 })).toEqual([]);
    expect(unreadable({ bodyPattern, moduleScale: 0.5 })).toEqual([]);
    expect(
      unreadable(
        { ...PLAIN, ...INVERTED, bodyPattern, moduleScale: 0.5 },
        PHONE_MODULE_SIZES,
        INVERTED.bgColor
      )
    ).toEqual([]);
  });

  it("shrinks modules but keeps alignment patterns full size", () => {
    const full = renderSvg({ value: VALUE, size: 256, bodyPattern: "star" });
    const small = renderSvg({
      value: VALUE,
      size: 256,
      bodyPattern: "star",
      moduleScale: 0.6,
    });
    expect(small).not.toBe(full);
    const alignment = (svg: string) =>
      /<path d="([^"]+)"><\/path><\/g>/.exec(svg)?.[1];
    expect(alignment(small)).toBe(alignment(full));
  });

  it("is validated by the schema (0.5 to 1)", () => {
    expect(
      qrPropsSchema.safeParse({ value: "x", moduleScale: 0.5 }).success
    ).toBe(true);
    expect(
      qrPropsSchema.safeParse({ value: "x", moduleScale: 0.4 }).success
    ).toBe(false);
    expect(
      qrPropsSchema.safeParse({ value: "x", moduleScale: 1.2 }).success
    ).toBe(false);
  });
});
