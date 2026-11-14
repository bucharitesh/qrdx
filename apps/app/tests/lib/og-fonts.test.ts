// The Geist files server images use (@repo/design-system/og): read from the
// app's folder at run time, and shipped by next.config's file tracing.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadOgFonts } from "@repo/design-system/og/brand";
import {
  OG_FONT_GLOB,
  OG_FONTS_DIR,
  ogFontPath,
} from "@repo/design-system/og/font-files";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("OG image fonts", () => {
  it("load from the app's folder", async () => {
    const fonts = await loadOgFonts();
    expect(fonts?.map(({ name, weight }) => [name, weight])).toEqual([
      ["Geist", 400],
      ["Geist", 600],
    ]);
    expect(ogFontPath("Geist-Bold.ttf")).toBe(
      join(process.cwd(), OG_FONTS_DIR, "Geist-Bold.ttf"),
    );
  });

  it("are all .ttf files in the traced folder", () => {
    expect(OG_FONT_GLOB).toBe(`${OG_FONTS_DIR}/*.ttf`);
    expect(
      readdirSync(join(process.cwd(), OG_FONTS_DIR))
        .filter((file) => file.endsWith(".ttf"))
        .sort(),
    ).toEqual(["Geist-Bold.ttf", "Geist-Regular.ttf", "Geist-SemiBold.ttf"]);
  });

  describe("next.config.ts", () => {
    let includes: Record<string, string[]> | undefined;

    beforeAll(async () => {
      vi.resetModules();
      // createMDX() rewrites .source/*.ts in the background when it runs
      // (see tests/lib/csp.test.ts); the tracing setting doesn't need it.
      vi.doMock("fumadocs-mdx/next", () => ({
        createMDX: () => (config: unknown) => config,
      }));
      const config = (await import("@/next.config")).default;
      includes = config.outputFileTracingIncludes;
    }, 60_000);

    it("ships the fonts with every function", () => {
      expect(includes?.["/**"]).toContain(OG_FONT_GLOB);
    });
  });
});
