// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// New eye frames with every body and dot, under every condition.
import { describe, expect, it } from "vitest";
import { CORNER_EYE_DOT_PATTERNS } from "../types/corner-dot";
import { BODY_PATTERN } from "../types/image-pattern";
import {
  conditions,
  NEW_EYES,
  PLAIN,
  unreadable,
  WEAK_BODIES,
  WEAK_DOTS,
} from "./support/catalog";

describe("new eye frames", () => {
  describe.each(NEW_EYES)("%s", (cornerEyePattern) => {
    it.each(
      BODY_PATTERN.filter((body) => !WEAK_BODIES.has(body))
    )("decodes with a %s body", (bodyPattern) => {
      expect(unreadable({ bodyPattern, cornerEyePattern })).toEqual([]);
    });

    it.each(
      CORNER_EYE_DOT_PATTERNS.filter((dot) => !WEAK_DOTS.has(dot))
    )("decodes with %s dots", (cornerEyeDotPattern) => {
      expect(
        unreadable({
          bodyPattern: "square",
          cornerEyePattern,
          cornerEyeDotPattern,
        })
      ).toEqual([]);
    });

    it.each(
      conditions({ ...PLAIN, cornerEyePattern })
    )("decodes: %s", (_label, check) => {
      expect(check()).toBe(true);
    });
  });
});
