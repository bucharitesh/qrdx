// The docs loader (lib/source.ts) with the docs' languages
// (lib/i18n/docs.ts): a language without a translation gets the English
// page at its own URL, and a translation's file name is never a page.
import type { Locale } from "@repo/i18n/config";
import { loader } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { docsI18n, docsUrl, translationLocale } from "@/lib/i18n/docs";

describe("the docs loader", () => {
  it("serves the English page where a language has no translation", () => {
    const docs = loader({
      baseUrl: "/docs",
      source: {
        files: [
          { type: "page", path: "guide.mdx", data: { title: "Guide" } },
          { type: "page", path: "guide.es.mdx", data: { title: "Guía" } },
          { type: "page", path: "other.mdx", data: { title: "Other" } },
        ],
      },
      i18n: docsI18n,
      url: (slugs, locale) => docsUrl(slugs, (locale ?? "en") as Locale),
    });
    const guide = docs.getPage(["guide"], "es");
    expect(guide?.data.title).toBe("Guía");
    expect(guide?.url).toBe("/es/docs/guide");
    expect(translationLocale(guide?.path ?? "")).toBe("es");
    const other = docs.getPage(["other"], "es");
    expect(other?.data.title).toBe("Other");
    expect(other?.url).toBe("/es/docs/other");
    expect(translationLocale(other?.path ?? "")).toBeUndefined();
    expect(docs.getPage(["guide"], "en")?.data.title).toBe("Guide");
    expect(docs.getPage(["nope"], "es")).toBeUndefined();
    expect(docs.getPage(["guide.es"], "en")).toBeUndefined();
  });
});
