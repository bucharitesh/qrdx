// SVG path data and transform parsing (SVG 1.1 §8.3 path grammar, §7.6
// transform attribute), which the PDF and EPS exporters depend on.
import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  parsePathData,
  parseSvgMarkup,
  parseTransform,
  type Segment,
} from "../src/utils/svg-geometry";
import { FRAME_STYLES } from "../types/frame";
import { renderSvg } from "./support/qr";

const end = (segments: Segment[]) => {
  const last = [...segments].reverse().find((s) => s.op !== "Z");
  return last && "x" in last ? [last.x, last.y] : null;
};

describe("parsePathData", () => {
  it("treats extra pairs after M as implicit lineto (absolute)", () => {
    expect(parsePathData("M10 10 20 20")).toEqual([
      { op: "M", x: 10, y: 10 },
      { op: "L", x: 20, y: 20 },
    ]);
  });

  it("resolves relative commands against the current point", () => {
    expect(parsePathData("m10,10 l5,0 h5 v5 z")).toEqual([
      { op: "M", x: 10, y: 10 },
      { op: "L", x: 15, y: 10 },
      { op: "L", x: 20, y: 10 },
      { op: "L", x: 20, y: 15 },
      { op: "Z" },
    ]);
  });

  it("starts a relative moveto after closepath from the subpath start", () => {
    const segments = parsePathData("M10 10 L20 10 Z m5 5");
    expect(segments.at(-1)).toEqual({ op: "M", x: 15, y: 15 });
  });

  it("reads compact number syntax (1.5.5, -1-2, 1e1)", () => {
    expect(parsePathData("M1.5.5L-1-2l1e1 0")).toEqual([
      { op: "M", x: 1.5, y: 0.5 },
      { op: "L", x: -1, y: -2 },
      { op: "L", x: 9, y: -2 },
    ]);
  });

  it("converts arcs to cubics that end on the arc's endpoint", () => {
    const segments = parsePathData("M0 0 A10 10 0 0 1 20 0");
    expect(segments.every((s) => s.op === "M" || s.op === "C")).toBe(true);
    const [x, y] = end(segments) as number[];
    expect(x).toBeCloseTo(20, 10);
    expect(y).toBeCloseTo(0, 10);
  });

  it("puts the midpoint of a sweep=1 half circle on the correct side", () => {
    // From (0,0) to (20,0) with sweep-flag 1 the arc bulges towards -y.
    const [first] = parsePathData("M0 0 A10 10 0 0 1 20 0").filter(
      (s) => s.op === "C"
    );
    expect(first && first.op === "C" && first.y).toBeCloseTo(-10, 5);
  });

  it("scales up radii that are too small to reach the endpoint", () => {
    const [x, y] = end(parsePathData("M0 0 A1 1 0 0 1 20 0")) as number[];
    expect([x, y]).toEqual([20, 0]);
  });

  it("converts quadratic and smooth curves to cubics", () => {
    const segments = parsePathData("M0 0 Q10 10 20 0 T40 0 S60 10 80 0");
    expect(segments.filter((s) => s.op === "C")).toHaveLength(3);
    expect(end(segments)).toEqual([80, 0]);
  });

  it("stops at the first malformed command, like browsers", () => {
    expect(parsePathData("M0 0 L10 10 L oops 20 20")).toEqual([
      { op: "M", x: 0, y: 0 },
      { op: "L", x: 10, y: 10 },
    ]);
  });
});

describe("parseTransform", () => {
  const map = (transform: string, x: number, y: number) =>
    applyMatrix(parseTransform(transform), x, y).map(
      (v) => Math.round(v * 1e6) / 1e6
    );

  it.each<[string, [number, number], [number, number]]>([
    ["translate(10)", [1, 1], [11, 1]],
    ["translate(10, 5)", [0, 0], [10, 5]],
    ["scale(2)", [3, 4], [6, 8]],
    ["scale(2, 3)", [3, 4], [6, 12]],
    ["rotate(90)", [1, 0], [0, 1]],
    ["rotate(90, 5, 5)", [10, 5], [5, 10]],
    ["matrix(1 0 0 1 5 6)", [0, 0], [5, 6]],
    ["translate(10,0) scale(2)", [1, 1], [12, 2]],
    ["skewX(45)", [0, 1], [1, 1]],
  ])("%s maps %j to %j", (transform, [x, y], expected) => {
    expect(map(transform, x, y)).toEqual(expected);
  });

  it("returns identity for a missing transform", () => {
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe("parseSvgMarkup", () => {
  it("decodes entities in attributes and text", () => {
    const root = parseSvgMarkup(
      '<svg><text a="&lt;&amp;&#x41;">A &amp; B</text></svg>'
    );
    expect(root?.children[0]?.attrs.a).toBe("<&A");
    expect(root?.children[0]?.text).toBe("A & B");
  });

  it("finds the svg root after an XML declaration and comments", () => {
    const root = parseSvgMarkup(
      '<?xml version="1.0"?><!-- x --><svg width="10"/>'
    );
    expect(root?.attrs.width).toBe("10");
  });

  it("returns null when there is no svg element", () => {
    expect(parseSvgMarkup("<html></html>")).toBeNull();
  });
});

// parseSvgMarkup as it was: two regexes with matchAll. They backtracked
// polynomially on hostile input, so the reader became a linear scan; this
// copy is the reference the scan must match on every input.
const LEGACY_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const legacyDecode = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10_ff_ff &&
        !(code >= 0xd8_00 && code <= 0xdf_ff)
        ? String.fromCodePoint(code)
        : match;
    }
    return LEGACY_ENTITIES[entity.toLowerCase()] ?? match;
  });
const LEGACY_TOKEN_RE =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
const LEGACY_ATTR_RE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

type Tree = ReturnType<typeof parseSvgMarkup>;

/** Every node, not just the first <svg>, so nothing the parse builds hides. */
function legacyParse(markup: string): NonNullable<Tree> {
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: NonNullable<Tree>[] = [root];
  for (const match of markup.matchAll(LEGACY_TOKEN_RE)) {
    const [, cdata, closeName, openName, rawAttrs, selfClosing, text] = match;
    const current = stack.at(-1) as NonNullable<Tree>;
    if (openName) {
      const attrs: Record<string, string> = {};
      for (const attr of (rawAttrs ?? "").matchAll(LEGACY_ATTR_RE)) {
        attrs[attr[1] as string] = legacyDecode(attr[2] ?? attr[3] ?? "");
      }
      const node = { name: openName, attrs, children: [], text: "" };
      current.children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    } else if (closeName) {
      if (stack.length > 1) {
        stack.pop();
      }
    } else if (text !== undefined) {
      current.text += legacyDecode(text);
    } else if (cdata !== undefined) {
      current.text += cdata;
    }
  }
  return root;
}

/**
 * Wraps the markup in an <svg>, nested deep enough that no closing tag in it
 * can climb out, so the whole parse comes back to compare.
 */
function expectSameParse(markup: string) {
  const depth = markup.split("</").length - 1;
  const wrapped = `<svg>${"<g>".repeat(depth)}${markup}`;
  expect(parseSvgMarkup(wrapped), JSON.stringify(markup)).toEqual(
    legacyParse(wrapped).children[0]
  );
}

describe("parseSvgMarkup matches the regex reader it replaced", () => {
  it("on markup the engine renders", () => {
    const corpus = [
      renderSvg({ value: "https://qrdx.dev" }),
      renderSvg({
        value: "https://qrdx.dev/q/Ab3dE9x",
        bgColor: "#111827",
        fgColor: "#f59e0b",
        imageSettings: {
          src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
          height: 24,
          width: 24,
          excavate: true,
        },
      }),
      ...FRAME_STYLES.map((style) =>
        renderSvg({
          value: "https://qrdx.dev",
          frame: { style, text: `Scan & "go" <${style}>` },
        })
      ),
    ];
    for (const markup of corpus) {
      expect(parseSvgMarkup(markup)).toEqual(legacyParse(markup).children[0]);
    }
  });

  it("on edge cases of the old grammar", () => {
    for (const markup of [
      "",
      "<",
      "<<<",
      "</",
      "</a",
      "</a >",
      "</a b>",
      "<a",
      "<a>",
      "<a/>",
      "<a />",
      "<a/ >",
      "<a b/c>",
      '<a b="/>">',
      "<a b='>'/>",
      '<a "b>',
      '<a"b c>',
      '<ab"c "d>',
      "<a'b'c\"d>e\">",
      "<a b=\"c'd\" e='f\"g'>",
      "<a b = 'c' d=e f='g'>",
      '<a b="&amp;&#x41;&#65;&#0;&#xD800;&bogus;">t&lt;</a>',
      "<!-->",
      "<!---->",
      "<!-- a --><b/>",
      "<!-- unclosed <b/>",
      "<!-- unclosed > <b/>",
      "<?>",
      "<?x?><b/>",
      "<?x <b/>",
      "<![CDATA[]]>",
      "<![CDATA[ <a> ]]>text",
      "<![CDATA[ unclosed <b/>",
      "<![CDATA[ unclosed > <b/>",
      "<!DOCTYPE x><b/>",
      "<! <b/>",
      "<a b='c' d=\"e\">",
      "<a\tb\n=\r'c'>",
      "x < y > z",
      "<a b='c' <d>",
      "<a <b> c>",
    ]) {
      expectSameParse(markup);
    }
  });

  it("on random markup", () => {
    // Deterministic fuzzing over the pieces the grammar cares about.
    let seed = 11;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pieces = [
      "<",
      ">",
      "/",
      "/>",
      "</",
      "!",
      "-",
      "<!--",
      "-->",
      "<?",
      "?>",
      "<![CDATA[",
      "]]>",
      "<!",
      '"',
      "'",
      "=",
      " ",
      "\n",
      " ",
      "a",
      "g",
      "svg",
      "x=",
      "&amp;",
      "&#x41;",
    ];
    for (let round = 0; round < 4000; round++) {
      let markup = "";
      const length = Math.floor(random() * 40);
      for (let i = 0; i < length; i++) {
        markup += pieces[Math.floor(random() * pieces.length)];
      }
      expectSameParse(markup);
    }
  });
});

describe("parseSvgMarkup on hostile input", () => {
  it("answers in linear time on inputs that made the regexes backtrack", () => {
    const inputs: [string, string][] = [
      ["unclosed comments", "<!--".repeat(50_000)],
      ["unclosed instructions", "<?".repeat(100_000)],
      ["unclosed CDATA", "<![CDATA[".repeat(20_000)],
      ["unclosed declarations", "<!".repeat(100_000)],
      ["open brackets", "<".repeat(200_000)],
      ["close-tag starts", "</".repeat(100_000)],
      [
        "close-tag starts before space",
        `${"</".repeat(50_000)}${" ".repeat(100_000)}`,
      ],
      ["unterminated tags", "<a ".repeat(60_000)],
      ["a long name and no >", `<${"a".repeat(200_000)}`],
      ["quotes in a name", `<${'a"'.repeat(100_000)} '>`],
      ["mixed quotes in a name", `<${"a\"b'".repeat(50_000)}>`],
      ["unclosed quotes", '<a "'.repeat(50_000)],
      ["an attribute name with no =", `<svg ${"!".repeat(200_000)}>`],
      ["names with = and no quote", `<svg ${"a= ".repeat(60_000)}>`],
      ["an unclosed attribute value", `<svg ${'a="b '.repeat(40_000)}>`],
    ];
    for (const [label, markup] of inputs) {
      const start = performance.now();
      parseSvgMarkup(markup);
      expect(performance.now() - start, label).toBeLessThan(200);
    }
  });

  it("still reads what it can around the noise", () => {
    expect(
      parseSvgMarkup(`${"<!--".repeat(10_000)} --><svg a="1"/>`)?.attrs
    ).toEqual({ a: "1" });
    expect(
      parseSvgMarkup(`<svg ${"!".repeat(10_000)} a="1" b='2'/>`)?.attrs
    ).toEqual({ a: "1", b: "2" });
  });
});
