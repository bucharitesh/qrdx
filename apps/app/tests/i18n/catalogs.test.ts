// The message catalogs: the checker itself (on small fixtures), then the real
// catalogs against English, the glossary and the honest-copy rules.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import { mergeMessages, pickMessages } from "@repo/i18n/messages";
import { REVIEW } from "@repo/i18n/review";
import { createTranslator } from "next-intl";
import { describe, expect, it, it as test } from "vitest";
import {
  type Catalog,
  checkLocale,
  flatten,
  type ReviewFile,
  sourceHash,
  unflatten,
} from "@/lib/i18n/catalog";
import { icuShape, shapeMismatch } from "@/lib/i18n/icu";
import { siteDescription, siteTitle } from "@/lib/metadata";
import { formatPrice } from "@/lib/pricing";
import en from "@/messages/en.json";

const MESSAGES = path.join(import.meta.dirname, "../../messages");
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T;

describe("ICU shapes", () => {
  it("reads arguments, tags and literal text", () => {
    expect(
      icuShape(
        "Save {n, plural, one {# year} other {# years}} <link>now</link> '{'x'}'",
      ),
    ).toEqual({
      args: ["n"],
      tags: ["link"],
      // Option text counts: its numbers must survive translation too.
      text: "Save  year years now {x}",
    });
  });

  it("catches renamed arguments, lost tags, dropped numbers and bad syntax", () => {
    expect(shapeMismatch("Save {percent}%", "Ahorra {pct} %")).toMatch(
      /arguments/,
    );
    expect(shapeMismatch("Our <link>policy</link>", "Notre politique")).toMatch(
      /tags/,
    );
    expect(shapeMismatch("12 months' notice", "6 mois de préavis")).toMatch(
      /12/,
    );
    expect(shapeMismatch("{n, plural, other {#}", "x")).toMatch(/English/);
    expect(shapeMismatch("Hi {name}", "Hola {name")).not.toBeNull();
    expect(
      shapeMismatch(
        "{d, select, yes {5 domains, } other {}}teams",
        "{d, select, yes {5 dominios, } other {}}equipos",
      ),
    ).toBeNull();
  });
});

describe("checkLocale", () => {
  const english: Catalog = { a: { b: "Hello {name}", c: "Close" } };
  const fresh = (status: "machine" | "reviewed"): ReviewFile => ({
    "a.b": { source: sourceHash("Hello {name}"), status },
    "a.c": { source: sourceHash("Close"), status },
  });
  const check = (
    catalog: Catalog,
    review: ReviewFile,
    state: "machine" | "reviewed" = "machine",
  ) => checkLocale({ locale: "es", english, catalog, review, state });

  it("passes a complete machine translation", () => {
    const report = check(
      { a: { b: "Hola {name}", c: "Cerrar" } },
      fresh("machine"),
    );
    expect(report.errors).toEqual([]);
    expect(report.counts).toMatchObject({ keys: 2, machine: 2 });
  });

  it("fails extra keys and broken arguments, and allows a partial catalog", () => {
    const report = check(
      { a: { b: "Hola {nombre}", d: "x" } },
      fresh("machine"),
    );
    expect(report.errors).toEqual([
      "es: a.b: arguments {name} became {nombre}",
      "es: a.d isn't in English",
    ]);
    // a.c shows in English until it's translated.
    expect(report.warnings).toEqual(["es: a.c is missing (shows in English)"]);
    expect(report.counts.missing).toBe(1);
  });

  it("accepts a hand translation with no review file yet", () => {
    const report = check({ a: { b: "Hola {name}", c: "Cerrar" } }, {});
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(2);
  });

  it("requires a reviewed locale to be complete and recorded", () => {
    expect(check({ a: { b: "Hola {name}" } }, {}, "reviewed").errors).toEqual([
      "es: a.b has no review entry (run i18n:translate --record)",
      "es: a.c is missing (shows in English)",
    ]);
  });

  it("warns on stale strings, and fails them once the locale is reviewed", () => {
    const review = {
      ...fresh("reviewed"),
      "a.c": { source: "old", status: "reviewed" as const },
    };
    const catalog = { a: { b: "Hola {name}", c: "Cerrar" } };
    expect(check(catalog, review).warnings).toHaveLength(1);
    expect(check(catalog, review).errors).toEqual([]);
    expect(check(catalog, review, "reviewed").errors).toEqual([
      "es: a.c is stale (the English changed since it was translated)",
    ]);
  });

  it("fails machine strings in a locale marked reviewed", () => {
    const report = check(
      { a: { b: "Hola {name}", c: "Cerrar" } },
      fresh("machine"),
      "reviewed",
    );
    expect(report.errors).toHaveLength(2);
  });

  it("keeps the English key order when writing a catalog", () => {
    const flat = new Map([
      ["a.c", "Cerrar"],
      ["a.b", "Hola {name}"],
    ]);
    expect(Object.keys((unflatten(flat, english).a as Catalog) ?? {})).toEqual([
      "b",
      "c",
    ]);
  });
});

describe("loading", () => {
  it("falls back to English for a missing or empty string", () => {
    const merged = mergeMessages(en, {
      cta: { title: "Crea tu código", subtext: "" },
    });
    expect(merged.cta.title).toBe("Crea tu código");
    expect(merged.cta.subtext).toBe(en.cta.subtext);
    expect(merged.nav.entries.product).toBe("Product");
  });

  it("sends client components only the parts they read", () => {
    expect(pickMessages(en, ["cta", "home.editor"])).toEqual({
      cta: en.cta,
      home: { editor: en.home.editor },
    });
  });
});

describe("the English catalog", () => {
  it("matches the English root metadata (no second source)", () => {
    expect(en.meta.siteTitle).toBe(siteTitle);
    expect(en.meta.siteDescription).toBe(siteDescription);
  });
});

describe.each(TRANSLATED_LOCALES)("the %s catalog", (locale) => {
  const catalog = read<Catalog>(`${locale}.json`);
  const review = existsSync(path.join(MESSAGES, `review/${locale}.json`))
    ? read<ReviewFile>(`review/${locale}.json`)
    : {};
  const messages = flatten(catalog);
  const glossary = read<{
    fixed: Record<string, Record<string, string>>;
  }>("glossary.json");

  test("has the same arguments, tags and numbers as English", () => {
    const report = checkLocale({
      locale,
      english: en,
      catalog,
      review,
      state: REVIEW[locale],
    });
    expect(report.errors).toEqual([]);
    expect(LOCALE_INFO[locale].review).toBe(REVIEW[locale]);
  });

  test("translates the Free plan's name and keeps Pro and Business", () => {
    const free = glossary.fixed["Free (the plan name)"]?.[locale];
    if (free && messages.has("pricing.plans.free")) {
      expect(messages.get("pricing.plans.free")).toBe(free);
    }
    expect(messages.get("pricing.tiers.pro.cta") ?? "Pro").toContain("Pro");
    expect(messages.get("pricing.tiers.business.cta") ?? "Business").toContain(
      "Business",
    );
  });

  test("keeps product and brand names", () => {
    for (const [key, english] of flatten(en)) {
      // A missing string shows the English, which keeps the names.
      const translation = messages.get(key);
      if (translation === undefined) continue;
      for (const name of ["QRdx", "Never-Hostage", "AGPL-3.0", "GitHub"]) {
        if (english.includes(name)) expect(translation, key).toContain(name);
      }
    }
  });

  test("formats with the page's language, keeping the currency", () => {
    const t = createTranslator({
      locale,
      messages: mergeMessages(en, catalog),
      namespace: "pricing",
    });
    expect(t("cards.switchTo", { plan: "Pro" })).toContain("Pro");
    expect(formatPrice(5, "USD", locale)).toMatch(/\$|US/);
    expect(formatPrice(1499, "INR", locale)).toContain("₹");
  });
});
