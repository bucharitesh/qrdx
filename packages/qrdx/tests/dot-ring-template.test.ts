// The dot ring template (templateId "DotRing"): its ring of dots is the
// original layout, picked per link exactly as the original design picks it;
// it scans at every error-correction level for short, typical and long
// links; and its text reaches every output.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS, getScanScoreFromPixels, toSVGString } from "../src/core";
import { getQRAsPNG } from "../src/node";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { DotRing } from "../src/template/dot-ring";
import {
  CENTER,
  CODE_OFFSET,
  DEFAULT_TEXT,
  dotRingDots,
  dotRingLetters,
  dotRingPositions,
  dotsClearOfCode,
  VIEW,
} from "../src/template/dot-ring-layout";
import { getTemplateCodeShare } from "../src/template-placement";
import { getAllTemplates, getTemplate, getTemplateIds } from "../src/templates";
import { decodePng } from "../src/utils/png";
import { parseSvgMarkup, type SvgNode } from "../src/utils/svg-geometry";
import type { ErrorLevel, QRProps } from "../types";
import { lightOnTopOfRing, machineHasFonts } from "./support/dot-ring";
import { renderSvg } from "./support/qr";
import { decodeQR, rasterizeSvg, simulateCamera } from "./support/raster";

/** The original table of dot centers, in its order. */
const TABLE: [number, number][] = JSON.parse(
  readFileSync(new URL("./fixtures/dot-ring.json", import.meta.url), "utf8")
);

/** The original design's pick of dots for a link, written out again. */
function originalPick(url: string, count = 240): [number, number][] {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = hash * 32 - hash + url.charCodeAt(i);
    hash %= 2_147_483_647;
  }
  let state = Math.abs(hash);
  const random = () => {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
  const shuffled = TABLE.map((_, index) => index);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as number, shuffled[i] as number];
  }
  return shuffled
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((index) => TABLE[index] as [number, number]);
}

const URLS = {
  short: "https://qrdx.dev/q/x",
  typical: "https://example.com/card?id=12345&src=print",
  query:
    "https://example.com/card?id=12345&utm_source=print&utm_medium=poster&utm_campaign=winter-launch-2026&ref=store-front",
  long: `https://www.example.com/experiences/winter-launch-2026/store-front?${"ref=poster&utm_source=print&".repeat(5)}id=Ab3dE9xQ7`,
} as const;
const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const HAS_FONTS = await machineHasFonts();
/** Pixels per module on a phone's sensor: small, medium and close. */
const MODULE_PX = [4, 6, 9] as const;

/** The ring's dots in a render: the group right after the background disc. */
function dotsOf(markup: string): string[] {
  const group = /r="294.5"><\/circle><g fill="[^"]*">(.*?)<\/g>/.exec(markup);
  return [...(group?.[1] ?? "").matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)].map(
    ([, cx, cy]) => `${cx},${cy}`
  );
}

function textNodes(markup: string): SvgNode[] {
  const found: SvgNode[] = [];
  const walk = (node: SvgNode) => {
    if (node.name === "text") found.push(node);
    for (const child of node.children) walk(child);
  };
  const root = parseSvgMarkup(markup);
  if (root) walk(root);
  return found;
}

/** Modules across the code (no margin), at the level it is drawn at. */
const modulesOf = (value: string, level: ErrorLevel) =>
  qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]).size;

/**
 * Renders the code the way a phone sees it, `modulePx` per module, and
 * decodes it.
 */
function capture(props: QRProps, modulePx: number) {
  const level = props.level ?? "Q";
  const codeWidth = modulesOf(props.value, level) * modulePx;
  const image = rasterizeSvg(renderSvg(props), {
    width: Math.round((codeWidth * VIEW) / 300),
    pad: 4 * modulePx,
  });
  return decodeQR(simulateCamera(image, modulePx));
}

describe("dot ring template", () => {
  it("is registered as DotRing, named Dot Ring", () => {
    expect(getTemplate("DotRing")).toBe(DotRing);
    expect(DotRing.name).toBe("Dot Ring");
    expect(getAllTemplates()).toContain(DotRing);
    expect(getTemplateIds()).toContain("DotRing");
  });

  it("still draws for its earlier id, which no list shows", () => {
    expect(getTemplate("FlamQR")).toBe(DotRing);
    expect(getTemplateIds()).not.toContain("FlamQR");
    expect(getAllTemplates().filter((t) => t === DotRing)).toHaveLength(1);
    expect(toSVGString({ value: URLS.typical, templateId: "FlamQR" })).toBe(
      toSVGString({ value: URLS.typical, templateId: "DotRing" })
    );
    // Prototype names aren't templates
    expect(getTemplate("constructor")).toBeUndefined();
  });

  it("keeps the 297 dot centers of the original layout, in order", () => {
    expect(TABLE).toHaveLength(297);
    expect(dotRingPositions().map(({ cx, cy }) => [cx, cy])).toEqual(TABLE);
  });

  it("picks the dots the original design picks for each link", () => {
    for (const url of ["", "a", ...Object.values(URLS)]) {
      expect(dotRingDots(url).map(({ cx, cy }) => [cx, cy])).toEqual(
        originalPick(url)
      );
    }
  });

  it("draws the same ring for the same link and another for another link", () => {
    const rings = Object.values(URLS).map((value) =>
      dotsOf(toSVGString({ value, templateId: "DotRing" }))
    );
    // Short and typical links draw all 240 picked dots; dense codes leave
    // out the ones next to the code
    expect(rings[0]).toHaveLength(240);
    expect(rings[1]).toHaveLength(240);
    expect(rings[2]?.length).toBeLessThan(240);
    expect(rings[2]?.length).toBeGreaterThan(60);
    expect(
      dotsOf(toSVGString({ value: URLS.typical, templateId: "DotRing" }))
    ).toEqual(rings[1]);
    const keys = rings.map((ring) => ring.join(" "));
    expect(new Set(keys).size).toBe(keys.length);
    // Links one character apart get different rings too
    const neighbours = ["https://qrdx.dev/q/a", "https://qrdx.dev/q/b"].map(
      (value) => dotsOf(toSVGString({ value, templateId: "DotRing" })).join(" ")
    );
    expect(neighbours[0]).not.toBe(neighbours[1]);
    // The same props always draw the same markup
    expect(toSVGString({ value: URLS.query, templateId: "DotRing" })).toBe(
      toSVGString({ value: URLS.query, templateId: "DotRing" })
    );
  });

  it("keeps a light band around dense codes", () => {
    const dots = dotRingDots(URLS.long);
    // 33 modules (typical link at Q): every dot
    expect(dotsClearOfCode(dots, 300 / 33)).toEqual(dots);
    expect(dotsClearOfCode(dots, 300 / 49)).toEqual(dots);
    // 53 modules and up: six modules clear of the code
    for (const modules of [53, 77, 101]) {
      const moduleSize = 300 / modules;
      const kept = dotsClearOfCode(dots, moduleSize);
      expect(kept.length).toBeLessThan(dots.length);
      for (const { cx, cy } of kept) {
        const away = Math.max(
          CODE_OFFSET - cx,
          cx - CODE_OFFSET - 300,
          CODE_OFFSET - cy,
          cy - CODE_OFFSET - 300
        );
        expect(away - moduleSize / 2).toBeGreaterThanOrEqual(6 * moduleSize);
      }
    }
  });

  describe("scans", () => {
    for (const [name, value] of Object.entries(URLS)) {
      it.each(LEVELS)(`${name} link at level %s`, (level) => {
        const props: QRProps = { value, level, templateId: "DotRing" };
        const misses = MODULE_PX.filter(
          (modulePx) => capture(props, modulePx) !== value
        );
        expect(misses, `missed at ${misses.join(", ")} px per module`).toEqual(
          []
        );
      });
    }

    it("with large circle dots and gear eyes", () => {
      for (const value of Object.values(URLS)) {
        for (const level of LEVELS) {
          const props: QRProps = {
            value,
            level,
            templateId: "DotRing",
            bodyPattern: "circle-large",
            cornerEyePattern: "gear",
            cornerEyeDotPattern: "circle",
          };
          expect(capture(props, 6), `${value} at ${level}`).toBe(value);
        }
      }
    });

    it("with a logo of the caller's in the middle", () => {
      const logo =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23e11d48'/%3E%3C/svg%3E";
      const markup = toSVGString({
        value: URLS.typical,
        level: "H",
        templateId: "DotRing",
        imageSettings: { src: logo, width: 24, height: 24, excavate: true },
      });
      expect(markup).toContain("<image");
      for (const level of ["Q", "H"] as const) {
        const props: QRProps = {
          value: URLS.typical,
          level,
          templateId: "DotRing",
          imageSettings: { src: logo, width: 24, height: 24, excavate: true },
        };
        expect(capture(props, 6), level).toBe(URLS.typical);
      }
    });
  });

  it("scores Great with the defaults", async () => {
    // The code is about half of the template's artwork
    const props: QRProps = { value: URLS.typical, templateId: "DotRing" };
    expect(getTemplateCodeShare(props)).toBeCloseTo(300 / VIEW, 6);
    const png = await getQRAsPNG(props, { size: 1400 });
    const image = await decodePng(png);
    if (!image) throw new Error("the PNG doesn't decode");
    const score = await getScanScoreFromPixels(props, {
      data: new Uint8ClampedArray(image.data),
      width: image.width,
      height: image.height,
    });
    expect(score.grade, JSON.stringify(score.checks)).toBe("great");
  });

  describe("text on the ring", () => {
    it("says Scan the QR code by default, one letter per <text>", () => {
      const markup = toSVGString({
        value: URLS.typical,
        templateId: "DotRing",
      });
      // Hidden from screen readers, which would spell it out letter by letter
      expect(markup).toContain('<g aria-hidden="true"><text');
      const letters = textNodes(markup);
      expect(letters.map((node) => node.text).join("")).toBe(
        DEFAULT_TEXT.replaceAll(" ", "")
      );
      expect(DEFAULT_TEXT.split("Scan the QR code")).toHaveLength(5);
      for (const node of letters) {
        expect(node.attrs.fill).toBe("#ffffff");
        expect(node.attrs["font-weight"]).toBe("900");
        expect(node.attrs["text-anchor"]).toBe("middle");
      }
    });

    it("fills the ring by default, with an even gap where it closes", () => {
      const options = {
        fontSize: 32,
        letterSpacing: 3.5,
        position: "top" as const,
        rotation: 0,
      };
      const letters = dotRingLetters(DEFAULT_TEXT, options);
      // Every letter fits, and the first and last sit either side of the
      // bottom, a little more than a word gap apart
      expect(letters).toHaveLength(DEFAULT_TEXT.replaceAll(" ", "").length);
      const first = letters[0];
      const last = letters.at(-1);
      expect(first && last).toBeTruthy();
      expect(first?.y).toBeGreaterThan(CENTER + 200);
      expect(last?.y).toBeGreaterThan(CENTER + 200);
      const seam = Math.hypot(
        (first?.x ?? 0) - (last?.x ?? 0),
        (first?.y ?? 0) - (last?.y ?? 0)
      );
      expect(seam).toBeGreaterThan(30);
      expect(seam).toBeLessThan(80);
    });

    it("centers the text over the top or along the bottom", () => {
      const options = { fontSize: 32, letterSpacing: 3.5, rotation: 0 };
      const top = dotRingLetters("SCAN ME", { ...options, position: "top" });
      const bottom = dotRingLetters("SCAN ME", {
        ...options,
        position: "bottom",
      });
      expect(top.map((letter) => letter.char).join("")).toBe("SCANME");
      for (const letter of top) expect(letter.y).toBeLessThan(CENTER);
      for (const letter of bottom) expect(letter.y).toBeGreaterThan(CENTER);
      // Read left to right in both places
      expect((top[0]?.x ?? 0) < (top.at(-1)?.x ?? 0)).toBe(true);
      expect((bottom[0]?.x ?? 0) < (bottom.at(-1)?.x ?? 0)).toBe(true);
      // Centered: the first and last letters mirror each other
      expect((top[0]?.x ?? 0) + (top.at(-1)?.x ?? 0)).toBeCloseTo(
        2 * CENTER,
        0
      );
      expect((bottom[0]?.x ?? 0) + (bottom.at(-1)?.x ?? 0)).toBeCloseTo(
        2 * CENTER,
        0
      );
    });

    it("leaves out letters that don't fit and characters that can't show", () => {
      const options = {
        fontSize: 32,
        letterSpacing: 3.5,
        position: "top" as const,
        rotation: 0,
      };
      const long = dotRingLetters("W".repeat(200), options);
      expect(long.length).toBeGreaterThan(40);
      expect(long.length).toBeLessThan(80);
      const clean = dotRingLetters("A‮B\u0000C\nD", options);
      expect(clean.map((letter) => letter.char).join("")).toBe("ABCD");
      expect(
        textNodes(
          toSVGString({
            value: URLS.typical,
            templateId: "DotRing",
            customProps: { customText: "" },
          })
        )
      ).toEqual([]);
    });

    it("reaches the PDF and EPS exports", async () => {
      const props: QRProps = {
        value: URLS.typical,
        templateId: "DotRing",
        customProps: { customText: "SCAN ME" },
      };
      const eps = await getQRAsEPS(props, { sizeMm: 40 });
      expect(eps.match(/ show grestore/g)?.length).toBe(6);
      expect(eps.match(/ rotate \(/g)?.length).toBe(6);
      expect(eps).toContain("/QRDX-Bold");
      const pdf = new TextDecoder("latin1").decode(
        new Uint8Array(await getQRAsPrintPDFBuffer(props, { size: 40 }))
      );
      expect(pdf.startsWith("%PDF-")).toBe(true);
      expect(pdf).toContain("Helvetica-Bold");
    });

    // Like frame labels, the text needs a font on the machine (qrdx/node)
    it.skipIf(!HAS_FONTS)(
      "reaches the Node PNG (qrdx/node, resvg)",
      async () => {
        const png = (customText: string) =>
          getQRAsPNG(
            {
              value: URLS.typical,
              templateId: "DotRing",
              customProps: { customText },
            },
            { size: VIEW }
          );
        expect(await lightOnTopOfRing(await png(""))).toBe(0);
        expect(await lightOnTopOfRing(await png("SCAN ME"))).toBeGreaterThan(
          300
        );
      }
    );
  });

  it("places the code in the middle of the artwork", () => {
    const markup = toSVGString({ value: URLS.typical, templateId: "DotRing" });
    expect(markup).toContain(
      `<g transform="translate(${CODE_OFFSET} ${CODE_OFFSET})"><svg height="300"`
    );
    expect(markup).toContain(`viewBox="0 0 ${VIEW} ${VIEW}"`);
  });
});
