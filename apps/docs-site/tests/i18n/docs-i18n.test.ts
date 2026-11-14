// Docs in other languages: URLs, files, search-engine rules and search
// tokenizers (lib/i18n/docs*.ts).
import { describe, expect, it } from "vitest";
import {
  DOCS_LOCALES,
  docsEnglishRewrites,
  docsLocaleFromSegment,
  docsMarkdownRewrites,
  docsUrl,
  englishDocsPath,
  englishFile,
  translatedFile,
  translationLocale,
} from "@/lib/i18n/docs";
import { localizedMeta, localizedPages } from "@/lib/i18n/docs-meta";
import {
  docsSearchLanguages,
  segmenterTokenizer,
} from "@/lib/i18n/docs-search";
import {
  docsLanguageAlternates,
  docsPageSeo,
  docsSitemapEntries,
} from "@/lib/i18n/docs-seo";
import type { ReviewTable } from "@/lib/i18n/review";
import { baseUrl } from "@/lib/metadata";

const abs = (path: string) => new URL(path, baseUrl).toString();

const MACHINE = {
  es: "machine",
  "pt-BR": "machine",
  fr: "machine",
  de: "machine",
  it: "machine",
  ja: "machine",
  ko: "machine",
  "zh-Hans": "machine",
  id: "machine",
  hi: "machine",
} satisfies ReviewTable;
const ES_REVIEWED: ReviewTable = { ...MACHINE, es: "reviewed" };
const ONE_PAGE: ReviewTable = { ...MACHINE, ja: ["/docs/help"] };

describe("docs languages", () => {
  it("are English and every site language", () => {
    expect(DOCS_LOCALES).toEqual([
      "en",
      "es",
      "pt-BR",
      "fr",
      "de",
      "it",
      "ja",
      "ko",
      "zh-Hans",
      "id",
      "hi",
    ]);
    expect(docsLocaleFromSegment("pt-br")).toBe("pt-BR");
    expect(docsLocaleFromSegment("zh-hans")).toBe("zh-Hans");
    expect(docsLocaleFromSegment("fr")).toBe("fr");
    expect(docsLocaleFromSegment("hi")).toBe("hi");
    // Something that isn't a language.
    expect(docsLocaleFromSegment("docs")).toBeUndefined();
    expect(docsLocaleFromSegment("xx")).toBeUndefined();
  });

  it("have URLs under their segment; English keeps /docs", () => {
    expect(docsUrl([], "en")).toBe("/docs");
    expect(docsUrl(["developers", "mcp"], "en")).toBe("/docs/developers/mcp");
    expect(docsUrl([], "ja")).toBe("/ja/docs");
    expect(docsUrl(["help"], "pt-BR")).toBe("/pt-br/docs/help");
    expect(englishDocsPath("/zh-hans/docs/help")).toBe("/docs/help");
    expect(englishDocsPath("/es/docs")).toBe("/docs");
    expect(englishDocsPath("/docs/help")).toBe("/docs/help");
    expect(englishDocsPath("/ko/docs/help")).toBe("/docs/help");
    expect(englishDocsPath("/xx/docs/help")).toBe("/xx/docs/help");
  });

  it("name translation files after the English one", () => {
    expect(translatedFile("help/index.mdx", "ja")).toBe("help/index.ja.mdx");
    expect(translatedFile("help/meta.json", "pt-BR")).toBe(
      "help/meta.pt-BR.json",
    );
    expect(translationLocale("help/index.zh-Hans.mdx")).toBe("zh-Hans");
    expect(translationLocale("help/index.mdx")).toBeUndefined();
    expect(translationLocale("help/meta.id.json")).toBe("id");
    // Not a docs language: not a translation file.
    expect(translationLocale("help/index.xx.mdx")).toBeUndefined();
    expect(englishFile("a/b.es.mdx")).toBe("a/b.mdx");
  });

  it("rewrite English docs to [lang]=en, but not their Markdown versions", () => {
    const [root, pages] = docsEnglishRewrites();
    expect(root).toEqual({ source: "/docs", destination: "/en/docs" });
    expect(pages?.destination).toBe("/en/docs/:path");
    const pattern = /^(?!.*\.mdx?$).+$/;
    expect(pattern.test("developers/mcp")).toBe(true);
    expect(pattern.test("developers/mcp.md")).toBe(false);
    expect(pattern.test("developers/mcp.mdx")).toBe(false);
    expect(docsMarkdownRewrites()[2]).toEqual({
      source: "/:lang(es|pt-br|fr|de|it|ja|ko|zh-hans|id|hi)/docs/:path*.md",
      destination: "/docs-md/:lang/:path*",
    });
  });
});

describe("docs search-engine rules", () => {
  const slugs = ["help"];
  const all = ["en", "es", "ja"] as const;

  it("keep machine translations out of the index, hreflang and the sitemap", () => {
    const seo = docsPageSeo({
      slugs,
      locale: "es",
      translated: all,
      review: MACHINE,
    });
    expect(seo.canonical).toBe(abs("/es/docs/help"));
    expect(seo.robots).toEqual({ index: false, follow: true });
    expect(seo.languages).toBeUndefined();
    expect(docsLanguageAlternates(slugs, all, MACHINE)).toBeUndefined();
    const english = docsPageSeo({
      slugs,
      locale: "en",
      translated: all,
      review: MACHINE,
    });
    expect(english.robots).toBeUndefined();
    expect(english.languages).toBeUndefined();
    expect(docsSitemapEntries(slugs, all, { priority: 0.5 }, MACHINE)).toEqual([
      { priority: 0.5, url: abs("/docs/help") },
    ]);
  });

  it("open reviewed translations: indexed, in hreflang and the sitemap", () => {
    const seo = docsPageSeo({
      slugs,
      locale: "es",
      translated: all,
      review: ES_REVIEWED,
    });
    expect(seo.robots).toBeUndefined();
    expect(seo.languages).toEqual({
      en: abs("/docs/help"),
      es: abs("/es/docs/help"),
      "x-default": abs("/docs/help"),
    });
    expect(seo.alternateOgLocales).toEqual(["en_US"]);
    const entries = docsSitemapEntries(
      slugs,
      all,
      { priority: 0.5 },
      ES_REVIEWED,
    );
    expect(entries.map((entry) => entry.url)).toEqual([
      abs("/docs/help"),
      abs("/es/docs/help"),
    ]);
    expect(entries[1]?.priority).toBe(0.45);
    // The Japanese page is still machine-made: no alternate points at it.
    expect(JSON.stringify(entries)).not.toContain("/ja/");
  });

  it("open single reviewed pages from a list of paths", () => {
    expect(
      docsPageSeo({ slugs, locale: "ja", translated: all, review: ONE_PAGE })
        .robots,
    ).toBeUndefined();
    expect(
      docsPageSeo({
        slugs: ["teams"],
        locale: "ja",
        translated: all,
        review: ONE_PAGE,
      }).robots,
    ).toEqual({ index: false, follow: true });
  });

  it("never index an untranslated page: canonical to English", () => {
    const seo = docsPageSeo({
      slugs,
      locale: "pt-BR",
      translated: all,
      review: { ...MACHINE, "pt-BR": "reviewed" },
    });
    expect(seo.fallback).toBe(true);
    expect(seo.canonical).toBe(abs("/docs/help"));
    expect(seo.robots).toEqual({ index: false, follow: true });
    expect(seo.languages).toBeUndefined();
  });
});

describe("docs search tokenizers", () => {
  it("cover every docs language", () => {
    expect(Object.keys(docsSearchLanguages()).sort()).toEqual(
      [...DOCS_LOCALES].sort(),
    );
  });

  it("split Korean on spaces and keep Hangul words whole", () => {
    const ko = segmenterTokenizer("ko");
    expect(ko.tokenize("동적 QR 코드의 링크 변경")).toEqual([
      "동적",
      "qr",
      "코드의",
      "링크",
      "변경",
    ]);
  });

  it("split Japanese into words, whatever the width of Latin letters", () => {
    const ja = segmenterTokenizer("ja");
    const words = ja.tokenize("動的ＱＲコードのリンクを変更する");
    expect(words).toContain("qr");
    expect(words).toContain("動的");
    expect(words.join("")).toBe("動的qrコードのリンクを変更する");
  });

  it("split Simplified Chinese into words", () => {
    const zh = segmenterTokenizer("zh-Hans");
    const words = zh.tokenize("更改动态二维码的链接");
    expect(words.length).toBeGreaterThan(2);
    expect(words.join("")).toBe("更改动态二维码的链接");
    // Mixed text keeps its Latin words.
    expect(zh.tokenize("使用 REST API 创建")).toEqual(
      expect.arrayContaining(["rest", "api"]),
    );
  });
});

describe("docs sidebar in other languages", () => {
  const translated = [
    "index",
    "---Primeros pasos---",
    "first",
    "second",
    "---Más ayuda---",
    "contact",
    "[Registro de cambios](/changelogs)",
  ];

  it("keeps the English pages and order, with the translated labels", () => {
    const english = [
      "index",
      "---Getting started---",
      "first",
      "new-page",
      "second",
      "---Agencies---",
      "agency-page",
      "---More help---",
      "contact",
      "[Changelog](/changelogs)",
    ];
    expect(localizedPages(english, translated)).toEqual([
      "index",
      "---Primeros pasos---",
      "first",
      "new-page",
      "second",
      // A new separator stays English until the folder is translated again.
      "---Agencies---",
      "agency-page",
      "---Más ayuda---",
      "contact",
      "[Registro de cambios](/changelogs)",
    ]);
  });

  it("matches a separator by the page before it when the page after it moved", () => {
    const english = ["first", "---More help---", "inserted", "contact"];
    expect(
      localizedPages(english, ["first", "---Más ayuda---", "contact"]),
    ).toEqual(["first", "---Más ayuda---", "inserted", "contact"]);
  });

  it("uses each label once, even one that reads like the English", () => {
    const english = ["---REST API---", "a", "---New---", "b"];
    expect(localizedPages(english, ["---REST API---", "a", "b"])).toEqual(
      english,
    );
  });

  it("takes title and description from the translation, the rest from English", () => {
    const meta = localizedMeta(
      { title: "Help", icon: "LifeBuoy", root: true, pages: ["a", "b"] },
      { title: "Ayuda", icon: "Old", root: false, pages: ["a"] },
    );
    expect(meta).toEqual({
      title: "Ayuda",
      icon: "LifeBuoy",
      root: true,
      pages: ["a", "b"],
    });
  });
});
