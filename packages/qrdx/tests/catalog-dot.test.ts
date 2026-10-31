// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// New eye dots in every eye, under every condition.
import { describe, expect, it } from "vitest";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { conditions, NEW_DOTS, PLAIN, unreadable } from "./support/catalog";

describe("new eye dots", () => {
  describe.each(NEW_DOTS)("%s", (cornerEyeDotPattern) => {
    it.each(CORNER_EYE_PATTERNS)("decodes in %s eyes", (cornerEyePattern) => {
      expect(
        unreadable({
          bodyPattern: "square",
          cornerEyePattern,
          cornerEyeDotPattern,
        })
      ).toEqual([]);
    });

    it.each(
      conditions({ ...PLAIN, cornerEyeDotPattern })
    )("decodes: %s", (_label, check) => {
      expect(check()).toBe(true);
    });
  });
});
