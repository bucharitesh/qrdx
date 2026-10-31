// Round trip renderer → pixels → jsQR for every body pattern × eye shape.
// A styled code must still be a QR code (ISO/IEC 18004): any combination a
// user can pick has to decode at normal phone distances. The camera model
// (contrast loss + ¼-module blur) mirrors scan-score's, so these results match
// what the product's own scan check reports. Patterns come from the exported
// enums, so new patterns are covered automatically.
import { describe, expect, it } from "vitest";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { BODY_PATTERN } from "../types/image-pattern";
import { knownUnreadable } from "./support/known-issues";
import { capture, PHONE_MODULE_SIZES } from "./support/qr";

// Version 3 (29 modules) at M: has an alignment pattern, like most URLs.
const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

const combos = BODY_PATTERN.flatMap((body) =>
  CORNER_EYE_PATTERNS.map((eye) => [body, eye] as const)
);

describe("every body pattern × eye shape decodes", () => {
  for (const [bodyPattern, cornerEyePattern] of combos) {
    // Known renderer bugs run as expected failures (see support/known-issues).
    const test = knownUnreadable.bodyEye(bodyPattern, cornerEyePattern)
      ? it.fails
      : it;
    test(`${bodyPattern} body with ${cornerEyePattern} eyes`, () => {
      const unreadable = PHONE_MODULE_SIZES.filter(
        (modulePx) =>
          capture(
            {
              value: VALUE,
              level: "M",
              size: 256,
              bodyPattern,
              cornerEyePattern,
            },
            { modulePx }
          ) !== VALUE
      );
      expect(unreadable, "pixels per module that failed to decode").toEqual([]);
    });
  }
});
