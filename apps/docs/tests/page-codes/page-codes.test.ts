// The sample codes on the generator, industry and placement pages
// (lib/landing/page-codes): every page has its own, they fit the page, they
// vary across the site, they hold obvious samples and they open the
// playground with their exact design. The scan-*.test.ts suites check that
// each one scans.
import { OFFICIAL_FRAMES } from "qrdx";
import { FRAME_TEXT_MAX_LENGTH } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { codePlaygroundHref } from "@/components/sections/page-codes/code-tiles";
import {
  ALL_PAGE_CODES,
  codeStyles,
  GENERATOR_HUB_TYPES,
  INDUSTRY_CODES,
  INDUSTRY_HUB_SLUGS,
  OFFICIAL_FRAME_IDS,
  type PageCode,
  PLACEMENT_CODES,
  PLACEMENT_HUB_SLUGS,
  PRINT_SIZE_SLUGS,
  pageCodeImage,
  presetOf,
  TYPE_CODES,
} from "@/lib/landing/page-codes";
import { getTemplate } from "@/lib/landing/templates";
import { parsePlaygroundParams } from "@/lib/playground-links";
import { decodeStyleParam } from "@/lib/playground-style";
import {
  QR_TYPE_GROUPS,
  QR_TYPE_SLUGS,
  QR_TYPES,
} from "@/lib/qr-types-content";
import { industries, placements, type SeoCollection } from "@/lib/seo-content";

/** File page types need file storage, which a deployment may not have. */
const FILE_PAGES = ["pdf", "mp3", "images", "video"];
/** qrdx.dev pages a code may open besides demos and generator pages. */
const SITE_PAGES = ["/", "/playground", "/pricing", "/templates"];

const presets = (codes: readonly PageCode[]) =>
  codes.map((code) => code.preset);

/** Every frame label a code sets. */
function labelsOf(code: PageCode): string[] {
  const frame = code.frame;
  if (!frame) return [];
  return [frame.text, frame.secondaryText].filter(
    (label): label is string => label !== undefined,
  );
}

function expectSiteUrl(id: string, url: URL) {
  const path = url.pathname;
  const demo = /^\/templates\/([\w-]+)\/([\w-]+)$/.exec(path);
  const generator = /^\/qr-code-generator\/([\w-]+)$/.exec(path);
  if (demo) {
    const [, type, variant] = demo as unknown as [string, string, string];
    expect(FILE_PAGES, `${id}: file pages need storage`).not.toContain(type);
    const variants = getTemplate(type)?.variants.map((item) => item.id);
    expect(variants, `${id}: demo ${path}`).toContain(variant);
  } else if (generator) {
    expect(QR_TYPE_SLUGS, id).toContain(generator[1]);
  } else {
    expect(SITE_PAGES, `${id}: ${path}`).toContain(path);
  }
  expect(url.search, id).toBe("");
}

describe("page codes", () => {
  it("cover every generator, industry and placement page, four each", () => {
    expect(Object.keys(TYPE_CODES).sort()).toEqual([...QR_TYPE_SLUGS].sort());
    expect(Object.keys(INDUSTRY_CODES).sort()).toEqual(
      industries.items.map((item) => item.slug).sort(),
    );
    expect(Object.keys(PLACEMENT_CODES).sort()).toEqual(
      placements.items.map((item) => item.slug).sort(),
    );
    for (const codes of [
      ...Object.values(TYPE_CODES),
      ...Object.values(INDUSTRY_CODES),
      ...Object.values(PLACEMENT_CODES),
    ]) {
      expect(codes).toHaveLength(4);
    }
  });

  it("have unique ids that are safe file names", () => {
    const ids = ALL_PAGE_CODES.map((code) => code.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("use built-in themes that read light, all year", () => {
    for (const code of ALL_PAGE_CODES) {
      const preset = presetOf(code);
      // Light-on-dark codes score well but some scanner apps can't read
      // them (the scan score says so); seasonal themes come and go.
      expect(preset.category, code.id).not.toBe("dark");
      expect(preset.category, code.id).not.toBe("seasonal");
    }
  });

  it("show a code of the page's own type on generator pages", () => {
    for (const [type, codes] of Object.entries(TYPE_CODES)) {
      for (const code of codes) expect(code.type, code.id).toBe(type);
    }
  });

  it("never repeat a theme on a page", () => {
    for (const codes of [
      ...Object.values(TYPE_CODES),
      ...Object.values(INDUSTRY_CODES),
      ...Object.values(PLACEMENT_CODES),
    ]) {
      expect(new Set(presets(codes)).size, codes[0]?.id).toBe(codes.length);
    }
  });

  it("never repeat a theme within a group of industry or placement pages", () => {
    const byCollection: [SeoCollection, Record<string, PageCode[]>][] = [
      [industries, INDUSTRY_CODES],
      [placements, PLACEMENT_CODES],
    ];
    for (const [collection, codes] of byCollection) {
      for (const group of collection.groups) {
        const used = group.items.flatMap((item) =>
          presets(codes[item.slug] ?? []),
        );
        expect(new Set(used).size, group.id).toBe(used.length);
      }
    }
  });

  it("look different from the pages next to them", () => {
    const sequences: PageCode[][][] = [
      QR_TYPES.map((item) => TYPE_CODES[item.type]),
      industries.items.map((item) => INDUSTRY_CODES[item.slug] ?? []),
      placements.items.map((item) => PLACEMENT_CODES[item.slug] ?? []),
    ];
    for (const pages of sequences) {
      for (let index = 1; index < pages.length; index++) {
        const [before, page] = [pages[index - 1], pages[index]] as [
          PageCode[],
          PageCode[],
        ];
        page.forEach((code, slot) => {
          expect(code.preset, code.id).not.toBe(before[slot]?.preset);
        });
      }
    }
  });

  it("spread across the themes and frames", () => {
    const light = Object.values(
      Object.fromEntries(ALL_PAGE_CODES.map((code) => [code.preset, code])),
    );
    expect(light.length).toBeGreaterThanOrEqual(52);
    const officials = new Set(
      ALL_PAGE_CODES.flatMap((code) =>
        code.frame && "official" in code.frame ? [code.frame.official] : [],
      ),
    );
    expect([...officials].sort()).toEqual([...OFFICIAL_FRAME_IDS].sort());
    const styles = new Set(
      ALL_PAGE_CODES.flatMap((code) =>
        code.frame && "style" in code.frame ? [code.frame.style] : [],
      ),
    );
    expect(styles.size).toBeGreaterThanOrEqual(15);
    const plain = ALL_PAGE_CODES.filter((code) => code.frame === null);
    expect(plain.length).toBeGreaterThan(0);
  });

  it("only name official frames for use cases", () => {
    const useCases = OFFICIAL_FRAMES.filter(
      (frame) => frame.category === "use-case",
    ).map((frame) => frame.id);
    expect([...OFFICIAL_FRAME_IDS].sort()).toEqual([...useCases].sort());
  });

  it("have labels that fit their frames", () => {
    for (const code of ALL_PAGE_CODES) {
      expect(code.label.trim(), code.id).not.toBe("");
      for (const label of labelsOf(code)) {
        expect(label.length, `${code.id}: ${label}`).toBeLessThanOrEqual(
          FRAME_TEXT_MAX_LENGTH,
        );
        expect(label, code.id).not.toMatch(/TBD|\[\[|placeholder/i);
      }
      if (code.frame && "official" in code.frame) {
        const id = code.frame.official;
        const spec = OFFICIAL_FRAMES.find((frame) => frame.id === id)?.spec;
        for (const label of spec?.labels ?? []) {
          const text =
            label.slot === "primary"
              ? code.frame.text
              : label.slot === "secondary"
                ? code.frame.secondaryText
                : undefined;
          if (text !== undefined && label.maxLength) {
            expect(text.length, `${code.id}: ${text}`).toBeLessThanOrEqual(
              label.maxLength,
            );
          }
        }
      }
    }
  });

  it("hold obvious samples, not real people's details", () => {
    for (const { id, value, type } of ALL_PAGE_CODES) {
      for (const [url] of value.matchAll(/https?:\/\/[^\s;]+/g)) {
        const parsed = new URL(url);
        if (parsed.host === "qrdx.dev") {
          expectSiteUrl(id, parsed);
        } else if (parsed.host === "wa.me") {
          expect(type, id).toBe("whatsapp");
        } else {
          // Google Maps, for a public place only.
          expect(type, id).toBe("maps");
          expect(parsed.host, id).toBe("www.google.com");
        }
      }
      for (const [address] of value.matchAll(/[\w.+-]+@[\w.-]+/g)) {
        expect(address, id).toMatch(/@example(\.com)?$/);
      }
      for (const [digits] of value.matchAll(/\+?1?\s?415\s?555\s?\d{4}/g)) {
        expect(digits.replace(/\D/g, ""), id).toMatch(/55501\d\d$/);
      }
      if (type === "wifi") expect(value, id).toContain("S:QRdx Sample ");
      if (type === "upi") expect(value, id).toContain("pa=sample@example");
    }
  });

  it("open the playground with their own design and type, never their content", () => {
    for (const code of ALL_PAGE_CODES) {
      const href = codePlaygroundHref(code);
      const url = new URL(href, "https://qrdx.dev");
      expect(url.pathname, code.id).toBe("/playground");
      expect(url.hash, code.id).toBe("");
      const params = parsePlaygroundParams(url.search);
      expect(params.type, code.id).toBe(code.type);
      expect(href, code.id).not.toContain(encodeURIComponent(code.value));
      if (code.frame === undefined) {
        expect(params.preset, code.id).toBe(code.preset);
        continue;
      }
      const decoded = decodeStyleParam(url.searchParams.get("style"));
      expect(decoded?.preset, code.id).toBe(code.preset);
      expect(decoded?.styles.frame, code.id).toEqual(codeStyles(code).frame);
      expect(decoded?.styles.bodyPattern, code.id).toBe(
        presetOf(code).styles.bodyPattern,
      );
    }
  });

  it("reserve their image size", () => {
    for (const code of ALL_PAGE_CODES) {
      const image = pageCodeImage(code);
      expect(image.src).toBe(`/sample-codes/${code.id}.svg`);
      expect(image.width, code.id).toBeGreaterThan(0);
      expect(image.height, code.id).toBeGreaterThan(0);
      expect(image.framed, code.id).toBe(Boolean(codeStyles(code).frame));
    }
  });
});

describe("hub rows", () => {
  it("show one code per group, in group order", () => {
    expect(
      GENERATOR_HUB_TYPES.map(
        (type) => QR_TYPES.find((item) => item.type === type)?.group,
      ),
    ).toEqual(QR_TYPE_GROUPS.map((group) => group.id));
    const groupsOf = (collection: SeoCollection, slugs: string[]) =>
      slugs.map((slug) => collection.groupOf(slug)?.id);
    expect(groupsOf(industries, INDUSTRY_HUB_SLUGS)).toEqual(
      industries.groups.map((group) => group.id),
    );
    expect(groupsOf(placements, PLACEMENT_HUB_SLUGS)).toEqual(
      placements.groups.map((group) => group.id),
    );
  });

  it("link the print size calculator to placements that exist", () => {
    for (const slug of PRINT_SIZE_SLUGS) {
      expect(placements.get(slug), slug).toBeDefined();
    }
  });

  it("never repeat a theme", () => {
    for (const codes of [
      PRINT_SIZE_SLUGS.map((slug) => PLACEMENT_CODES[slug]?.[0]),
      GENERATOR_HUB_TYPES.map((type) => TYPE_CODES[type][0]),
      INDUSTRY_HUB_SLUGS.map((slug) => INDUSTRY_CODES[slug]?.[0]),
      PLACEMENT_HUB_SLUGS.map((slug) => PLACEMENT_CODES[slug]?.[0]),
    ]) {
      const used = codes.map((code) => code?.preset);
      expect(used).not.toContain(undefined);
      expect(new Set(used).size).toBe(used.length);
    }
  });
});
