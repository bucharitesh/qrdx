// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// New body patterns, alone and with every eye, under every condition.
import { describe, expect, it } from "vitest";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { conditions, NEW_BODIES, PLAIN, unreadable } from "./support/catalog";

describe("new body patterns", () => {
  describe.each(NEW_BODIES)("%s", (bodyPattern) => {
    it.each(CORNER_EYE_PATTERNS)("decodes with %s eyes", (cornerEyePattern) => {
      expect(unreadable({ bodyPattern, cornerEyePattern })).toEqual([]);
    });

    it.each(
      conditions({ bodyPattern, ...{ cornerEyePattern: "gear" } })
    )("decodes (default eyes): %s", (_label, check) => {
      expect(check()).toBe(true);
    });

    it.each(
      conditions({
        ...PLAIN,
        bodyPattern,
      })
    )("decodes (square eyes): %s", (_label, check) => {
      expect(check()).toBe(true);
    });
  });
});
