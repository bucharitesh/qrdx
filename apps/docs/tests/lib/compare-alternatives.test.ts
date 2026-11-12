// The "<competitor> alternatives" lists on the compare pages, and the search
// snippets and FAQ written around them. Each listed tool must have a compare
// page of its own whose facts (name, source, date checked) it repeats, Dub is
// never listed, and the numbers quoted for QRdx come from lib/plans.ts and
// lib/pricing.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/source", () => ({ compareSource: { getPage: () => null } }));

const { qrdxAlternative } = await import(
  "@/components/sections/compare/compare-alternatives"
);
const { PLAN_LIMITS } = await import("@/lib/plans");
const { PRICING } = await import("@/lib/pricing");
const { siteDescription, siteTitle } = await import("@/lib/metadata");
const { MAX_DESCRIPTION, MAX_TITLE } = await import("@/lib/seo-overrides");

const CONTENT = join(import.meta.dirname, "..", "..", "content");
const COMPARE = join(CONTENT, "compare");
const read = (file: string) => readFileSync(join(COMPARE, file), "utf8");
const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, "$1");

const pages = readdirSync(COMPARE)
  .filter((file) => file.endsWith(".mdx"))
  .map((file) => ({ slug: file.replace(/\.mdx$/, ""), text: read(file) }));

const field = (text: string, name: string) => {
  const value = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(text)?.[1];
  return value === undefined ? undefined : unquote(value);
};

/** `sources:` URLs at the top level of a page's frontmatter. */
function sources(text: string): string[] {
  const block = /^sources:\n((?:\s+- .+\n)+)/m.exec(text)?.[1] ?? "";
  return [...block.matchAll(/- (\S+)/g)].map((match) => match[1] as string);
}

interface Tool {
  name: string;
  slug: string;
  bestFor: string;
  freeTier: string;
  paidFrom: string;
  source: string;
  lastVerified: string;
}

/** The `alternatives:` block: its heading and tools, or null without one. */
function alternatives(text: string) {
  const block = /^alternatives:\n((?:(?: {2}.*)?\n)+)/m.exec(text)?.[1];
  if (!block) return null;
  const tools: Partial<Tool>[] = [];
  for (const line of block.split("\n")) {
    const item = /^ {4}- (\w+):\s*(.+)$/.exec(line);
    const prop = /^ {6}(\w+):\s*(.+)$/.exec(line);
    const match = item ?? prop;
    if (item) tools.push({});
    if (match && tools.length > 0) {
      (tools.at(-1) as Record<string, string>)[match[1] as string] = unquote(
        match[2] as string,
      );
    }
  }
  return {
    heading: field(block.replace(/^ {2}/gm, ""), "heading"),
    intro: field(block.replace(/^ {2}/gm, ""), "intro"),
    tools: tools as Tool[],
  };
}

const withList = pages.flatMap(({ slug, text }) => {
  const list = alternatives(text);
  return list ? [{ slug, text, list }] : [];
});

describe("compare page alternatives", () => {
  it("are on the four pages that get impressions", () => {
    expect(withList.map((page) => page.slug).sort()).toEqual([
      "bitly-qr",
      "canva-qr",
      "qr-verse",
      "uniqode",
    ]);
  });

  it("each own a different query", () => {
    const headings = withList.map((page) => page.list.heading);
    expect(new Set(headings).size).toBe(headings.length);
    for (const { list } of withList) {
      expect(list.heading).toMatch(/ alternatives$/);
      // The intro repeats the phrase the page answers.
      expect(list.intro).toContain(list.heading);
    }
  });

  describe.each(withList)("$slug", ({ slug, list }) => {
    it("lists 3 to 5 other tools, each once, never Dub", () => {
      const slugs = list.tools.map((tool) => tool.slug);
      expect(slugs.length).toBeGreaterThanOrEqual(3);
      expect(slugs.length).toBeLessThanOrEqual(5);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(slugs).not.toContain(slug);
      for (const tool of list.tools) {
        expect(`${tool.name} ${tool.slug}`).not.toMatch(/dub/i);
        // QRdx's row comes from the code, not frontmatter.
        expect(tool.name).not.toMatch(/qrdx/i);
      }
    });

    it.each(list.tools.map((tool) => [tool.slug, tool] as const))(
      "%s repeats its own compare page",
      (_, tool) => {
        const own = pages.find((page) => page.slug === tool.slug);
        expect(own, `content/compare/${tool.slug}.mdx`).toBeDefined();
        const text = own?.text ?? "";
        expect(tool.name).toBe(field(text, "competitor"));
        expect(sources(text)).toContain(tool.source);
        expect(tool.lastVerified).toBe(field(text, "lastVerified"));
        for (const key of ["bestFor", "freeTier", "paidFrom"] as const) {
          expect(tool[key], key).toBeTruthy();
        }
      },
    );
  });
});

describe("QRdx's row", () => {
  const { free } = PLAN_LIMITS;
  const row = qrdxAlternative("Anything");

  it("states the Free plan's limits and Pro's price from the code", () => {
    expect(row.freeTier).toContain(`${free.dynamicCodes} dynamic codes`);
    expect(row.freeTier).toContain(`${free.landingPages} hosted pages`);
    expect(row.paidFrom).toBe(
      `Pro $${PRICING.pro.month.amounts.USD}/mo or $${PRICING.pro.year.amounts.USD}/yr`,
    );
  });
});

describe("copy around the lists", () => {
  const { free } = PLAN_LIMITS;
  const mb = free.maxFileBytes / 1024 / 1024;
  const blog = readFileSync(
    join(CONTENT, "blog", "best-free-qr-code-generators-2026.mdx"),
    "utf8",
  );

  it("quotes QRdx's Free plan limits from lib/plans.ts", () => {
    for (const [file, phrases] of Object.entries({
      "uniqode.mdx": [`with logos and ${free.dynamicCodes} dynamic codes.`],
      "qr-verse.mdx": [
        `QRdx gives you logos, SVG and ${free.dynamicCodes} dynamic codes free.`,
      ],
      "canva-qr.mdx": [
        `SVG and ${free.dynamicCodes} tracked codes free.`,
        `for up to ${free.dynamicCodes} dynamic codes with ${free.analyticsRetentionDays} days of history.`,
        `up to ${mb} MB per file on the free plan`,
        `the free plan includes ${free.dynamicCodes}`,
      ],
      "bitly-qr.mdx": [
        `${free.dynamicCodes} dynamic codes on the free plan with unlimited scans, and Pro at $${PRICING.pro.month.amounts.USD}/mo or $${PRICING.pro.year.amounts.USD}/yr.`,
      ],
    })) {
      for (const phrase of phrases) expect(read(file), file).toContain(phrase);
    }
    expect(blog).toContain(
      `a free account adds ${free.dynamicCodes} dynamic codes with unlimited scans and ${free.analyticsRetentionDays} days of history`,
    );
  });

  it("gives QR-Verse's free plan the same limits everywhere", () => {
    // content/compare/qr-verse.mdx is the record: 1 dynamic code, no logo.
    expect(read("qr-verse.mdx")).toContain(
      'competitor: "1 free; unlimited on Pro"',
    );
    expect(blog).toContain("only 1 dynamic code");
    expect(blog).not.toMatch(/unlimited dynamic QR codes and full analytics/);
    expect(blog).not.toMatch(/QR-Verse, which includes unlimited/);
  });

  it("says QRdx's scan analytics are built in, not a Dub feature", () => {
    expect(blog).not.toMatch(/analytics through the optional Dub/i);
    expect(blog).toContain("Scan analytics built in");
  });

  it("doesn't offer a Canva app that isn't in Canva's marketplace", () => {
    // app/[lang]/(home)/plugins/plugin-data.ts has no storeUrl for Canva.
    expect(read("canva-qr.mdx")).not.toMatch(/Canva app|Apps Marketplace/i);
  });
});

describe("home search snippet", () => {
  it("puts the brand first and fits the limits", () => {
    expect(siteTitle.startsWith("QRdx: ")).toBe(true);
    expect(siteTitle.length).toBeLessThan(MAX_TITLE + 1);
    expect(siteDescription.length).toBeLessThan(MAX_DESCRIPTION + 1);
  });
});
