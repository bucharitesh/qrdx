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
