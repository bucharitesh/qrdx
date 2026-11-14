// Translations of copy that lives in TypeScript data (lib/i18n/content.ts):
// what gets extracted, how a translation memory is applied, the check, and
// the real sources and memories.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { describe, expect, it, it as test } from "vitest";
import { checkContent, sourceHash } from "@/lib/i18n/catalog";
import {
  contentStrings,
  isCopy,
  overlayContent,
  type TranslationMemory,
} from "@/lib/i18n/content";
import { CONTENT_SOURCES, contentEnglish } from "@/lib/i18n/content-sources";
import { topicForDeployment } from "@/lib/seo-content/availability";
import { INDUSTRY_GROUPS } from "@/lib/seo-content/industries";

const sample = {
  slug: "cafes",
  title: "QR codes for cafés",
  meters: 1.5,
  icon: () => null,
  items: [
    { id: "menu", label: "Table menu", href: "/templates#menu" },
    { id: "wifi", label: "Guest Wi-Fi", href: "https://example.com" },
  ],
  faqs: [{ question: "Is it free?", answer: "Yes, 100%." }],
  code: { example: "WIFI:T:WPA;S:Cafe;;" },
};

const memoryOf = (pairs: [string, string][]): TranslationMemory =>
  Object.fromEntries(
    pairs.map(([source, text]) => [
      sourceHash(source),
      { source, text, status: "machine" as const, context: "" },
    ]),
  );

describe("content strings", () => {
  it("takes copy and leaves identifiers, links, numbers and skipped keys", () => {
    const strings = contentStrings("demo", sample, { skip: ["example"] });
    expect([...strings.keys()]).toEqual([
      "QR codes for cafés",
      "Table menu",
      "Guest Wi-Fi",
      "Is it free?",
      "Yes, 100%.",
    ]);
    // Paths name list items by their id, so they survive reordering.
    expect(strings.get("Guest Wi-Fi")).toBe("demo.items.wifi.label");
    expect(strings.get("Is it free?")).toBe("demo.faqs.0.question");
  });

  it("knows copy from symbols and bare links", () => {
    expect(isCopy("Scan me")).toBe(true);
    expect(isCopy("25 %")).toBe(false);
    expect(isCopy("https://qrdx.dev/pricing")).toBe(false);
    expect(isCopy("/docs")).toBe(false);
    expect(isCopy("See https://qrdx.dev")).toBe(true);
  });

  it("swaps translated strings by their English and keeps the rest", () => {
    const memory = memoryOf([
      ["Table menu", "Menú de mesa"],
      ["Is it free?", "¿Es gratis?"],
    ]);
    const translated = overlayContent(sample, (english) => {
      const entry = memory[sourceHash(english)];
      return entry?.source === english ? entry.text : undefined;
    });
    expect(translated.items[0]?.label).toBe("Menú de mesa");
    expect(translated.items[1]?.label).toBe("Guest Wi-Fi");
    expect(translated.faqs[0]?.question).toBe("¿Es gratis?");
    // Identifiers, numbers, functions and untouched branches stay as they are.
    expect(translated.slug).toBe("cafes");
    expect(translated.meters).toBe(1.5);
    expect(translated.icon).toBe(sample.icon);
    expect(translated.code).toBe(sample.code);
    expect(sample.items[0]?.label).toBe("Table menu");
  });
});

describe("checkContent", () => {
  const english = [
    { english: "Up to 100 rows.", context: "demo.a" },
    { english: "Free", context: "demo.b" },
  ];

  it("passes a memory that keeps every number", () => {
    const report = checkContent({
      locale: "es",
      english,
      memory: memoryOf([
        ["Up to 100 rows.", "Hasta 100 filas."],
        ["Free", "Gratis"],
      ]),
      state: "machine",
    });
    expect(report.errors).toEqual([]);
    expect(report.counts).toMatchObject({ strings: 2, machine: 2, missing: 0 });
  });

  it("fails a dropped number and a mismatched hash", () => {
    const memory = memoryOf([["Up to 100 rows.", "Hasta cien filas."]]);
    memory.bogus = {
      source: "Free",
      text: "Gratis",
      status: "machine",
      context: "demo.b",
    };
    const report = checkContent({
      locale: "es",
      english,
      memory,
      state: "machine",
    });
    expect(report.errors.join("\n")).toMatch(/number 100 is missing/);
    expect(report.errors.join("\n")).toMatch(/doesn't match its English/);
  });

  it("warns about gaps until a language is reviewed, then fails them", () => {
    const memory = memoryOf([["Up to 100 rows.", "Hasta 100 filas."]]);
    const machine = checkContent({
      locale: "es",
      english,
      memory,
      state: "machine",
    });
    expect(machine.errors).toEqual([]);
    expect(machine.counts.missing).toBe(1);
    const reviewed = checkContent({
      locale: "es",
      english,
      memory,
      state: "reviewed",
    });
    expect(reviewed.errors.length).toBeGreaterThan(0);
  });
});

describe("the content sources", () => {
  const strings = contentEnglish();

  it("have unique namespaces and plenty of copy", () => {
    const namespaces = CONTENT_SOURCES.map((source) => source.namespace);
    expect(new Set(namespaces).size).toBe(namespaces.length);
    expect(strings.length).toBeGreaterThan(1000);
    for (const { english } of strings) expect(isCopy(english)).toBe(true);
  });

  it("include the wording a deployment without custom domains renders", () => {
    const english = new Set(strings.map((entry) => entry.english));
    for (const group of INDUSTRY_GROUPS) {
      for (const topic of group.items) {
        const stripped = topicForDeployment(topic, { customDomains: false });
        for (const tip of stripped.tips) expect(english).toContain(tip);
      }
    }
  });
});

describe.each(TRANSLATED_LOCALES)("the %s content memory", (locale) => {
  const file = path.join(
    import.meta.dirname,
    `../../messages/content/${locale}.json`,
  );
  const memory: TranslationMemory = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};

  test("is filed by the hash of each English string, numbers kept", () => {
    const report = checkContent({
      locale,
      english: contentEnglish(),
      memory,
      state: "machine",
    });
    expect(report.errors).toEqual([]);
  });

  test("keeps product and brand names", () => {
    for (const entry of Object.values(memory)) {
      for (const name of ["QRdx", "Never-Hostage", "GitHub"]) {
        if (entry.source.includes(name)) {
          expect(entry.text, entry.context).toContain(name);
        }
      }
    }
  });
});
