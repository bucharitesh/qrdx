// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// Per-eye colors, gradients, autoLevel, logo padding, transparent backgrounds, export parity and scan-score.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { svgToEPS } from "../src/eps";
import { getQRModuleCount } from "../src/print";
import {
  getStylePairRisk,
  WEAK_BODY_EYES,
  WEAK_DOT_EYES,
} from "../src/scan-risk";
import { getScanScore } from "../src/scan-score";
import { getImageSettings, resolveErrorLevel } from "../src/utils";
import type { QRProps, RadialGradient } from "../types";
import {
  CORNER_EYE_DOT_PATTERNS,
  pickableCornerEyeDotPatternSchema,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
} from "../types/corner-dot";
import {
  CORNER_EYE_PATTERNS,
  pickableCornerEyePatternSchema,
  RETIRED_CORNER_EYE_PATTERNS,
} from "../types/corner-eye";
import { BODY_PATTERN } from "../types/image-pattern";
import { qrPropsSchema } from "../types/qr";
import {
  FRAME_TEXT,
  LOGO,
  NEW_BODIES,
  NEW_DOTS,
  NEW_EYES,
  NEW_FRAMES,
  PLAIN,
  unreadable,
  VALUE,
} from "./support/catalog";
import { installFakeDom } from "./support/fake-dom";
import { knownUnreadable } from "./support/known-issues";
import { capture, renderSvg, symbolSize } from "./support/qr";

describe("per-eye colors", () => {
  const eyeColors = {
    topLeft: { outer: "#dc2626", inner: "#1d4ed8" },
    topRight: { outer: "#16a34a" },
    bottomLeft: { inner: "#9333ea" },
  };

  it("paints each eye with its own outer and inner color", () => {
    const svg = renderSvg({
      value: VALUE,
      size: 256,
      eyeColor: "#111111",
      dotColor: "#222222",
      eyeColors,
    });
    for (const color of [
      "#dc2626",
      "#1d4ed8",
      "#16a34a",
      "#9333ea",
      "#111111",
      "#222222",
    ]) {
      expect(svg).toContain(`fill="${color}"`);
    }
  });

  it("decodes with dark per-eye colors and gradients", () => {
    expect(
      unreadable({
        ...PLAIN,
        eyeColors: {
          ...eyeColors,
          topRight: {
            outer: {
              type: "linear",
              angle: 45,
              stops: [
                { color: "#0f172a", offset: 0 },
                { color: "#4c1d95", offset: 100 },
              ],
            },
          },
        },
      })
    ).toEqual([]);
  });

  it("leaves the output unchanged without overrides", () => {
    const base = renderSvg({ value: VALUE, size: 256, eyeColor: "#123456" });
    expect(
      renderSvg({ value: VALUE, size: 256, eyeColor: "#123456", eyeColors: {} })
    ).toBe(base);
  });
});

describe("gradients", () => {
  const gradient: RadialGradient = {
    type: "radial",
    stops: [
      { color: "#111827", offset: 0 },
      { color: "#1d4ed8", offset: 100 },
    ],
  };

  it("renders identical markup for identical props (hydration-safe ids)", () => {
    const props: QRProps = {
      value: VALUE,
      size: 256,
      fgColor: gradient,
      eyeColor: gradient,
    };
    expect(renderSvg(props)).toBe(renderSvg(props));
    expect(renderSvg(props)).toMatch(/id="fg-color-[0-9a-z]+"/);
  });

  it.each(
    NEW_BODIES
  )("%s decodes with a radial gradient body and eyes", (bodyPattern) => {
    expect(
      unreadable({
        bodyPattern,
        cornerEyePattern: "rounded",
        fgColor: gradient,
        eyeColor: gradient,
      })
    ).toEqual([]);
  });
});

describe("autoLevel and logo padding", () => {
  const logo = (width: number, padding?: number) => ({
    src: LOGO,
    width,
    height: width,
    excavate: true,
    ...(padding !== undefined && { padding }),
  });

  it("is off by default: the requested level is kept", () => {
    expect(
      resolveErrorLevel({
        value: VALUE,
        size: 256,
        level: "L",
        imageSettings: logo(90),
      })
    ).toBe("L");
  });

  it("raises to H when the logo covers more than 7% of the code", () => {
    const props: QRProps = {
      value: VALUE,
      size: 256,
      level: "M",
      autoLevel: true,
      imageSettings: logo(70),
    };
    expect(resolveErrorLevel(props)).toBe("H");
    expect(getQRModuleCount(props)).toBe(symbolSize(VALUE, "H"));
    // The same logo at M does not read at all; raised to H it reads at
    // phone distances (jsQR still misses it at 6 px per module)
    const at = (extra: Partial<QRProps>) =>
      unreadable({ ...props, ...PLAIN, ...extra }, [4, 9]);
    expect(at({ autoLevel: false })).toEqual([4, 9]);
    expect(at({})).toEqual([]);
  });

  it("keeps the level for a small logo", () => {
    expect(
      resolveErrorLevel({
        value: VALUE,
        size: 256,
        level: "M",
        autoLevel: true,
        imageSettings: logo(40),
      })
    ).toBe("M");
  });

  it("clears extra modules around the logo with padding", () => {
    const cells = Array.from({ length: 29 }, () =>
      new Array<boolean>(29).fill(true)
    );
    const plain = getImageSettings(cells, 290, 0, logo(60));
    const padded = getImageSettings(cells, 290, 0, logo(60, 20));
    expect(padded?.excavation?.w).toBeGreaterThan(plain?.excavation?.w ?? 0);
    expect(padded?.excavation?.w).toBe((plain?.excavation?.w ?? 0) + 4);
    expect(
      unreadable({ ...PLAIN, level: "H", imageSettings: logo(50, 8) })
    ).toEqual([]);
  });
});

describe("retired shapes", () => {
  const retired = [
    ...RETIRED_CORNER_EYE_DOT_PATTERNS.map((dot) => ({
      cornerEyeDotPattern: dot,
    })),
    ...RETIRED_CORNER_EYE_PATTERNS.map((eye) => ({ cornerEyePattern: eye })),
  ];

  it("are no longer offered", () => {
    for (const dot of RETIRED_CORNER_EYE_DOT_PATTERNS) {
      expect(CORNER_EYE_DOT_PATTERNS as readonly string[]).not.toContain(dot);
      expect(pickableCornerEyeDotPatternSchema.safeParse(dot).success).toBe(
        false
      );
    }
    for (const eye of RETIRED_CORNER_EYE_PATTERNS) {
      expect(CORNER_EYE_PATTERNS as readonly string[]).not.toContain(eye);
      expect(pickableCornerEyePatternSchema.safeParse(eye).success).toBe(false);
    }
  });

  it.each(retired)("still validate, render and get flagged: %o", (style) => {
    // Saved designs keep loading and drawing exactly as before
    expect(qrPropsSchema.safeParse({ value: VALUE, ...style }).success).toBe(
      true
    );
    const svg = renderSvg({ value: VALUE, size: 256, ...style });
    expect(svg).toContain("<svg");
    expect(getStylePairRisk(style)).not.toBeNull();
  });
});

describe("transparent background", () => {
  it("paints no background and decodes on any light page", () => {
    const svg = renderSvg({
      value: VALUE,
      size: 256,
      ...PLAIN,
      bgColor: "transparent",
    });
    expect(svg).toContain('fill="transparent"');
    for (const page of ["#ffffff", "#fef9c3"]) {
      expect(
        capture(
          { value: VALUE, size: 256, ...PLAIN, bgColor: "transparent" },
          { modulePx: 6, page }
        )
      ).toBe(VALUE);
    }
  });

  it("writes no background fill to EPS", async () => {
    const eps = await svgToEPS(
      renderSvg({ value: VALUE, size: 256, ...PLAIN, bgColor: "transparent" })
    );
    expect(eps).not.toContain("1 1 1 rg");
  });
});

// ── Painter parity and determinism ──────────────────────────────────────────

describe("every new shape exports the same outline everywhere", () => {
  const styles: [string, Partial<QRProps>][] = [
    ...NEW_BODIES.map((bodyPattern): [string, Partial<QRProps>] => [
      `body ${bodyPattern}`,
      { bodyPattern },
    ]),
    ...NEW_EYES.map((cornerEyePattern): [string, Partial<QRProps>] => [
      `eye ${cornerEyePattern}`,
      { cornerEyePattern },
    ]),
    ...NEW_DOTS.map((cornerEyeDotPattern): [string, Partial<QRProps>] => [
      `dot ${cornerEyeDotPattern}`,
      { cornerEyeDotPattern },
    ]),
  ];

  it.each(
    styles
  )("%s uses only painter-supported, deterministic markup", async (_label, style) => {
    const props: QRProps = { value: VALUE, size: 256, ...style };
    const svg = renderSvg(props);
    expect(renderSvg(props)).toBe(svg);
    expect(svg).not.toMatch(
      /<(mask|clipPath|use|pattern|filter)\b|opacity=|NaN|Infinity/
    );
    const eps = await svgToEPS(svg);
    expect(eps).not.toMatch(/NaN|Infinity/);
    // Every painted element (background, modules, 3 eyes, 3 dots) reaches EPS
    const painted = (svg.match(/<(path|rect|circle|polygon)\b/g) ?? []).length;
    const fills =
      (eps.match(/ e?f$/gm) ?? []).length +
      (eps.match(/ e?f grestore$/gm) ?? []).length;
    expect(fills).toBe(painted);
  });
});

describe("scan-score", () => {
  let uninstall: () => void;
  // Score of a plain square code under the same settings
  let reference = 0;
  beforeAll(async () => {
    uninstall = installFakeDom();
    reference = (
      await getScanScore({ value: VALUE, size: 256, margin: 4, ...PLAIN })
    ).score;
  });
  afterAll(() => uninstall());

  it("warns about known-weak eye and dot pairs, with a fix", async () => {
    const result = await getScanScore({
      value: VALUE,
      size: 256,
      margin: 4,
      ...PLAIN,
      cornerEyeDotPattern: "diamond",
    });
    const pair = result.checks.find((check) => check.id === "style-pair");
    expect(pair?.passed).toBe(false);
    expect(pair?.fix).toBeTruthy();
    expect(result.score).toBeLessThan(reference);
  });

  it("flags fragile shapes on their own, and nothing new", () => {
    expect(getStylePairRisk({ cornerEyeDotPattern: "star" })?.kind).toBe("dot");
    expect(getStylePairRisk({ cornerEyePattern: "curly" })?.kind).toBe("eye");
    for (const bodyPattern of NEW_BODIES) {
      expect(getStylePairRisk({ ...PLAIN, bodyPattern })).toBeNull();
    }
    for (const cornerEyePattern of NEW_EYES) {
      expect(getStylePairRisk({ ...PLAIN, cornerEyePattern })).toBeNull();
    }
    for (const cornerEyeDotPattern of NEW_DOTS) {
      expect(getStylePairRisk({ ...PLAIN, cornerEyeDotPattern })).toBeNull();
    }
  });

  it("lists the same weak pairs as the tracked decode failures", () => {
    for (const dot of CORNER_EYE_DOT_PATTERNS) {
      for (const eye of CORNER_EYE_PATTERNS) {
        expect(
          Boolean(WEAK_DOT_EYES[dot]?.includes(eye)),
          `${dot} in ${eye}`
        ).toBe(knownUnreadable.dotEye(dot, eye));
      }
    }
    for (const body of BODY_PATTERN) {
      for (const eye of CORNER_EYE_PATTERNS) {
        expect(
          Boolean(WEAK_BODY_EYES[body]?.includes(eye)),
          `${body} by ${eye}`
        ).toBe(knownUnreadable.bodyEye(body, eye));
      }
    }
  });

  const styles: [string, Partial<QRProps>][] = [
    ...NEW_BODIES.map((bodyPattern): [string, Partial<QRProps>] => [
      `body ${bodyPattern}`,
      { bodyPattern },
    ]),
    ...NEW_EYES.map((cornerEyePattern): [string, Partial<QRProps>] => [
      `eye ${cornerEyePattern}`,
      { ...PLAIN, cornerEyePattern },
    ]),
    ...NEW_DOTS.map((cornerEyeDotPattern): [string, Partial<QRProps>] => [
      `dot ${cornerEyeDotPattern}`,
      { ...PLAIN, cornerEyeDotPattern },
    ]),
    ...NEW_FRAMES.map((style): [string, Partial<QRProps>] => [
      `frame ${style}`,
      { frame: { style, ...FRAME_TEXT } },
    ]),
  ];

  it.each(styles)("%s scores as scannable", async (_label, style) => {
    const result = await getScanScore({
      value: VALUE,
      size: 256,
      margin: 4,
      ...style,
    });
    // 96 px is ~2.6 px per module for this version-3 code: even plain
    // squares miss it, so it is the only check allowed to fail.
    const failed = result.checks
      .filter((check) => !check.passed && check.id !== "decode-96")
      .map((check) => check.id);
    expect(failed).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(reference);
    expect(result.grade).toBe("great");
  });
});
