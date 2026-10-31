// Round trip for every eye dot × eye shape (square body, so only the finder
// patterns vary). Finder patterns must keep their 1:1:3:1:1 dark/light
// proportions (ISO/IEC 18004 §6.3.3) closely enough for decoders to lock on.
import { describe, expect, it } from "vitest";
import { CORNER_EYE_DOT_PATTERNS } from "../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { knownUnreadable } from "./support/known-issues";
import { capture, PHONE_MODULE_SIZES } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

const combos = CORNER_EYE_DOT_PATTERNS.flatMap((dot) =>
  CORNER_EYE_PATTERNS.map((eye) => [dot, eye] as const)
);

describe("every eye dot × eye shape decodes", () => {
  for (const [cornerEyeDotPattern, cornerEyePattern] of combos) {
    // Known renderer bugs run as expected failures (see support/known-issues).
    const test = knownUnreadable.dotEye(cornerEyeDotPattern, cornerEyePattern)
      ? it.fails
      : it;
    test(`${cornerEyeDotPattern} dot in ${cornerEyePattern} eyes`, () => {
      const unreadable = PHONE_MODULE_SIZES.filter(
        (modulePx) =>
          capture(
            {
              value: VALUE,
              level: "M",
              size: 256,
              bodyPattern: "square",
              cornerEyePattern,
              cornerEyeDotPattern,
            },
            { modulePx }
          ) !== VALUE
      );
      expect(unreadable, "pixels per module that failed to decode").toEqual([]);
    });
  }
});
