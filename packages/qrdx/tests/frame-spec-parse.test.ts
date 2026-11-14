// The engine checks frame specs with parseFrameSpec (types/frame-spec-parse.ts)
// so drawing a frame never loads zod. It must agree with frameSpecSchema
// (zod) on everything: which specs pass, the parsed copy (keys in the
// schema's order), and for broken specs the same problems, paths and
// messages in the same order. Checked on every built-in, template and
// official spec, on every field of a varied set of specs broken in every
// way we can think of, and on seeded random damage.
import { describe, expect, it } from "vitest";
import { getFrameLayout } from "../src/frame";
import { importFrameSvg } from "../src/frame-import";
import { FrameSpecError } from "../src/frame-spec";
import { BUILT_IN_FRAME_SPECS } from "../src/frames/builtin";
import { OFFICIAL_FRAMES } from "../src/frames/official";
import { getAllTemplates } from "../src/templates";
import type { AnyQRFrame, FrameSpec } from "../types";
import { frameSpecSchema, getFrameSpecIssues } from "../types/frame-spec";
import {
  type FrameSpecIssue,
  frameSpecIssueText,
  parseFrameSpec,
} from "../types/frame-spec-parse";

/** What zod says about `input`, in the parser's terms. */
function zodResult(input: unknown) {
  const result = frameSpecSchema.safeParse(input);
  return result.success
    ? { success: true as const, data: result.data }
    : {
        success: false as const,
        issues: result.error.issues.map(
          ({ path, message }): FrameSpecIssue => ({
            path: path as (string | number)[],
            message,
          })
        ),
      };
}

/** Both verdicts, compared field for field (JSON keeps key order). */
function expectSame(input: unknown, label: string) {
  const zod = zodResult(input);
  const ours = parseFrameSpec(input);
  if (zod.success && ours.success) {
    expect(JSON.stringify(ours.data), label).toBe(JSON.stringify(zod.data));
    return;
  }
  expect(ours.success, label).toBe(zod.success);
  if (!(zod.success || ours.success)) {
    expect(ours.issues, label).toEqual(zod.issues);
  }
}

const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

const ALL_SPECS: [string, FrameSpec][] = [
  ...Object.entries(BUILT_IN_FRAME_SPECS).map(
    ([style, spec]) =>
      [`built-in ${style}`, spec as FrameSpec] as [string, FrameSpec]
  ),
  ...getAllTemplates()
    .filter((template) => template.spec)
    .map(
      (template) =>
        [`template ${template.id}`, template.spec as FrameSpec] as [
          string,
          FrameSpec,
        ]
    ),
  ...OFFICIAL_FRAMES.map(
    (frame) => [`official ${frame.id}`, frame.spec] as [string, FrameSpec]
  ),
];

/** A valid spec that sets every optional field the schema has. */
const EVERY_FIELD = {
  kind: "qrdx.frame",
  version: 1,
  artboard: { width: 1200, height: 1500 },
  qr: { x: 100, y: 100, size: 1000, padding: 80, radius: 20, plate: "opaque" },
  colors: {
    frame: "#111111",
    text: { mix: ["frame", "#ffffff"], amount: 0.9 },
    accent: "#2563eb",
  },
  shapes: [
    {
      type: "rect",
      x: 0,
      y: 0,
      width: 1200,
      height: 1500,
      radius: 40,
      fill: {
        gradient: {
          from: "frame",
          to: { mix: ["frame", "#ffffff"], amount: 0.25 },
          direction: "vertical",
          steps: 8,
        },
      },
      stroke: { color: "accent", width: 4 },
    },
    {
      type: "rect",
      x: 10,
      y: 1190,
      width: 1180,
      height: 300,
      hole: { x: 20, y: 1200, width: 1160, height: 280, radius: 10 },
      fill: "accent",
    },
    { type: "circle", cx: 600, cy: 1350, r: 60, hole: 30, fill: "#123456" },
    {
      type: "ellipse",
      cx: 300,
      cy: 1350,
      rx: 50,
      ry: 30,
      fill: "text",
      stroke: { color: "#fff", width: 2 },
    },
    {
      type: "polygon",
      points: [
        [900, 1300],
        [950, 1400],
        [850, 1400],
      ],
      fill: "frame",
    },
    {
      type: "path",
      d: "M1000 1300L1100 1300L1050 1400Z",
      fill: "frame",
      fillRule: "evenodd",
    },
    {
      type: "line",
      x1: 50,
      y1: 1450,
      x2: 1150,
      y2: 1450,
      width: 4,
      cap: "round",
      dash: [10, 10],
      fill: "text",
    },
    { type: "icon", icon: "star", x: 1100, y: 1400, size: 60, fill: "accent" },
  ],
  labels: [
    {
      type: "text",
      id: "cta",
      slot: "primary",
      text: "Scan me",
      maxLength: 12,
      color: "text",
      weight: "bold",
      collapse: { y: 1190, height: 100 },
      box: { x: 100, y: 1200, width: 1000, height: 80 },
      align: "start",
      fontSize: 40,
    },
    {
      type: "curved",
      id: "arc",
      slot: "secondary",
      text: "qrdx",
      color: { mix: ["frame", "accent"], amount: 0.5 },
      weight: "regular",
      curve: { cx: 600, cy: 1400, radius: 60, side: "bottom", spread: 120 },
      fontSize: 20,
    },
  ],
  bleed: "frame",
} as FrameSpec;

/** Specs that between them use every kind of shape, label, paint and option. */
function variedSpecs(): [string, FrameSpec][] {
  const features: [string, (spec: FrameSpec) => boolean][] = [
    ["rect hole", (s) => s.shapes.some((x) => x.type === "rect" && x.hole)],
    ["ring", (s) => s.shapes.some((x) => x.type === "circle" && x.hole)],
    ["ellipse", (s) => s.shapes.some((x) => x.type === "ellipse")],
    ["polygon", (s) => s.shapes.some((x) => x.type === "polygon")],
    ["path", (s) => s.shapes.some((x) => x.type === "path")],
    ["dashed line", (s) => s.shapes.some((x) => x.type === "line" && x.dash)],
    ["icon", (s) => s.shapes.some((x) => x.type === "icon")],
    ["stroke", (s) => s.shapes.some((x) => "stroke" in x && x.stroke)],
    [
      "gradient",
      (s) =>
        s.shapes.some(
          (x) => typeof x.fill === "object" && "gradient" in x.fill
        ),
    ],
    [
      "mix",
      (s) =>
        s.shapes.some((x) => typeof x.fill === "object" && "mix" in x.fill),
    ],
    ["curved label", (s) => s.labels.some((x) => x.type === "curved")],
    ["collapse", (s) => s.labels.some((x) => x.collapse)],
    ["text mix", (s) => typeof s.colors.text === "object"],
    ["bleed", (s) => s.bleed !== undefined],
    ["plate", (s) => s.qr.plate !== undefined],
  ];
  const picked = new Map<string, FrameSpec>();
  for (const [feature, has] of features) {
    const found = ALL_SPECS.find(([, spec]) => has(spec));
    if (found) {
      picked.set(found[0], found[1]);
    } else {
      throw new Error(`No spec uses ${feature}`);
    }
  }
  return [["every field", EVERY_FIELD], ...picked.entries()];
}

// Every JSON path in `value`, objects and arrays included
function paths(
  value: unknown,
  at: (string | number)[] = []
): (string | number)[][] {
  const found = [at];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      found.push(...paths(item, [...at, index]));
    });
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      found.push(...paths(item, [...at, key]));
    }
  }
  return found;
}

function setAt(root: unknown, path: (string | number)[], value: unknown) {
  if (path.length === 0) {
    return value === DELETE ? undefined : value;
  }
  const copy = clone(root) as Record<string | number, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1)) {
    node = node[key] as Record<string | number, unknown>;
  }
  const last = path.at(-1) as string | number;
  if (value === DELETE) {
    if (Array.isArray(node)) {
      node.splice(last as number, 1);
    } else {
      delete node[last];
    }
  } else {
    node[last] = value;
  }
  return copy;
}

const DELETE = Symbol("delete");
const BAD_VALUES: unknown[] = [
  DELETE,
  undefined,
  null,
  true,
  "",
  "x",
  "#zz",
  "#abcdef",
  "frame",
  "a".repeat(201),
  "M0 0L10 10Z",
  0,
  -1,
  2.5,
  0.0001,
  1.234_56,
  5000,
  -5000,
  2 ** 60,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  [],
  [1],
  [1, 2, 3],
  ["#000000", "#ffffff"],
  {},
  { extra: 1 },
  { mix: ["frame", "accent"], amount: 0.5 },
  { gradient: { from: "frame", to: "accent" } },
  // Fails both of a paint's options softly (an unknown key each)
  {
    mix: ["frame", "accent"],
    amount: 0.5,
    gradient: { from: "frame", to: "accent" },
  },
  { length: 300 },
  new Date(0),
  () => 0,
  // Lengths count code points: one emoji is two UTF-16 units
  "\u{1F600}",
  "\u{1F600}".repeat(150),
  "\u{1F600}".repeat(201),
];

describe("parseFrameSpec agrees with frameSpecSchema", () => {
  it("on a spec that sets every optional field", () => {
    expect(getFrameSpecIssues(EVERY_FIELD)).toEqual([]);
    expectSame(EVERY_FIELD, "every field");
  });

  it(`on every built-in, template and official spec (${ALL_SPECS.length})`, () => {
    expect(ALL_SPECS.length).toBeGreaterThan(1000);
    for (const [name, spec] of ALL_SPECS) {
      expectSame(spec, name);
      expect(parseFrameSpec(spec).success, name).toBe(true);
    }
  });

  it("on every field of varied specs, broken every way", () => {
    let cases = 0;
    for (const [name, spec] of variedSpecs()) {
      for (const path of paths(spec)) {
        for (const bad of BAD_VALUES) {
          expectSame(
            setAt(spec, path, bad),
            `${name} ${path.join(".")} = ${String(bad)}`
          );
          cases++;
        }
        const node = path.reduce<unknown>(
          (value, key) => (value as Record<string | number, unknown>)[key],
          spec
        );
        if (node && typeof node === "object" && !Array.isArray(node)) {
          // Unknown keys, own __proto__ included (as JSON.parse makes it)
          expectSame(
            setAt(spec, [...path, "onload"], "alert(1)"),
            `${name} ${path.join(".")}+onload`
          );
          const polluted = JSON.parse(
            JSON.stringify(spec).replace(/^\{/, '{"__proto__":{"x":1},')
          );
          expectSame(polluted, `${name} __proto__`);
          cases += 2;
          // Another kind of shape or label under the same fields
          if ("type" in node) {
            for (const type of [
              "rect",
              "circle",
              "ellipse",
              "polygon",
              "path",
              "line",
              "icon",
              "text",
              "curved",
              "image",
            ]) {
              expectSame(
                setAt(spec, [...path, "type"], type),
                `${name} ${path.join(".")} as ${type}`
              );
              cases++;
            }
          }
        }
        if (Array.isArray(node) && node.length > 0) {
          // Too many items, so the array fails before its items are read
          const many = Array.from({ length: 300 }, () => node[0]);
          expectSame(setAt(spec, path, many), `${name} ${path.join(".")} ×300`);
          expectSame(
            setAt(spec, path, [...node, ...node]),
            `${name} ${path.join(".")} ×2`
          );
          cases += 2;
        }
      }
    }
    expect(cases).toBeGreaterThan(20_000);
  });

  it("on seeded random damage", () => {
    let seed = 20_261_114;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(random() * items.length)] as T;
    const specs = ALL_SPECS.map(([, spec]) => spec);
    for (let i = 0; i < 3000; i++) {
      let spec: unknown = clone(pick(specs));
      // Up to four changes at once, so problems meet
      const changes = 1 + Math.floor(random() * 4);
      for (let j = 0; j < changes; j++) {
        const path = pick(paths(spec));
        const bad = pick(BAD_VALUES);
        spec = setAt(spec, path, bad);
      }
      expectSame(spec, `random ${i}`);
    }
  });

  it("on values that aren't specs at all", () => {
    for (const value of [
      undefined,
      null,
      0,
      "",
      "<svg/>",
      [],
      {},
      { kind: "qrdx.frame" },
      { kind: "qrdx.frame", version: 1 },
      Object.create(null),
      new Map(),
      // Keys read through the prototype, as zod reads them
      Object.assign(
        Object.create({ extra: 1 }),
        clone(OFFICIAL_FRAMES[2]?.spec)
      ),
      Object.assign(
        Object.create({ kind: "qrdx.frame", version: 1 }),
        (({ kind: _kind, version: _version, ...rest }) => rest)(
          clone(OFFICIAL_FRAMES[3]?.spec) as FrameSpec
        )
      ),
    ]) {
      expectSame(value, Object.prototype.toString.call(value));
    }
  });
});

describe("the engine without zod", () => {
  const custom = (spec: unknown) =>
    ({ style: "custom", spec }) as unknown as AnyQRFrame;

  it("refuses a broken spec with the problems getFrameSpecIssues lists", () => {
    const spec = clone(OFFICIAL_FRAMES[0]?.spec) as FrameSpec;
    const broken = {
      ...spec,
      qr: { ...spec.qr, size: -1 },
      shapes: [...spec.shapes, { type: "image", href: "x" }],
      extra: true,
    };
    let caught: unknown;
    try {
      getFrameLayout(300, custom(broken));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FrameSpecError);
    const issues = (caught as FrameSpecError).issues;
    expect(issues).toEqual(getFrameSpecIssues(broken));
    expect(issues.length).toBeGreaterThan(2);
    expect((caught as Error).message).toBe(
      `Invalid frame spec: ${issues.slice(0, 5).join("; ")}`
    );
  });

  it("formats issues as getFrameSpecIssues does", () => {
    const broken = { ...clone(OFFICIAL_FRAMES[1]?.spec), version: 2 };
    const result = parseFrameSpec(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(frameSpecIssueText)).toEqual(
        getFrameSpecIssues(broken)
      );
    }
  });

  it("imports an SVG into a spec that frameSpecSchema accepts", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150"><rect width="120" height="150" rx="8" fill="#1d4ed8"/><rect x="10" y="10" width="100" height="100" fill="#fff"/></svg>';
    const result = importFrameSvg(svg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getFrameSpecIssues(result.spec)).toEqual([]);
      expectSame(result.spec, "imported");
    }
  });
});
