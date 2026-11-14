// The docs' recorded page dates (lib/seo-file-dates.json, written by
// `bun run --filter docs seo:dates`): what a build from a shallow clone dates
// each page by when git can't. Keyed by path from this app, like the keys
// lib/zone-manifest.ts looks up ("content/docs/<page>.mdx").
import { existsSync } from "node:fs";
import { join } from "node:path";
import { translationLocale } from "@repo/i18n/docs";
import { describe, expect, it } from "vitest";
import recorded from "@/lib/seo-file-dates.json";

const APP = join(import.meta.dirname, "../..");
const entries = Object.entries(recorded as Record<string, string>);

describe("recorded docs page dates", () => {
  it("cover the docs", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(recorded).toHaveProperty(["content/docs/index.mdx"]);
  });

  it.each(entries)(
    "%s is an English page here, with a real past date",
    (file, date) => {
      expect(file).toMatch(/^content\/docs\/.+\.mdx$/);
      expect(translationLocale(file)).toBeUndefined();
      expect(existsSync(join(APP, file))).toBe(true);
      const time = Date.parse(date);
      expect(Number.isNaN(time)).toBe(false);
      expect(time).toBeLessThanOrEqual(Date.now());
    },
  );
});
