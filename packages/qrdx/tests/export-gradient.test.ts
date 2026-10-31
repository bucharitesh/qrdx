/** biome-ignore-all lint/style/noMagicNumbers: sample points and tolerances */
// Gradient fills in the print exports. The PDF paints each gradient as a
// native shading in the page resources (ShadingType 2 axial / 3 radial with
// a Type 2 or a Type 3 stitching function) and the EPS with LanguageLevel 3
// `shfill`; both clip to each shape's exact outline. For linear and radial
// gradients with 2 and with 3+ stops on the body, the eyes and the eye
// centres, every case checks that:
// - the export holds the shadings with the SVG's stop colors and offsets;
// - colors sampled on body modules, eye rings (and the gap inside them) and
//   eye centres match the SVG rendered with real gradients;
// - the code decodes with jsQR from the rasterized export.
// CMYK, bleed (a gradient background continues into it), crop marks, the
// generic SVG features (objectBoundingBox, gradientTransform, href, focal
// point, evenodd, hard stops) and the unchanged solid output are covered too.
import { describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS, svgToEPS } from "../src/eps";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { parseColor, rgbToCmyk } from "../src/utils/parse-color";
import { renderPrintSVG } from "../src/utils/print-shared";
import type { LinearGradient, QRProps, RadialGradient } from "../types";
import {
  channelDistance,
  epsShadings,
  type PsDict,
  type PsValue,
  pixel,
  type Rendered,
  type RGB,
  rasterizeEps,
  rasterizePdf,
  readPdf,
  referenceGradients,
  renderSvgReference,
  svgGradientColorAt,
} from "./support/print-raster";
import { decodeQR } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const SIZE_MM = 50;
const POINTS_PER_MM = 72 / 25.4;
/** Raster resolution of every render, px per point (≈ 12 px per module) */
const SCALE = 3;
/** Per-channel difference allowed between the SVG and an export (0–255) */
const TOLERANCE = 3;
const RENDER_SIZE = 1000;

const BASE: QRProps = {
  value: VALUE,
  level: "M",
  margin: 4,
  bodyPattern: "circle",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

type Gradient = LinearGradient | RadialGradient;

const GRADIENTS: Record<string, Gradient> = {
  // Angle 0 also takes the eyes' per-corner default directions.
  "linear, 2 stops": {
    type: "linear",
    angle: 0,
    stops: [
      { color: "#1d4ed8", offset: 0 },
      { color: "#be185d", offset: 100 },
    ],
  },
  "linear, 3 stops": {
    type: "linear",
    angle: 135,
    stops: [
      { color: "#0f766e", offset: 10 },
      { color: "#1d4ed8", offset: 45 },
      { color: "#9d174d", offset: 90 },
    ],
  },
  "radial, 2 stops": {
    type: "radial",
    stops: [
      { color: "#7c3aed", offset: 0 },
      { color: "#111827", offset: 100 },
    ],
  },
  "radial, 4 stops": {
    type: "radial",
    stops: [
      { color: "#b45309", offset: 0 },
      { color: "#be185d", offset: 35 },
      { color: "#1d4ed8", offset: 70 },
      { color: "#0f172a", offset: 100 },
    ],
  },
};

const TARGETS = {
  body: "fgColor",
  eyes: "eyeColor",
  "eye centres": "dotColor",
} as const;
type Target = keyof typeof TARGETS;

// ── Geometry of the code (1000-unit print render) ──────────────────────────

const code = qrcodegen.QrCode.encodeText(VALUE, ERROR_LEVEL_MAP.M);
const MARGIN = BASE.margin as number;
const UNIT = RENDER_SIZE / (code.size + 2 * MARGIN);
const FINDERS: [number, number][] = [
  [0, 0],
  [code.size - 7, 0],
  [0, code.size - 7],
];
const inFinder = (x: number, y: number) =>
  FINDERS.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

/** Module (x, y) offsets → point in render units. */
const at = (x: number, y: number): [number, number] => [
  (x + MARGIN) * UNIT,
  (y + MARGIN) * UNIT,
];

/**
 * Points to compare per target (`painted` ones lie on its shapes, the rest
 * in gaps), and how many shapes it paints.
 */
function samplesFor(target: Target): {
  points: [number, number][];
  painted: [number, number][];
  shapes: number;
} {
  if (target === "body") {
    const points: [number, number][] = [];
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (code.getModule(x, y) && !inFinder(x, y)) {
          points.push(at(x + 0.5, y + 0.5));
        }
      }
    }
    return { points, painted: points, shapes: points.length };
  }
  const offsets: [number, number][] =
    target === "eyes"
      ? [
          // The ring, its corners, and the light gap inside it (evenodd)
          [0.5, 3.5],
          [3.5, 0.5],
          [6.5, 3.5],
          [3.5, 6.5],
          [0.5, 0.5],
          [6.5, 6.5],
        ]
      : [
          [3.5, 3.5],
          [2.5, 2.5],
          [4.5, 4.5],
          [2.5, 4.5],
          [4.5, 2.5],
        ];
  const inFinders = (list: [number, number][]) =>
    FINDERS.flatMap(([fx, fy]) => list.map(([dx, dy]) => at(fx + dx, fy + dy)));
  const painted = inFinders(offsets);
  // The light ring between eye and centre: evenodd must leave it unpainted.
  const gaps = inFinders([
    [1.5, 3.5],
    [3.5, 5.5],
  ]);
  return {
    points: [...painted, ...gaps],
    painted,
    shapes: FINDERS.length,
  };
}

const PX_PER_UNIT = (SIZE_MM * POINTS_PER_MM * SCALE) / RENDER_SIZE;
const toPx = ([x, y]: [number, number]): [number, number] => [
  x * PX_PER_UNIT,
  y * PX_PER_UNIT,
];

const rgbOf = (color: string): RGB => {
  const c = parseColor(color);
  if (!c) throw new Error(`Bad color ${color}`);
  return [c.r, c.g, c.b];
};

/** Sampled points where `image` is off the reference by more than `tolerance`. */
function mismatches(
  reference: { image: Rendered["image"] },
  image: Rendered["image"],
  points: [number, number][],
  tolerance = TOLERANCE
) {
  return points
    .map((point) => {
      const [x, y] = toPx(point);
      const expected = pixel(reference.image, x, y);
      const actual = pixel(image, x, y);
      return {
        point,
        expected,
        actual,
        off: channelDistance(expected, actual),
      };
    })
    .filter((sample) => sample.off > tolerance);
}

// ── Shading structure ──────────────────────────────────────────────────────

const numbers = (value: PsValue | undefined) =>
  (Array.isArray(value) ? value : []).map((v) =>
    typeof v === "number" ? v : Number.NaN
  );

/**
 * The function pieces the stops call for: a held color before the first
 * stop and after the last, a blend between each pair of distinct offsets.
 */
function expectedPieces(gradient: Gradient) {
  const stops = gradient.stops.map((stop) => ({
    t: stop.offset / 100,
    color: rgbOf(stop.color).map((v) => v / 255),
  }));
  const first = stops[0] as (typeof stops)[number];
  const last = stops.at(-1) as (typeof stops)[number];
  const pieces: { from: number; c0: number[]; c1: number[] }[] = [];
  if (first.t > 0) pieces.push({ from: 0, c0: first.color, c1: first.color });
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i] as (typeof stops)[number];
    const b = stops[i + 1] as (typeof stops)[number];
    if (b.t > a.t) pieces.push({ from: a.t, c0: a.color, c1: b.color });
  }
  if (last.t < 1) pieces.push({ from: last.t, c0: last.color, c1: last.color });
  return pieces;
}

/** Components that differ from `expected` by more than 0.001, as text. */
function colorProblems(label: string, actual: PsValue, expected: number[]) {
  const values = numbers(actual);
  const off =
    values.length !== expected.length ||
    values.some((v, k) => !(Math.abs(v - (expected[k] as number)) <= 1e-3));
  return off ? [`${label} ${values.join(" ")} ≠ ${expected.join(" ")}`] : [];
}

/**
 * How a shading differs from the gradient's stops: its type, Extend, a
 * Type 2 function for one piece or a Type 3 stitching function with the
 * stop offsets as Bounds, and every piece's colors in `space`.
 */
function shadingProblems(
  shading: PsDict,
  gradient: Gradient,
  space: "rgb" | "cmyk" = "rgb"
): string[] {
  const problems: string[] = [];
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`
      );
    }
  };
  check(
    "ShadingType",
    shading.get("ShadingType"),
    gradient.type === "linear" ? 2 : 3
  );
  check(
    "ColorSpace",
    (shading.get("ColorSpace") as { value: string } | undefined)?.value,
    space === "cmyk" ? "DeviceCMYK" : "DeviceRGB"
  );
  check("Extend", shading.get("Extend"), [true, true]);
  const fn = shading.get("Function") as PsDict;
  const pieces = expectedPieces(gradient);
  check("FunctionType", fn.get("FunctionType"), pieces.length === 1 ? 2 : 3);
  const parts = pieces.length === 1 ? [fn] : (fn.get("Functions") as PsDict[]);
  if (pieces.length > 1) {
    check(
      "Bounds",
      numbers(fn.get("Bounds")),
      pieces.slice(1).map((p) => p.from)
    );
    check(
      "Encode",
      numbers(fn.get("Encode")),
      pieces.flatMap(() => [0, 1])
    );
  }
  check("pieces", parts?.length, pieces.length);
  const convert = (rgb: number[]) =>
    space === "cmyk"
      ? rgbToCmyk(...(rgb.map((v) => v * 255) as [number, number, number]))
      : rgb;
  pieces.forEach((piece, i) => {
    const part = parts?.[i];
    if (!part) return;
    check(`piece ${i} FunctionType`, part.get("FunctionType"), 2);
    check(`piece ${i} N`, part.get("N"), 1);
    problems.push(
      ...colorProblems(
        `piece ${i} C0`,
        part.get("C0") ?? null,
        convert(piece.c0)
      ),
      ...colorProblems(
        `piece ${i} C1`,
        part.get("C1") ?? null,
        convert(piece.c1)
      )
    );
  });
  return problems;
}

// ── Cases ──────────────────────────────────────────────────────────────────

const references = new Map<
  string,
  Promise<{ svg: string; image: Rendered["image"] }>
>();

/** The SVG the exporters convert, rendered with real gradients. */
function reference(props: QRProps) {
  const key = JSON.stringify(props);
  let entry = references.get(key);
  if (!entry) {
    entry = renderPrintSVG(props).then((svg) => ({
      svg,
      image: renderSvgReference(svg, SIZE_MM * POINTS_PER_MM * SCALE),
    }));
    references.set(key, entry);
  }
  return entry;
}

const CASES = (Object.keys(TARGETS) as Target[]).flatMap((target) =>
  Object.entries(GRADIENTS).map(([label, gradient]) => ({
    target,
    label,
    gradient,
  }))
);

describe.each(CASES)("$label on the $target", ({ target, gradient }) => {
  const props: QRProps = { ...BASE, [TARGETS[target]]: gradient };
  const { points, painted, shapes } = samplesFor(target);

  it("samples points where the SVG shows the gradient", async () => {
    const { image } = await reference(props);
    const first = rgbOf(gradient.stops[0]?.color as string);
    // Flattened to the first stop, the export would miss most samples.
    const spread = Math.max(
      ...painted.map((point) =>
        channelDistance(pixel(image, ...toPx(point)), first)
      )
    );
    expect(spread).toBeGreaterThan(20);
  });

  it("PDF shades it like the SVG and decodes", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props, {
      size: SIZE_MM,
      unit: "mm",
    });
    const pdf = readPdf(buffer);
    const shadings = [...pdf.shadings.values()] as PsDict[];
    // Body modules share one shading; each eye has its own geometry.
    expect(shadings).toHaveLength(target === "body" ? 1 : FINDERS.length);
    expect(shadings.flatMap((s) => shadingProblems(s, gradient))).toEqual([]);
    const rendered = rasterizePdf(buffer, SCALE);
    expect(rendered.shadings.length).toBeGreaterThanOrEqual(shapes);
    const ref = await reference(props);
    expect(mismatches(ref, rendered.image, points)).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });

  it("EPS shades it like the SVG and decodes", async () => {
    const eps = await getQRAsEPS(props, { sizeMm: SIZE_MM });
    expect(eps).toContain("%%LanguageLevel: 3");
    const shadings = [...epsShadings(eps).values()] as PsDict[];
    expect(shadings).toHaveLength(target === "body" ? 1 : FINDERS.length);
    expect(shadings.flatMap((s) => shadingProblems(s, gradient))).toEqual([]);
    const rendered = rasterizeEps(eps, SCALE);
    expect(rendered.shadings.length).toBeGreaterThanOrEqual(shapes);
    const ref = await reference(props);
    expect(mismatches(ref, rendered.image, points)).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });
});

// ── Color mode, bleed, crop marks ──────────────────────────────────────────

const LINEAR = GRADIENTS["linear, 2 stops"] as Gradient;
const RADIAL_BACKGROUND: Gradient = {
  type: "radial",
  stops: [
    { color: "#ffffff", offset: 0 },
    { color: "#c7d2fe", offset: 100 },
  ],
};

describe("CMYK", () => {
  const props: QRProps = { ...BASE, fgColor: LINEAR, eyeColor: "#0f172a" };
  const { points } = samplesFor("body");
  // Blending between the converted stops strays from converting the blended
  // RGB by a few levels; the conversion's own rounding adds about one.
  const CMYK_TOLERANCE = 12;

  it("PDF shades in DeviceCMYK, like its solid fills", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props, {
      size: SIZE_MM,
      colorMode: "cmyk",
    });
    const pdf = readPdf(buffer);
    expect(pdf.shadings.size).toBe(1);
    expect(
      shadingProblems(pdf.shadings.get("Sh0") as PsDict, LINEAR, "cmyk")
    ).toEqual([]);
    // Solid eyes still use the CMYK fill operator.
    expect(pdf.content).toMatch(/(^|\s)[\d.]+ [\d.]+ [\d.]+ [\d.]+ k(\s|$)/m);
    expect(pdf.content).not.toMatch(/(^|\s)[\d.]+ [\d.]+ [\d.]+ rg(\s|$)/m);
    const rendered = rasterizePdf(buffer, SCALE);
    expect(
      mismatches(await reference(props), rendered.image, points, CMYK_TOLERANCE)
    ).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });

  it("EPS shades in DeviceCMYK, like its solid fills", async () => {
    const eps = await getQRAsEPS(props, {
      sizeMm: SIZE_MM,
      colorMode: "cmyk",
    });
    const shadings = epsShadings(eps);
    expect(shadings.size).toBe(1);
    expect(
      shadingProblems(shadings.get("Sh0") as PsDict, LINEAR, "cmyk")
    ).toEqual([]);
    const rendered = rasterizeEps(eps, SCALE);
    expect(
      mismatches(await reference(props), rendered.image, points, CMYK_TOLERANCE)
    ).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });
});

describe("bleed and crop marks", () => {
  const props: QRProps = {
    ...BASE,
    fgColor: LINEAR,
    bgColor: RADIAL_BACKGROUND,
  };
  const BLEED_MM = 3;
  const MM_PER_UNIT = SIZE_MM / RENDER_SIZE;

  /** Expected color at a point of the background's user space (outside it). */
  async function backgroundAt(point: [number, number]): Promise<RGB> {
    const { svg } = await reference(props);
    const id = /<rect fill="url\(#([^)]+)\)"/.exec(svg)?.[1] as string;
    const gradient = referenceGradients(svg).get(id);
    if (!gradient) throw new Error("No background gradient");
    return svgGradientColorAt(gradient, point, [RENDER_SIZE, RENDER_SIZE], {
      x: 0,
      y: 0,
      width: RENDER_SIZE,
      height: RENDER_SIZE,
    });
  }

  /** Bleed points (render units, outside the trim) and the trim offset. */
  const BLEED_POINTS: [number, number][] = [
    [-30, 500], // left edge, middle
    [500, -30], // top edge, middle
    [-40, -40], // corner
    [1030, 900], // right edge, low
  ];

  /** Bleed points whose color is not the background gradient's. */
  async function bleedMisses(image: Rendered["image"], trimMm: number) {
    const misses: unknown[] = [];
    for (const point of BLEED_POINTS) {
      const expected = await backgroundAt(point);
      const x = (trimMm + point[0] * MM_PER_UNIT) * POINTS_PER_MM * SCALE;
      const y = (trimMm + point[1] * MM_PER_UNIT) * POINTS_PER_MM * SCALE;
      const actual = pixel(image, x, y);
      if (channelDistance(expected, actual) > TOLERANCE) {
        misses.push({ point, expected, actual });
      }
    }
    return misses;
  }

  it("PDF continues a gradient background into the bleed, inside crop marks", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props, {
      size: SIZE_MM,
      bleed: BLEED_MM,
      cropMarks: true,
    });
    const pdf = readPdf(buffer);
    // Trim + bleed + gap and mark length (2 + 5 mm) + 1 mm on each side
    const slug = BLEED_MM + 2 + 5 + 1;
    expect(pdf.mediaBox[0]).toBeCloseTo(
      (SIZE_MM + 2 * slug) * POINTS_PER_MM,
      1
    );
    // Eight crop-mark strokes after the artwork
    expect(pdf.content.match(/ l\nS/g)?.length).toBe(8);
    expect([...pdf.shadings.values()].map((s) => s.get("ShadingType"))).toEqual(
      [3, 2]
    );
    const rendered = rasterizePdf(buffer, SCALE);
    expect(await bleedMisses(rendered.image, slug)).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });

  it("EPS continues a gradient background into the bleed", async () => {
    const eps = await getQRAsEPS(props, { sizeMm: SIZE_MM, bleedMm: BLEED_MM });
    const side = Math.ceil((SIZE_MM + 2 * BLEED_MM) * POINTS_PER_MM);
    expect(eps).toContain(`%%BoundingBox: 0 0 ${side} ${side}`);
    const rendered = rasterizeEps(eps, SCALE);
    expect(await bleedMisses(rendered.image, BLEED_MM)).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });

  it("keeps a solid bleed for a solid background", async () => {
    const solid = { ...props, bgColor: "#fef3c7" };
    const eps = await getQRAsEPS(solid, { sizeMm: SIZE_MM, bleedMm: BLEED_MM });
    const pdf = readPdf(
      await getQRAsPrintPDFBuffer(solid, { size: SIZE_MM, bleed: BLEED_MM })
    );
    // The bleed is one solid rectangle before the artwork.
    expect(eps).toMatch(/^0\.996 0\.953 0\.78 rg n 0 0 m /m);
    expect(pdf.content).toMatch(/re\nf\n/);
    expect(pdf.shadings.size).toBe(1);
  });
});

// ── Solid colors ───────────────────────────────────────────────────────────

describe("solid colors", () => {
  const props: QRProps = {
    ...BASE,
    fgColor: "#1d4ed8",
    eyeColor: { type: "solid", color: "#be185d" },
    bgColor: "#fef3c7",
  };

  it.each([
    "rgb",
    "cmyk",
  ] as const)("write no shadings in %s mode", async (colorMode) => {
    const eps = await getQRAsEPS(props, { colorMode, bleedMm: 2 });
    expect(eps).toContain("%%LanguageLevel: 2");
    expect(eps).not.toMatch(/shfill|ShadingType/);
    const pdf = readPdf(
      await getQRAsPrintPDFBuffer(props, {
        size: SIZE_MM,
        colorMode,
        bleed: 2,
        cropMarks: true,
      })
    );
    expect(pdf.text).not.toContain("/Shading");
    expect(pdf.content).not.toMatch(/ sh(\s|$)/);
    expect(pdf.content).not.toMatch(/(^|\s)W\*?(\s|$)/);
  });
});

// ── Generic SVG gradients (svgToEPS) ───────────────────────────────────────

describe("svgToEPS gradient geometry", () => {
  // objectBoundingBox (the default) with gradientTransform and stops through
  // href; a focal radial; a user-space radial squashed by gradientTransform
  // on an evenodd frame; a user-space linear inside a scaled group (its user
  // space is the group's); a hard stop (two stops at one offset).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff0000"/><stop offset="0.5" stop-color="#00ff00"/><stop offset="1" stop-color="#0000ff"/>
    </linearGradient>
    <linearGradient id="turned" href="#base" gradientTransform="rotate(40 0.5 0.5)"/>
    <radialGradient id="focal" cx="0.5" cy="0.5" r="0.5" fx="0.3" fy="0.35">
      <stop offset="20%" stop-color="#ffff00"/><stop offset="90%" stop-color="#000080"/>
    </radialGradient>
    <radialGradient id="squashed" gradientUnits="userSpaceOnUse" cx="250" cy="50" r="45" gradientTransform="translate(250 50) scale(1 0.6) translate(-250 -50)">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#7c2d12"/>
    </radialGradient>
    <linearGradient id="local" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0">
      <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="hard">
      <stop offset="0" stop-color="#dc2626"/><stop offset="0.5" stop-color="#dc2626"/><stop offset="0.5" stop-color="#2563eb"/><stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect x="5" y="5" width="90" height="90" fill="url(#turned)"/>
  <g transform="translate(100 0)"><circle cx="50" cy="50" r="45" fill="url(#focal)"/></g>
  <path fill-rule="evenodd" fill="url(#squashed)" d="M205 5 h90 v90 h-90 z M225 25 v50 h50 v-50 z"/>
  <g transform="translate(300 0) scale(0.5)"><rect x="10" y="10" width="180" height="90" fill="url(#local)"/></g>
  <rect x="305" y="60" width="90" height="35" fill="url(#hard)"/>
</svg>`;
  const width = 800;

  /** A grid of points well inside each shape (render units). */
  const POINTS: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const u = 15 + i * 8.75;
      const v = 15 + j * 8.75;
      POINTS.push([u, v]); // turned rect
      if (Math.hypot(u - 50, v - 50) < 40) POINTS.push([100 + u, v]); // circle
      if (!(u > 20 && u < 80 && v > 20 && v < 80)) POINTS.push([200 + u, v]); // frame
    }
  }
  for (const u of [310, 330, 350, 370, 390]) {
    POINTS.push([u, 10], [u, 30], [u, 45]); // scaled group
  }
  POINTS.push([315, 78], [340, 78], [360, 78], [385, 78]); // hard stop
  const HOLE: [number, number][] = [
    [250, 50],
    [235, 35],
    [265, 65],
  ];

  it("matches the SVG for every gradient feature", async () => {
    const eps = await svgToEPS(svg, { width: width * 0.75 });
    expect(eps).toContain("%%LanguageLevel: 3");
    expect(epsShadings(eps).size).toBe(5);
    expect(eps).toContain(" eoclip n ");
    const scale = 1 / 0.75; // px per point, so the raster is `width` px
    const rendered = rasterizeEps(eps, scale);
    const ref = renderSvgReference(svg, width);
    const misses = [...POINTS, ...HOLE]
      .map((point) => {
        const x = point[0] * 2;
        const y = point[1] * 2;
        const expected = pixel(ref, x, y);
        const actual = pixel(rendered.image, x, y);
        return {
          point,
          expected,
          actual,
          off: channelDistance(expected, actual),
        };
      })
      .filter((sample) => sample.off > TOLERANCE);
    expect(misses).toEqual([]);
    // The evenodd hole stays unpainted.
    for (const [x, y] of HOLE) {
      expect(pixel(rendered.image, x * 2, y * 2)).toEqual([255, 255, 255]);
    }
    // Hard stop: solid on each side of the edge.
    expect(
      channelDistance(pixel(rendered.image, 315 * 2, 78 * 2), rgbOf("#dc2626"))
    ).toBeLessThanOrEqual(1);
    expect(
      channelDistance(pixel(rendered.image, 385 * 2, 78 * 2), rgbOf("#2563eb"))
    ).toBeLessThanOrEqual(1);
  });

  it("paints degenerate gradients as SVG does", async () => {
    const degenerate = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="10">
  <defs>
    <linearGradient id="point" x1="0.5" x2="0.5"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
    <radialGradient id="zero" r="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#00ff00"/></radialGradient>
    <linearGradient id="single"><stop offset="0.3" stop-color="#123456"/></linearGradient>
    <linearGradient id="empty"/>
  </defs>
  <rect width="10" height="10" fill="url(#point)"/>
  <rect x="10" width="10" height="10" fill="url(#zero)"/>
  <rect x="20" width="10" height="10" fill="url(#single)"/>
  <rect x="30" width="10" height="10" fill="url(#empty)"/>
</svg>`;
    const eps = await svgToEPS(degenerate);
    // Zero-length vector and zero radius: the last stop; one stop: its color;
    // no stops: no paint. None of them needs a shading.
    expect(eps).not.toContain("shfill");
    expect(eps).toContain("%%LanguageLevel: 2");
    expect(eps).toContain("0 0 1 rg n 0 10 m");
    expect(eps).toContain("0 1 0 rg n 10 10 m");
    expect(eps).toContain("0.071 0.204 0.337 rg n 20 10 m");
    expect(eps).not.toContain("n 30 10 m");
  });
});
