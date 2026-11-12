// Translated pages: URLs, the review gate (noindex, sitemap, hreflang) in
// both states, the English rewrites and redirects in next.config.ts.

import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCALE_INFO,
  LOCALES,
  localeFromSegment,
  TRANSLATED_LOCALES,
} from "@/lib/i18n/config";
import { alternateLanguages, localizedMetadata } from "@/lib/i18n/metadata";
import {
  isLocalizedPath,
  LOCALIZED_PATHS,
  localizeHref,
  localizePath,
  routeMatcher,
  splitLocale,
} from "@/lib/i18n/paths";
import {
  isPublished,
  publishedLocales,
  REVIEW,
  type ReviewTable,
} from "@/lib/i18n/review";
import {
  englishRedirects,
  englishRewrites,
  rewriteSource,
} from "@/lib/i18n/routing";
import { localizedEntries } from "@/lib/i18n/sitemap";
import { baseUrl } from "@/lib/metadata";

// Next's own copy of the matcher it applies to next.config.ts (no types).
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  pathToRegexp: (
    source: string,
    keys: unknown[],
    options: { strict: boolean },
  ) => RegExp;
};

const abs = (path: string) => new URL(path, baseUrl).toString();
const APP = join(import.meta.dirname, "../../app");

/** Every translation still machine-made (the state this PR ships in). */
const MACHINE = Object.fromEntries(
  TRANSLATED_LOCALES.map((locale) => [locale, "machine"]),
) as ReviewTable;
/** Spanish and Simplified Chinese signed off by a native reviewer. */
const SIGNED_OFF: ReviewTable = {
  ...MACHINE,
  es: "reviewed",
  "zh-Hans": "reviewed",
};

describe("locales", () => {
  // A new language is one entry in LOCALE_CONFIG: these hold for any entry.
  const appDirs = [
    ...readdirSync(join(APP, "(app)")),
    ...readdirSync(join(APP, "(app)", "(home)")),
    ...readdirSync(APP),
  ];

  it("start with English, the source", () => {
    expect(LOCALES[0]).toBe("en");
    expect(LOCALE_INFO.en.review).toBe("reviewed");
  });

  it.each(LOCALES)("%s has a usable definition", (locale) => {
    const info = LOCALE_INFO[locale];
    expect(info.segment).toMatch(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/);
    expect(localeFromSegment(info.segment)).toBe(locale);
    expect(info.hreflang.length).toBeGreaterThan(0);
    expect(info.ogLocale).toMatch(/^[a-z]{2,3}_[A-Z]{2}$/);
    expect(["ltr", "rtl"]).toContain(info.dir);
    expect(info.name.trim()).not.toBe("");
    // Its first URL segment can't shadow a page or route: /p, /q, /docs.
    expect(appDirs).not.toContain(info.segment);
    // The language code is a valid BCP 47 tag the browser knows.
    expect(() => new Intl.Locale(locale)).not.toThrow();
  });

  it("use each URL segment once", () => {
    const segments = LOCALES.map((locale) => LOCALE_INFO[locale].segment);
    expect(new Set(segments).size).toBe(segments.length);
    expect(localeFromSegment("pt-BR")).toBeUndefined();
    expect(localeFromSegment("xx")).toBeUndefined();
  });

  it("have a review state each", () => {
    expect(Object.keys(REVIEW).sort()).toEqual([...TRANSLATED_LOCALES].sort());
  });
});

describe("paths", () => {
  it("prefix translated pages only", () => {
    expect(LOCALIZED_PATHS).toEqual(expect.arrayContaining(["/", "/pricing"]));
    expect(localizePath("/", "es")).toBe("/es");
    expect(localizePath("/pricing", "pt-BR")).toBe("/pt-br/pricing");
    expect(localizePath("/pricing", "zh-Hans")).toBe("/zh-hans/pricing");
    expect(localizePath("/pricing", "en")).toBe("/pricing");
    // The playground is translated; its shared theme links and short
    // links keep one URL in every language.
    expect(localizePath("/playground", "ja")).toBe("/ja/playground");
    for (const path of ["/playground/abc", "/q/abc", "/p/abc", "/m/abc"]) {
      expect(localizePath(path, "ja")).toBe(path);
    }
  });

  it("prefix docs pages in the languages with docs only", () => {
    expect(localizePath("/docs", "ja")).toBe("/ja/docs");
    expect(localizePath("/docs/developers/mcp", "pt-BR")).toBe(
      "/pt-br/docs/developers/mcp",
    );
    expect(localizeHref("/docs/help#faq", "zh-Hans")).toBe(
      "/zh-hans/docs/help#faq",
    );
    // French has no docs: its links go to the English docs.
    expect(localizePath("/docs", "fr")).toBe("/docs");
    expect(localizeHref("/docs/help", "de")).toBe("/docs/help");
    // Not a docs path, only a prefix of one.
    expect(localizePath("/docsearch", "ja")).toBe("/docsearch");
  });

  it("keep queries and hashes, and leave external links alone", () => {
    expect(localizeHref("/pricing?currency=inr#faq", "de")).toBe(
      "/de/pricing?currency=inr#faq",
    );
    expect(localizeHref("https://github.com/bucharitesh/qrdx", "de")).toBe(
      "https://github.com/bucharitesh/qrdx",
    );
    expect(localizeHref("mailto:support@qrdx.dev", "de")).toBe(
      "mailto:support@qrdx.dev",
    );
    expect(localizeHref("//evil.example/pricing", "de")).toBe(
      "//evil.example/pricing",
    );
  });

  it("split a pathname into its language and English path", () => {
    expect(splitLocale("/es/pricing")).toEqual({
      locale: "es",
      path: "/pricing",
    });
    expect(splitLocale("/ja")).toEqual({ locale: "ja", path: "/" });
    expect(splitLocale("/pricing")).toEqual({ locale: "en", path: "/pricing" });
    // Docs pages, in a language with docs; /fr/docs isn't a page.
    expect(splitLocale("/es/docs")).toEqual({ locale: "es", path: "/docs" });
    expect(splitLocale("/zh-hans/docs/help")).toEqual({
      locale: "zh-Hans",
      path: "/docs/help",
    });
    expect(splitLocale("/fr/docs")).toEqual({ locale: "en", path: "/fr/docs" });
    // What an English page prerenders as (usePathname() says /en/pricing
    // there): the same English path as the browser's /pricing.
    expect(splitLocale("/en/pricing")).toEqual({
      locale: "en",
      path: "/pricing",
    });
    expect(splitLocale("/en/q/abc")).toEqual({
      locale: "en",
      path: "/en/q/abc",
    });
    expect(isLocalizedPath("/docs")).toBe(false);
  });
});

describe("review gate, before review (every locale machine-made)", () => {
  it("indexes English only", () => {
    expect(publishedLocales("/pricing", MACHINE)).toEqual(["en"]);
    expect(isPublished("es", "/pricing", MACHINE)).toBe(false);
  });

  it("makes translated pages noindex, self-canonical, with no hreflang", () => {
    const es = localizedMetadata({
      locale: "es",
      path: "/pricing",
      title: "Precios",
      review: MACHINE,
    });
    expect(es.robots).toEqual({ index: false, follow: true });
    expect(es.alternates?.canonical).toBe(abs("/es/pricing"));
    expect(es.alternates?.languages).toBeUndefined();
    expect(es.openGraph?.locale).toBe("es_ES");
  });

  it("keeps the English page indexable and claiming no translations", () => {
    const en = localizedMetadata({
      locale: "en",
      path: "/pricing",
      title: "Pricing",
      review: MACHINE,
    });
    expect(en.robots).toBeUndefined();
    expect(en.alternates?.canonical).toBe(abs("/pricing"));
    expect(en.alternates?.languages).toBeUndefined();
    expect(alternateLanguages("/", MACHINE)).toBeUndefined();
  });

  it("lists only English in the sitemap, without alternates", () => {
    const entries = localizedEntries("/pricing", { priority: 0.9 }, MACHINE);
    expect(entries).toEqual([{ url: abs("/pricing"), priority: 0.9 }]);
  });
});

describe("review gate, after review (one config change)", () => {
  it("indexes the reviewed languages", () => {
    expect(publishedLocales("/pricing", SIGNED_OFF)).toEqual([
      "en",
      "es",
      "zh-Hans",
    ]);
    const es = localizedMetadata({
      locale: "es",
      path: "/pricing",
      title: "Precios",
      review: SIGNED_OFF,
    });
    expect(es.robots).toBeUndefined();
    expect(es.alternates?.canonical).toBe(abs("/es/pricing"));
  });

  it("links every indexable version with hreflang and x-default, never an unreviewed one", () => {
    const languages = {
      en: abs("/pricing"),
      es: abs("/es/pricing"),
      "zh-CN": abs("/zh-hans/pricing"),
      "zh-SG": abs("/zh-hans/pricing"),
      "x-default": abs("/pricing"),
    };
    for (const locale of ["en", "es", "zh-Hans"] as const) {
      const metadata = localizedMetadata({
        locale,
        path: "/pricing",
        title: "x",
        review: SIGNED_OFF,
      });
      expect(metadata.alternates?.languages).toEqual(languages);
    }
    const en = localizedMetadata({
      locale: "en",
      path: "/pricing",
      title: "Pricing",
      review: SIGNED_OFF,
    });
    expect(en.openGraph).toMatchObject({
      locale: "en_US",
      alternateLocale: ["es_ES", "zh_CN"],
    });
    // German is still machine-made: noindex, and no hreflang from it.
    const de = localizedMetadata({
      locale: "de",
      path: "/pricing",
      title: "Preise",
      review: SIGNED_OFF,
    });
    expect(de.robots).toEqual({ index: false, follow: true });
    expect(de.alternates?.languages).toBeUndefined();
  });

  it("puts each reviewed version in the sitemap with every alternate", () => {
    const entries = localizedEntries("/", { priority: 1 }, SIGNED_OFF);
    expect(entries.map((entry) => entry.url)).toEqual([
      abs("/"),
      abs("/es"),
      abs("/zh-hans"),
    ]);
    expect(entries.map((entry) => entry.priority)).toEqual([1, 0.9, 0.9]);
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        en: abs("/"),
        es: abs("/es"),
        "zh-CN": abs("/zh-hans"),
        "zh-SG": abs("/zh-hans"),
        "x-default": abs("/"),
      });
    }
  });

  it("can open single pages of a locale", () => {
    const review: ReviewTable = { ...MACHINE, ja: ["/"] };
    expect(isPublished("ja", "/", review)).toBe(true);
    expect(isPublished("ja", "/pricing", review)).toBe(false);
  });
});

describe("next.config.ts routing", () => {
  const matches = (source: string, path: string) =>
    pathToRegexp(source, [], { strict: true }).test(path);

  it("rewrites English URLs to [lang]=en", () => {
    expect(englishRewrites()).toEqual(
      LOCALIZED_PATHS.map((path) => {
        const source = rewriteSource(path);
        const target = source.replace(/\([^)]*\)/g, "");
        return {
          source,
          destination: target === "/" ? "/en" : `/en${target}`,
        };
      }),
    );
    // Dynamic routes are one rule each, in next.config.ts syntax.
    expect(englishRewrites()).toContainEqual({
      source: "/qr-code-generator/:type([^/.]+)",
      destination: "/en/qr-code-generator/:type",
    });
    for (const rule of englishRewrites()) {
      expect(
        matches(rule.source, "/integrations/slack/link"),
        rule.source,
      ).toBe(false);
    }
  });

  it("matches dynamic segments the way the folders name them", () => {
    expect(rewriteSource("/compare/[slug]")).toBe("/compare/:slug([^/.]+)");
    expect(rewriteSource("/docs/[...slug]")).toBe("/docs/:slug+");
    expect(rewriteSource("/docs/[[...slug]]")).toBe("/docs/:slug*");
    const one = routeMatcher("/compare/[slug]");
    expect(one("/compare/qr-tiger")).toBe(true);
    expect(one("/compare")).toBe(false);
    expect(one("/compare/a/b")).toBe(false);
    expect(one("/compare/logo.svg")).toBe(false);
    const some = routeMatcher("/docs/[...slug]");
    expect(some("/docs/a/b")).toBe(true);
    expect(some("/docs")).toBe(false);
    const any = routeMatcher("/docs/[[...slug]]");
    expect(any("/docs")).toBe(true);
    expect(any("/docs/a/b")).toBe(true);
    expect(any("/docsx")).toBe(false);
    expect(routeMatcher("/pricing")("/pricing/x")).toBe(false);
    // Generator pages are translated; their links follow the language.
    expect(isLocalizedPath("/qr-code-generator/wifi")).toBe(true);
    expect(localizeHref("/qr-codes-on/menus#sizing", "ja")).toBe(
      "/ja/qr-codes-on/menus#sizing",
    );
    expect(splitLocale("/es/qr-code-generator/wifi")).toEqual({
      locale: "es",
      path: "/qr-code-generator/wifi",
    });
    // Short links and app routes never are.
    for (const path of ["/q/abc", "/p/abc", "/m/abc", "/dashboard", "/docs"]) {
      expect(isLocalizedPath(path), path).toBe(false);
    }
  });

  it("redirects /en and /en/... to the unprefixed URL on QRdx hosts only", () => {
    const [home, pages] = englishRedirects("(?:qrdx\\.dev)");
    expect(home).toMatchObject({
      source: "/en",
      destination: "/",
      permanent: true,
    });
    expect(pages?.permanent).toBe(true);
    expect(home?.has).toEqual([{ type: "host", value: "(?:qrdx\\.dev)" }]);
    expect(matches(pages?.source ?? "", "/en/pricing")).toBe(true);
    // The English pages' Open Graph images live under /en/... and stay put.
    expect(
      matches(pages?.source ?? "", "/en/pricing/opengraph-image-whxmcp"),
    ).toBe(false);
    expect(matches(pages?.source ?? "", "/en/pricing/twitter-image")).toBe(
      false,
    );
  });
});
