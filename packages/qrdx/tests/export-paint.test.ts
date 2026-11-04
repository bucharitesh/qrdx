/** biome-ignore-all lint/style/noMagicNumbers: sample points and tolerances */
// Angular (conic) gradients and see-through colors in every output.
// - Angular: SVG draws a fan of wedges in a <pattern>; the PDF and EPS paint
//   the wedges each shape needs inside its clip. Colors sampled on the code
//   match the conic formula, every export matches the SVG and decodes.
// - Alpha: the SVG splits it into fill-opacity / stop-opacity, the PDF keeps
//   it (ExtGState /ca), the EPS flattens it over the background (PostScript
//   has no transparency). All three agree pixel for pixel and decode.
import { describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS } from "../src/eps";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { getScanContrast } from "../src/scan-score";
import {
  angularSpan,
  arcsOverlap,
  colorAt,
  conicWedges,
  parseStops,
  splitAlpha,
} from "../src/utils/paint";
import { parseColor } from "../src/utils/parse-color";
import { renderPrintSVG } from "../src/utils/print-shared";
import {
  type AngularGradient,
  colorConfigSchema,
  getNormalizedColor,
  type QRProps,
} from "../types";
import {
  channelDistance,
  pixel,
  type RGB,
  rasterizeEps,
  rasterizePdf,
  readPdf,
} from "./support/print-raster";
import { capture, renderSvg } from "./support/qr";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const SIZE_MM = 50;
const POINTS_PER_MM = 72 / 25.4;
const SCALE = 3;
const RENDER_SIZE = 1000;
const PAGE_PX = SIZE_MM * POINTS_PER_MM * SCALE;
const PX_PER_UNIT = PAGE_PX / RENDER_SIZE;

const BASE: QRProps = {
  value: VALUE,
  level: "M",
  margin: 4,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

const SWEEP: AngularGradient = {
  type: "angular",
  angle: 30,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#7c3aed", offset: 40 },
    { color: "#0f766e", offset: 75 },
    { color: "#1d4ed8", offset: 100 },
  ],
};

const code = qrcodegen.QrCode.encodeText(VALUE, ERROR_LEVEL_MAP.M);
const MARGIN = 4;
const UNIT = RENDER_SIZE / (code.size + 2 * MARGIN);
const FINDERS: [number, number][] = [
  [0, 0],
  [code.size - 7, 0],
  [0, code.size - 7],
];
const inFinder = (x: number, y: number) =>
  FINDERS.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
const at = (x: number, y: number): [number, number] => [
  (x + MARGIN) * UNIT,
  (y + MARGIN) * UNIT,
];

/** Centres of the body's dark modules and of its light gaps, in render units. */
function bodyPoints() {
  const dark: [number, number][] = [];
  const light: [number, number][] = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (inFinder(x, y)) continue;
      (code.getModule(x, y) ? dark : light).push(at(x + 0.5, y + 0.5));
    }
  }
  return { dark, light };
}

/** Points on the three eye rings, and the eyes' centres. */
function eyePoints() {
  const ring: [number, number][] = [];
  const centre: [number, number][] = [];
  for (const [fx, fy] of FINDERS) {
    for (const [dx, dy] of [
      [0.5, 3.5],
      [3.5, 0.5],
      [6.5, 3.5],
      [3.5, 6.5],
      [0.5, 0.5],
      [6.5, 6.5],
    ] as const) {
      ring.push(at(fx + dx, fy + dy));
    }
    centre.push(at(fx + 3.5, fy + 3.5));
  }
  return { ring, centre };
}

const rgbOf = (color: string): RGB => {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Bad color ${color}`);
  return [parsed.r, parsed.g, parsed.b];
};

/** The conic formula: the color at (x, y) for a sweep around (cx, cy). */
function conicColor(
  gradient: AngularGradient,
  [x, y]: [number, number],
  [cx, cy]: [number, number]
): RGB {
  // Clockwise from 12 o'clock (SVG's y points down)
  const fromTop = (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  const t = ((((fromTop - (gradient.angle ?? 0)) % 360) + 360) % 360) / 360;
  const color = colorAt(parseStops(gradient.stops), t);
  return [color.r, color.g, color.b];
}

const toPx = ([x, y]: [number, number]): [number, number] => [
  x * PX_PER_UNIT,
  y * PX_PER_UNIT,
];

async function svgRaster(props: QRProps) {
  return rasterizeSvg(await renderPrintSVG(props), { width: PAGE_PX });
}

/** Points where `image` differs from `reference` by more than `tolerance`. */
function mismatches(
  reference: { data: Uint8ClampedArray; width: number },
  image: { data: Uint8ClampedArray; width: number },
  points: [number, number][],
  tolerance = 3
) {
  return points
    .map((point) => {
      const [x, y] = toPx(point);
      const expected = pixel(reference as never, x, y);
      const actual = pixel(image as never, x, y);
      return {
        point,
        expected,
        actual,
        off: channelDistance(expected, actual),
      };
    })
    .filter((sample) => sample.off > tolerance);
}

// ── The wedge fan ──────────────────────────────────────────────────────────

describe("conicWedges", () => {
  it("covers the full turn in thin wedges, colored at their middle", () => {
    const { wedges, opacity } = conicWedges(
      SWEEP.stops,
      SWEEP.angle,
      0,
      0,
      100
    );
    expect(opacity).toBeUndefined();
    expect(wedges.length).toBeGreaterThan(90);
    expect(wedges.length).toBeLessThanOrEqual(720);
    // Each wedge reaches one width into the next (the first also one back),
    // so without the overlaps they tile the turn exactly.
    const widths = wedges.map((wedge, index) =>
      index === 0
        ? wedge.sweep / 3
        : index === wedges.length - 1
          ? wedge.sweep
          : wedge.sweep / 2
    );
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(360, 1);
    for (const wedge of wedges) {
      expect(wedge.sweep).toBeLessThanOrEqual(12 + 1e-6);
      expect(wedge.opacity).toBeUndefined();
    }
    // The second wedge starts where the first one's own span ends; the
    // first one's own span starts where the sweep starts: 30° past
    // 12 o'clock is 300° from +x (SVG angles, clockwise).
    const first = wedges[0] as (typeof wedges)[number];
    expect((first.from + first.sweep / 3) % 360).toBeCloseTo(300, 3);
    // Colored at its middle: a level off the first stop at most
    expect(
      channelDistance(rgbOf(first.color), rgbOf("#1d4ed8"))
    ).toBeLessThanOrEqual(2);
  });

  it("uses more wedges where the color changes faster", () => {
    const { wedges: flat } = conicWedges(
      [
        { color: "#334155", offset: 0 },
        { color: "#334155", offset: 100 },
      ],
      0,
      0,
      0,
      10
    );
    const { wedges: steep } = conicWedges(
      [
        { color: "#000000", offset: 0 },
        { color: "#ffffff", offset: 100 },
      ],
      0,
      0,
      0,
      10
    );
    // 4° at most per wedge, whatever the color does
    expect(flat).toHaveLength(90);
    // 255 levels at 2 per wedge
    expect(steep).toHaveLength(128);
  });

  it("draws one shared alpha as a group, mixed alphas wedge by wedge", () => {
    const shared = conicWedges(
      [
        { color: "#1d4ed880", offset: 0 },
        { color: "#7c3aed80", offset: 100 },
      ],
      0,
      0,
      0,
      10
    );
    expect(shared.opacity).toBe(0.502);
    expect(shared.wedges.every((wedge) => wedge.opacity === undefined)).toBe(
      true
    );
    const mixed = conicWedges(
      [
        { color: "#1d4ed8", offset: 0 },
        { color: "#1d4ed800", offset: 100 },
      ],
      0,
      0,
      0,
      10
    );
    expect(mixed.opacity).toBeUndefined();
    // Edge to edge, so nothing is painted twice
    const total = mixed.wedges.reduce((sum, wedge) => sum + wedge.sweep, 0);
    expect(total).toBeCloseTo(360, 2);
    expect(mixed.wedges.at(-1)?.opacity).toBeLessThan(0.05);
  });

  it("finds the arc a box covers and which wedges meet it", () => {
    // A box right of the centre covers a narrow arc around 0°
    const span = angularSpan(0, 0, { x: 10, y: -1, width: 2, height: 2 });
    expect(span).not.toBeNull();
    const [low, high] = span as [number, number];
    expect(high - low).toBeLessThan(12);
    expect(arcsOverlap([358, 362], span as [number, number])).toBe(true);
    expect(arcsOverlap([90, 94], span as [number, number])).toBe(false);
    // The centre inside the box: every direction
    expect(angularSpan(0, 0, { x: -1, y: -1, width: 2, height: 2 })).toBeNull();
  });
});

describe("angular gradient type", () => {
  it("validates and previews as a CSS conic gradient", () => {
    expect(colorConfigSchema.safeParse(SWEEP).success).toBe(true);
    expect(getNormalizedColor(SWEEP)).toBe(
      "conic-gradient(from 30deg, #1d4ed8 0%, #7c3aed 40%, #0f766e 75%, #1d4ed8 100%)"
    );
    // The engine's linear 0° runs left to right, which is CSS's 90deg.
    expect(
      getNormalizedColor({
        type: "linear",
        angle: 0,
        stops: [
          { color: "#000000", offset: 0 },
          { color: "#ffffff", offset: 100 },
        ],
      })
    ).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
  });
});

// ── Angular in every output ────────────────────────────────────────────────

const CENTRE: [number, number] = [RENDER_SIZE / 2, RENDER_SIZE / 2];

describe.each([
  {
    name: "body",
    props: {
      ...BASE,
      fgColor: SWEEP,
      eyeColor: "#0f172a",
      dotColor: "#0f172a",
    },
    points: () => bodyPoints().dark,
    centreOf: () => CENTRE,
  },
  {
    name: "background",
    props: {
      ...BASE,
      bgColor: {
        ...SWEEP,
        stops: [
          { color: "#ffffff", offset: 0 },
          { color: "#e0e7ff", offset: 50 },
          { color: "#ffffff", offset: 100 },
        ],
      } satisfies AngularGradient,
    },
    points: () => bodyPoints().light,
    centreOf: () => CENTRE,
  },
  {
    name: "eyes",
    props: { ...BASE, eyeColor: SWEEP },
    points: () => eyePoints().ring,
    centreOf: (point: [number, number]) => {
      // Each eye sweeps around its own centre
      const eye = FINDERS.map(([fx, fy]) => at(fx + 3.5, fy + 3.5)).sort(
        (a, b) =>
          Math.hypot(a[0] - point[0], a[1] - point[1]) -
          Math.hypot(b[0] - point[0], b[1] - point[1])
      )[0];
      return eye as [number, number];
    },
  },
] as const)("angular $name", ({ props, points, centreOf }) => {
  const gradient =
    ("fgColor" in props && props.fgColor) ||
    ("bgColor" in props && props.bgColor) ||
    ("eyeColor" in props && props.eyeColor);
  const sweep = gradient as AngularGradient;

  it("SVG draws a wedge pattern with the conic colors", async () => {
    const svg = await renderPrintSVG(props);
    expect(svg).toMatch(/<pattern[^>]*data-qrdx-conic=/);
    expect(svg).toMatch(/fill="url\(#[^)]+\)"/);
    const image = await svgRaster(props);
    const off = points()
      .map((point) => {
        const [x, y] = toPx(point);
        const expected = conicColor(sweep, point, centreOf(point));
        const actual = pixel(image as never, x, y);
        return {
          point,
          expected,
          actual,
          d: channelDistance(expected, actual),
        };
      })
      // Points within two modules of the centre see a wide arc of colors
      // across one pixel
      .filter(
        (sample) =>
          Math.hypot(
            sample.point[0] - centreOf(sample.point)[0],
            sample.point[1] - centreOf(sample.point)[1]
          ) >
            2 * UNIT && sample.d > 3
      );
    expect(off).toEqual([]);
    expect(decodeQR(image)).toBe(VALUE);
  });

  it("PDF paints the same wedges inside each shape and decodes", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props, { size: SIZE_MM });
    const rendered = rasterizePdf(buffer, SCALE);
    const reference = await svgRaster(props);
    expect(mismatches(reference, rendered.image, points())).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    // Culling: far fewer fills than every wedge for every module
    expect(rendered.fills.length).toBeLessThan(40_000);
  });

  it("EPS paints the same wedges inside each shape and decodes", async () => {
    const eps = await getQRAsEPS(props, { sizeMm: SIZE_MM });
    const rendered = rasterizeEps(eps, SCALE);
    const reference = await svgRaster(props);
    expect(mismatches(reference, rendered.image, points())).toEqual([]);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });
});

describe("angular codes decode at several sizes", () => {
  it.each([3, 5, 8])("through the camera at %i px per module", (modulePx) => {
    for (const props of [
      { ...BASE, fgColor: SWEEP },
      { ...BASE, eyeColor: SWEEP, dotColor: SWEEP },
    ]) {
      expect(capture(props, { modulePx })).toBe(VALUE);
    }
  });
});

// ── Alpha ──────────────────────────────────────────────────────────────────

const SEE_THROUGH = "#1d4ed8cc"; // 80%
const BACKGROUND = "#fef3c7";

function over(color: string, backdrop: string): RGB {
  const c = parseColor(color);
  const b = parseColor(backdrop);
  if (!(c && b)) throw new Error("bad color");
  return [
    c.r * c.a + b.r * (1 - c.a),
    c.g * c.a + b.g * (1 - c.a),
    c.b * c.a + b.b * (1 - c.a),
  ];
}

describe("splitAlpha", () => {
  it("splits alpha out and leaves opaque and transparent colors alone", () => {
    expect(splitAlpha("#1d4ed880")).toEqual({
      color: "#1d4ed8",
      opacity: 0.502,
    });
    expect(splitAlpha("rgba(29, 78, 216, 0.25)")).toEqual({
      color: "#1d4ed8",
      opacity: 0.25,
    });
    expect(splitAlpha("#1d4ed8")).toEqual({ color: "#1d4ed8" });
    expect(splitAlpha("transparent")).toEqual({ color: "transparent" });
    expect(splitAlpha("not a color")).toEqual({ color: "not a color" });
  });
});

describe("see-through solid colors", () => {
  const props: QRProps = { ...BASE, fgColor: SEE_THROUGH, bgColor: BACKGROUND };
  const expected = over(SEE_THROUGH, BACKGROUND);
  const { dark } = bodyPoints();
  const { ring } = eyePoints();

  it("SVG writes the color and its fill-opacity apart", () => {
    const svg = renderSvg(props);
    expect(svg).toContain('fill="#1d4ed8" fill-opacity="0.8"');
    expect(svg).not.toContain("#1d4ed8cc");
  });

  it("SVG, PDF and EPS all paint it at 80% over the background", async () => {
    const svg = await svgRaster(props);
    const pdf = rasterizePdf(
      await getQRAsPrintPDFBuffer(props, { size: SIZE_MM }),
      SCALE
    );
    const eps = rasterizeEps(
      await getQRAsEPS(props, { sizeMm: SIZE_MM }),
      SCALE
    );
    for (const image of [svg, pdf.image, eps.image]) {
      const [x, y] = toPx(dark[0] as [number, number]);
      expect(
        channelDistance(pixel(image as never, x, y), expected)
      ).toBeLessThanOrEqual(2);
      expect(mismatches(svg, image, [...dark, ...ring])).toEqual([]);
      expect(decodeQR(image as never)).toBe(VALUE);
    }
    // The PDF keeps the alpha (fill opacity 0.8); the EPS flattens it.
    expect(pdf.alphas).toContain(0.8);
    expect(eps.alphas.every((alpha) => alpha === 1)).toBe(true);
    expect(eps.fills.some((fill) => channelDistance(fill, expected) <= 1)).toBe(
      true
    );
  });

  it("a see-through background sits on white paper", async () => {
    const translucent: QRProps = { ...BASE, bgColor: "#fef3c780" };
    const paper = over("#fef3c780", "#ffffff");
    const { light } = bodyPoints();
    const pdf = rasterizePdf(
      await getQRAsPrintPDFBuffer(translucent, { size: SIZE_MM }),
      SCALE
    );
    const eps = rasterizeEps(
      await getQRAsEPS(translucent, { sizeMm: SIZE_MM }),
      SCALE
    );
    for (const image of [pdf.image, eps.image]) {
      const [x, y] = toPx(light[0] as [number, number]);
      expect(channelDistance(pixel(image, x, y), paper)).toBeLessThanOrEqual(2);
    }
  });
});

describe("see-through gradient stops", () => {
  const uniform: QRProps = {
    ...BASE,
    bgColor: BACKGROUND,
    fgColor: {
      type: "linear",
      angle: 0,
      stops: [
        { color: "#1d4ed8cc", offset: 0 },
        { color: "#9d174dcc", offset: 100 },
      ],
    },
  };
  const mixed: QRProps = {
    ...BASE,
    bgColor: BACKGROUND,
    fgColor: {
      type: "linear",
      angle: 0,
      stops: [
        { color: "#1d4ed8", offset: 0 },
        { color: "#9d174d99", offset: 100 },
      ],
    },
  };

  it("SVG writes stop-opacity", () => {
    const svg = renderSvg(uniform);
    expect(svg).toContain('stop-color="#1d4ed8" stop-opacity="0.8"');
  });

  it("PDF shades one alpha with a graphics state, flattens mixed alphas", async () => {
    const one = readPdf(
      await getQRAsPrintPDFBuffer(uniform, { size: SIZE_MM })
    );
    expect(one.extGStates.size).toBeGreaterThan(0);
    expect(one.content).toMatch(/\/GS\d+ gs[\s\S]*\/Sh0 sh/);
    const buffer = await getQRAsPrintPDFBuffer(mixed, { size: SIZE_MM });
    const two = readPdf(buffer);
    // Mixed alphas: no graphics state, the see-through stop flattened over
    // the background and the opaque one as is.
    expect(two.content).not.toMatch(/\/GS\d+ gs/);
    const shading = two.shadings.get("Sh0") as Map<string, unknown>;
    const fn = shading.get("Function") as Map<string, unknown>;
    const toRgb = (values: unknown) =>
      (values as number[]).map((v) => Math.round(v * 255));
    expect(toRgb(fn.get("C0"))).toEqual(rgbOf("#1d4ed8"));
    expect(
      channelDistance(toRgb(fn.get("C1")) as RGB, over("#9d174d99", BACKGROUND))
    ).toBeLessThanOrEqual(1);
    expect(decodeQR(rasterizePdf(buffer, SCALE).image)).toBe(VALUE);
  });

  it("EPS flattens every stop over the background and decodes", async () => {
    const eps = await getQRAsEPS(uniform, { sizeMm: SIZE_MM });
    const rendered = rasterizeEps(eps, SCALE);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    const flattened = over("#1d4ed8cc", BACKGROUND).map((v) => v / 255);
    const c0 = /\/C0 \[([\d. ]+)\]/.exec(eps)?.[1]?.split(" ").map(Number);
    expect(c0).toBeDefined();
    for (const [index, value] of (c0 as number[]).entries()) {
      expect(value).toBeCloseTo(flattened[index] as number, 2);
    }
  });
});

describe("scan contrast with alpha", () => {
  it("judges a see-through code by what it looks like on its background", () => {
    const opaque = getScanContrast({ value: VALUE, fgColor: "#1d4ed8" });
    const faded = getScanContrast({ value: VALUE, fgColor: "#1d4ed833" });
    expect(opaque.ratio).toBeGreaterThan(4.5);
    expect(faded.ratio).toBeLessThan(2);
  });
});
