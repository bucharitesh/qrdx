// The dot ring template (templateId "DotRing"): its ring of dots is the
// original layout, picked per link exactly as the original design picks it;
// it scans at every error-correction level for short, typical and long
// links; and its text reaches every output.
import { createHash } from "node:crypto";
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
  DEFAULT_FONT_SIZE,
  DEFAULT_LETTER_SPACING,
  DEFAULT_TEXT,
  dotRingDots,
  dotRingLetters,
  dotRingPositions,
  dotRingText,
  dotsClearOfCode,
  MIN_FONT_SIZE,
  VIEW,
} from "../src/template/dot-ring-layout";
import { getTemplateCodeShare } from "../src/template-placement";
import { getAllTemplates, getTemplate, getTemplateIds } from "../src/templates";
import { decodePng } from "../src/utils/png";
import { parseSvgMarkup, type SvgNode } from "../src/utils/svg-geometry";
import type { ErrorLevel, QRProps } from "../types";
import { lightOnTopOfRing, machineHasFonts } from "./support/dot-ring";
import {
  CIRCUMFERENCE,
  cleanText,
  legacyDotRingLetters,
  letterWidth,
} from "./support/legacy-dot-ring";
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

    it("with text fitted or repeated round the ring", () => {
      const fills: Record<string, unknown>[] = [
        {
          customText: Array.from({ length: 6 }, () => "Make your own *").join(
            " "
          ),
        },
        { customText: "Point your camera here * ".repeat(12) },
        { customText: "Read the docs *", textFill: "repeat" },
        // Whole copies of a long phrase, and a sentence cut with "…"
        {
          customText: Array.from(
            { length: 3 },
            () =>
              "Point your camera at the code to open the menu, order and pay at your table *"
          ).join(" "),
        },
        {
          customText:
            "Point your camera at the code to open the menu, order and pay at your table * Scan to see today's specials and the wine list, book a table for tonight, join our loyalty club, pay your bill and leave a review on your way out *",
        },
      ];
      for (const customProps of fills) {
        for (const value of Object.values(URLS)) {
          const props: QRProps = { value, templateId: "DotRing", customProps };
          expect(capture(props, 6), JSON.stringify(customProps)).toBe(value);
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

    it("leaves out characters that can't show, and draws nothing for no text", () => {
      const options = {
        fontSize: 32,
        letterSpacing: 3.5,
        position: "top" as const,
        rotation: 0,
      };
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

  describe("text that fits the ring", () => {
    // Captured from qrdx 0.0.54 before text fitting, as SHA-256 of the markup
    const BEFORE: [string, QRProps, string][] = [
      [
        "default",
        { value: URLS.typical, templateId: "DotRing" },
        "7bd507641a9c448b613254f316f8ac37f9160a6bf236649b94f5d156c7615a97",
      ],
      [
        "default at level H",
        { value: URLS.short, templateId: "DotRing", level: "H" },
        "d3ffbbf7e5d9c2ae3bed7f86a77a0fb87eed8f73d0d29967cc4c28945e5e13f4",
      ],
      [
        "at the bottom, turned",
        {
          value: "https://qrdx.dev",
          templateId: "DotRing",
          customProps: { textPosition: "bottom", textRotation: 15 },
        },
        "911e402cdfa495687b0772a70f8e2cbfe7258e7cfe4698c12018ababa90abf9b",
      ],
      [
        "short text, larger and wider",
        {
          value: "https://qrdx.dev",
          templateId: "DotRing",
          customProps: {
            customText: "SCAN ME",
            fontSize: 40,
            fontLetterSpacing: 6,
          },
        },
        "6542d3fa02cb1a2fa45968659d81094324bc6e11f18c8fb1ba97706d0051574b",
      ],
      [
        "styled",
        {
          value: "https://qrdx.dev/docs",
          templateId: "DotRing",
          fgColor: "#1d4ed8",
          customProps: {
            customText: "Read the docs * Read the docs *",
            textColor: "#fde047",
            fontWeight: 700,
            strokeWidth: 2,
            outerCircleColor: "#111827",
          },
        },
        "55f5352fbe134aee8d250697503388c8e7722940efb5065dc426eef1fe2be43a",
      ],
      [
        "no text",
        {
          value: "https://qrdx.dev",
          templateId: "DotRing",
          customProps: { customText: "" },
        },
        "1b3129b32bada79c501f8c34dd05698e9d6d1118f3611029f464f88fa0cd4bbd",
      ],
    ];

    it.each(BEFORE)("draws %s byte for byte as before", (_, props, sha256) => {
      expect(
        createHash("sha256").update(toSVGString(props)).digest("hex")
      ).toBe(sha256);
    });

    it("sets any text with room to spare exactly as before", () => {
      const words = ["Scan", "me", "QR", "*", "Wi-Fi", "menu", "Café", "@qrdx"];
      let seed = 7;
      const random = () => {
        seed = (seed * 16_807) % 2_147_483_647;
        return seed / 2_147_483_647;
      };
      let checked = 0;
      for (let i = 0; i < 400; i++) {
        const text = Array.from(
          { length: 1 + Math.floor(random() * 24) },
          () => words[Math.floor(random() * words.length)]
        ).join(" ");
        const options = {
          fontSize: 16 + random() * 30,
          letterSpacing: random() * 8 - 1,
          position: random() < 0.5 ? ("top" as const) : ("bottom" as const),
          rotation: random() * 360 - 180,
        };
        const chars = cleanText(text);
        const line =
          chars.reduce(
            (sum, char) => sum + letterWidth(char, options.fontSize),
            0
          ) +
          options.letterSpacing * (chars.length - 1);
        const seam =
          letterWidth(" ", options.fontSize) + 2 * options.letterSpacing;
        if (line + seam > CIRCUMFERENCE) {
          continue;
        }
        expect(dotRingLetters(text, options), text).toEqual(
          legacyDotRingLetters(text, options)
        );
        expect(dotRingText(text, options).fontSize).toBe(options.fontSize);
        checked++;
      }
      expect(checked).toBeGreaterThan(200);
    });
  });

  describe("text longer than the ring", () => {
    const options = {
      fontSize: DEFAULT_FONT_SIZE,
      letterSpacing: DEFAULT_LETTER_SPACING,
      position: "top" as const,
      rotation: 0,
    };
    const times = (phrase: string, count: number) =>
      Array.from({ length: count }, () => phrase).join(" ");

    const LONG =
      "Point your camera at the code to open the menu, order and pay at your table *";
    /** The "…" that ends cut text is 1 em wide. */
    const CUT = "\u2026";
    const widthOf = (chars: string[], fontSize: number) =>
      chars.reduce(
        (sum, char, index) =>
          sum +
          (char === CUT && index === chars.length - 1
            ? fontSize
            : letterWidth(char, fontSize)),
        0
      );

    /** The line as set, plus the word space where the ring closes. */
    function closedLength(ring: ReturnType<typeof dotRingText>) {
      const chars = Array.from(ring.text);
      const letters = widthOf(chars, ring.fontSize);
      return (
        letters +
        ring.letterSpacing * (chars.length - 1) +
        letterWidth(" ", ring.fontSize) +
        2 * ring.letterSpacing
      );
    }

    it("tightens the letter spacing first, keeping the size", () => {
      // Five times overruns the ring by about 8% at the default spacing
      const text = times("Make your own *", 5);
      const ring = dotRingText(text, options);
      expect(ring.text).toBe(text);
      expect(ring.fontSize).toBe(DEFAULT_FONT_SIZE);
      expect(ring.letterSpacing).toBeGreaterThan(0);
      expect(ring.letterSpacing).toBeLessThan(DEFAULT_LETTER_SPACING);
      // It closes the ring with a word space: its end never meets its start
      expect(closedLength(ring)).toBeCloseTo(CIRCUMFERENCE, 6);
    });

    it("then shrinks the font, keeping every letter", () => {
      const text = times("Make your own *", 6);
      const ring = dotRingText(text, options);
      expect(ring.text).toBe(text);
      expect(ring.letterSpacing).toBe(0);
      expect(ring.fontSize).toBeLessThan(DEFAULT_FONT_SIZE);
      expect(ring.fontSize).toBeGreaterThan(MIN_FONT_SIZE);
      // (fontSize is rounded to 3 decimals for the markup)
      expect(closedLength(ring)).toBeCloseTo(CIRCUMFERENCE, 1);
      // The template draws the letters at that size
      const markup = toSVGString({
        value: URLS.typical,
        templateId: "DotRing",
        customProps: { customText: text },
      });
      const sizes = new Set(
        textNodes(markup).map((node) => node.attrs["font-size"])
      );
      expect([...sizes]).toEqual([String(ring.fontSize)]);
    });

    it("then keeps whole copies of a repeated phrase, never part of one", () => {
      // Three copies don't fit even at the smallest size; two do
      const ring = dotRingText(times(LONG, 3), options);
      expect(ring.text).toBe(times(LONG, 2));
      expect(ring.text).not.toContain(CUT);
      expect(ring.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      expect(ring.letterSpacing).toBe(0);
      // Closed as textFill "repeat" closes it: the seam is the word space
      // between the copies
      expect(closedLength(ring)).toBeCloseTo(CIRCUMFERENCE, 1);
      expect(ring).toEqual(dotRingText(times(LONG, 2), options));
      // A short phrase many times over keeps whole copies too
      expect(dotRingText(times("Scan me *", 40), options).text).toMatch(
        /^Scan me \*( Scan me \*)+$/
      );
    });

    it("shrinks a long sentence that fits at a smaller size, without cutting it", () => {
      const text = `${LONG} Scan to see today's specials and the wine list`;
      const ring = dotRingText(text, options);
      expect(ring.text).toBe(text);
      expect(ring.fontSize).toBeGreaterThan(MIN_FONT_SIZE);
      expect(ring.fontSize).toBeLessThan(DEFAULT_FONT_SIZE);
    });

    it("cuts other text after the last whole word that fits, ending with …", () => {
      const text = `${LONG} Scan to see today's specials and the wine list, book a table for tonight, join our loyalty club, pay your bill and leave a review on your way out *`;
      const ring = dotRingText(text, options);
      expect(ring.text.endsWith(CUT)).toBe(true);
      const kept = ring.text.slice(0, -1);
      // A whole-word prefix of the text, its trailing punctuation dropped
      expect(text.startsWith(kept)).toBe(true);
      expect(text.slice(kept.length)).toMatch(/^[^\p{L}\p{N}]/u);
      expect(kept).toMatch(/[\p{L}\p{N}]$/u);
      expect(ring.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      // The word space before the ring's start is kept (fontSize is rounded
      // to 3 decimals for the markup)
      expect(closedLength(ring)).toBeLessThanOrEqual(CIRCUMFERENCE + 0.1);
      // One more word and the "…" wouldn't fit at the smallest size
      const next = Array.from(
        `${text.slice(0, text.indexOf(" ", kept.length + 1)).replace(/[,.;:]$/, "")}${CUT}`
      );
      expect(
        widthOf(next, MIN_FONT_SIZE) + letterWidth(" ", MIN_FONT_SIZE)
      ).toBeGreaterThan(CIRCUMFERENCE);
      // The template draws it as the last letter
      const markup = toSVGString({
        value: URLS.typical,
        templateId: "DotRing",
        customProps: { customText: text },
      });
      expect(textNodes(markup).at(-1)?.text).toBe(CUT);
    });

    it("cuts within a word longer than the ring, ending with …", () => {
      const ring = dotRingText("W".repeat(200), options);
      expect(ring.text).toMatch(/^W{100,130}\u2026$/u);
      expect(ring.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      expect(closedLength(ring)).toBeLessThanOrEqual(CIRCUMFERENCE + 0.1);
    });

    it("prints the … as ... in EPS, whose font has no ellipsis", async () => {
      const eps = await getQRAsEPS(
        {
          value: URLS.typical,
          templateId: "DotRing",
          customProps: { customText: "W".repeat(200) },
        },
        { sizeMm: 40 }
      );
      expect(eps).toContain("(...) 0 0 moveto");
      expect(eps).not.toContain("(?)");
    });

    it("never shrinks a font asked for below the smallest size", () => {
      const ring = dotRingText(times("Make your own *", 12), {
        ...options,
        fontSize: 12,
      });
      expect(ring.fontSize).toBe(12);
      expect(closedLength(ring)).toBeLessThanOrEqual(CIRCUMFERENCE + 1e-6);
    });
  });

  describe('textFill: "repeat"', () => {
    const options = {
      fontSize: DEFAULT_FONT_SIZE,
      letterSpacing: DEFAULT_LETTER_SPACING,
      position: "top" as const,
      rotation: 0,
      fill: "repeat" as const,
    };
    it.each([
      ["Make your own *", 5],
      ["Read the docs *", 5],
      ["Scan the QR code *", 4],
      ["SCAN ME", 9],
    ])("repeats %j round the whole ring (%i times)", (phrase, copies) => {
      const ring = dotRingText(phrase, options);
      expect(ring.text).toBe(
        Array.from({ length: copies }, () => phrase).join(" ")
      );
      expect(ring.fontSize).toBe(DEFAULT_FONT_SIZE);
      // Even spacing, near the asked spacing
      expect(
        Math.abs(ring.letterSpacing - DEFAULT_LETTER_SPACING)
      ).toBeLessThan(2.5);
      // The copies close the ring: the seam is the same word space as
      // between the copies
      const chars = Array.from(ring.text);
      const length =
        chars.reduce((sum, char) => sum + letterWidth(char, ring.fontSize), 0) +
        ring.letterSpacing * (chars.length + 1) +
        letterWidth(" ", ring.fontSize);
      expect(length).toBeCloseTo(CIRCUMFERENCE, 6);
    });

    it("reads text that already repeats a phrase as that phrase", () => {
      const phrase = "Make your own *";
      for (const count of [2, 3, 4, 5]) {
        const repeated = Array.from({ length: count }, () => phrase).join(" ");
        expect(dotRingText(repeated, options)).toEqual(
          dotRingText(phrase, options)
        );
      }
      // A line that doesn't repeat is the phrase
      expect(dotRingText("Scan me to order", options).text).toMatch(
        /^Scan me to order( Scan me to order)+$/
      );
    });

    it("fits a phrase longer than the ring once, as without it", () => {
      const long = "W".repeat(200);
      expect(dotRingText(long, options)).toEqual(
        dotRingText(long, { ...options, fill: "none" })
      );
    });

    it("reaches the template's markup", () => {
      const markup = (customProps: Record<string, unknown>) =>
        textNodes(
          toSVGString({
            value: URLS.typical,
            templateId: "DotRing",
            customProps,
          })
        )
          .map((node) => node.text)
          .join("");
      expect(
        markup({ customText: "Read the docs *", textFill: "repeat" })
      ).toBe("Readthedocs*".repeat(5));
      expect(markup({ customText: "Read the docs *" })).toBe("Readthedocs*");
    });
  });

  it("places the code in the middle of the artwork", () => {
    const markup = toSVGString({ value: URLS.typical, templateId: "DotRing" });
    expect(markup).toContain(
      `<g transform="translate(${CODE_OFFSET} ${CODE_OFFSET})"><svg height="300"`
    );
    expect(markup).toContain(`viewBox="0 0 ${VIEW} ${VIEW}"`);
  });
});
