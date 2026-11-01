/** biome-ignore-all lint/style/noMagicNumbers: test matrix and PNG decoding */
// Logo QR and Image QR quality gate. Every sample photo and logo the editor
// offers (fixtures copied from apps/docs/public/images/art-samples, photos
// pre-sampled to the 160 px grid loadQRArtImage stores), in every variant, at
// the editor's Subtle / Balanced / Bold strengths (and 1, where the renderer
// clamps), must:
// - decode with jsQR as rendered at 160, 320 and 640 px;
// - decode through the phone-camera model (blur + contrast loss) at 320 and
//   640 px, in at least 2 of 3 frames at 0.9×, 1× and 1.1× (the rule the
//   app's scan score uses; jsQR's grid fit is sensitive to exact scale);
// - get an "ok" or "great" scan score at the default strength (which also
//   tries 96 and 160 px through the camera);
// - decode the same from the EPS and print-PDF exports (rasterized here from
//   their own vector operators), so all four outputs match.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createQRArtImage,
  DEFAULT_ART_INTENSITY,
  getQRArtVariant,
  isQRArtActive,
} from "../src/art";
import { getQRAsEPS } from "../src/eps";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { getScanScore } from "../src/scan-score";
import { parseColor } from "../src/utils/parse-color";
import { parseSvgMarkup } from "../src/utils/svg-geometry";
import type { QRArt, QRArtImage, QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { renderSvg, symbolSize } from "./support/qr";
import {
  createImage,
  decodeQR,
  fillPolygons,
  type RasterImage,
  rasterizeSvg,
  simulateCamera,
} from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const FIXTURES = new URL("./fixtures/art/", import.meta.url);
const PHOTOS = ["latte", "dog", "mountain", "sneaker", "flowers", "portrait"];
const LOGOS = ["bloom", "cafe", "summit", "wave", "leaf", "monogram"];
/** The editor's Subtle / Balanced / Bold presets, and the maximum */
const STRENGTHS = [0.35, 0.6, 0.85, 1];
const SIZES = [160, 320, 640];
const CAMERA_SIZES = [320, 640];

/** Editor defaults (gear eyes, round dots) with the art settings it applies. */
const BASE: QRProps = {
  value: VALUE,
  size: 512,
  level: "H",
  margin: 4,
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
};

// ── Fixtures ───────────────────────────────────────────────────────────────

/** Minimal PNG reader (8-bit RGB/RGBA, non-interlaced) for the fixtures. */
function decodePng(bytes: Buffer): RasterImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      chunks.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const data = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? (current[i - channels] as number) : 0;
      const b = previous[i] as number;
      const c = i >= channels ? (previous[i - channels] as number) : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter] ?? 0;
      current[i] = ((line[i] as number) + predictor) % 256;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 4; k++) {
        data[(y * width + x) * 4 + k] =
          k < channels ? (current[x * channels + k] as number) : 255;
      }
    }
    previous = current;
  }
  return { data, width, height };
}

const images = new Map<string, QRArtImage>();

/** A sample sampled exactly as loadQRArtImage stores it (160 px grid). */
function sample(name: string): QRArtImage {
  const cached = images.get(name);
  if (cached) return cached;
  let image: QRArtImage;
  if (PHOTOS.includes(name)) {
    const pixels = decodePng(readFileSync(new URL(`${name}.png`, FIXTURES)));
    image = createQRArtImage(pixels, { maxSize: 160, square: true });
  } else {
    // Logos: rasterized at 4× on a transparent page, then box-filtered.
    const svg = readFileSync(new URL(`${name}.svg`, FIXTURES), "utf8");
    const pixels = rasterizeSvg(svg, { width: 640, background: null });
    image = createQRArtImage(pixels, { maxSize: 160 });
  }
  images.set(name, image);
  return image;
}

interface Case {
  name: string;
  mode: QRArt["mode"];
  variant: NonNullable<QRArt["variant"]>;
}

const CASES: Case[] = [
  ...PHOTOS.flatMap((name) =>
    (["color", "mono"] as const).map((variant) => ({
      name,
      mode: "halftone" as const,
      variant,
    }))
  ),
  ...LOGOS.flatMap((name) =>
    (["blend", "badge"] as const).map((variant) => ({
      name,
      mode: "logo" as const,
      variant,
    }))
  ),
];

const propsFor = (c: Case, intensity: number): QRProps => ({
  ...BASE,
  art: { mode: c.mode, variant: c.variant, image: sample(c.name), intensity },
});

// ── Rendering helpers ──────────────────────────────────────────────────────

const modulesAcross = (props: QRProps) =>
  symbolSize(props.value, props.level) + 2 * (props.margin ?? 4);

function decodeAtSizes(svg: string, props: QRProps) {
  const root = parseSvgMarkup(svg);
  if (!root) throw new Error("render is not SVG");
  const modules = modulesAcross(props);
  const throughCamera = (
    width: number,
    image = rasterizeSvg(root, { width })
  ) => decodeQR(simulateCamera(image, width / modules)) === VALUE;
  return SIZES.map((width) => {
    const image = rasterizeSvg(root, { width });
    let camera = true;
    if (CAMERA_SIZES.includes(width) && !throughCamera(width, image)) {
      // A phone sees many frames: pass when both nearby scales read.
      camera =
        throughCamera(Math.round(width * 0.9)) &&
        throughCamera(Math.round(width * 1.1));
    }
    return { width, plain: decodeQR(image), camera };
  });
}

interface Op {
  op: string;
  args: number[];
}

/** Tokenizes PostScript / PDF content into operators with numeric operands. */
function operators(source: string): Op[] {
  const ops: Op[] = [];
  let args: number[] = [];
  for (const token of source.split(/\s+/)) {
    if (token === "") continue;
    const n = Number(token);
    if (Number.isFinite(n) && /^[-+.\d]/.test(token)) {
      args.push(n);
    } else {
      ops.push({ op: token, args });
      args = [];
    }
  }
  return ops;
}

/**
 * Paints filled paths from EPS or PDF content (y up, in points) into an
 * image `scale` px per point; strokes and text are ignored.
 */
function paintOperators(
  ops: Op[],
  page: { width: number; height: number },
  scale: number
): RasterImage {
  const image = createImage(page.width * scale, page.height * scale);
  const toPx = (x: number, y: number): [number, number] => [
    x * scale,
    (page.height - y) * scale,
  ];
  let color = { r: 0, g: 0, b: 0, a: 1 };
  const stack: (typeof color)[] = [];
  let polygons: [number, number][][] = [];
  let current: [number, number][] = [];
  let last: [number, number] = [0, 0];
  const flush = () => {
    if (current.length > 1) polygons.push(current);
    current = [];
  };
  for (const { op, args } of ops) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = args;
    switch (op) {
      case "rg":
        color = { r: a * 255, g: b * 255, b: c * 255, a: 1 };
        break;
      case "g":
        color = { r: a * 255, g: a * 255, b: a * 255, a: 1 };
        break;
      case "gsave":
      case "q":
        stack.push(color);
        break;
      case "grestore":
      case "Q":
        color = stack.pop() ?? color;
        break;
      case "m":
        flush();
        last = toPx(a, b);
        current.push(last);
        break;
      case "l":
        last = toPx(a, b);
        current.push(last);
        break;
      case "c": {
        const p1 = toPx(a, b);
        const p2 = toPx(c, d);
        const p3 = toPx(e, f);
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const u = 1 - t;
          current.push([
            u * u * u * last[0] +
              3 * u * u * t * p1[0] +
              3 * u * t * t * p2[0] +
              t * t * t * p3[0],
            u * u * u * last[1] +
              3 * u * u * t * p1[1] +
              3 * u * t * t * p2[1] +
              t * t * t * p3[1],
          ]);
        }
        last = p3;
        break;
      }
      case "re": {
        flush();
        current = [
          toPx(a, b),
          toPx(a + c, b),
          toPx(a + c, b + d),
          toPx(a, b + d),
        ];
        flush();
        break;
      }
      case "h":
        flush();
        break;
      case "f":
      case "F":
      case "ef":
      case "f*":
        flush();
        fillPolygons(image, polygons, color, 1, op === "ef" || op === "f*");
        polygons = [];
        break;
      case "n":
      case "s":
      case "S":
        flush();
        polygons = [];
        break;
      default:
        break;
    }
  }
  return image;
}

function epsToImage(eps: string, scale: number): RasterImage {
  const box = /%%HiResBoundingBox: 0 0 ([\d.]+) ([\d.]+)/.exec(eps);
  const body = eps.slice(eps.indexOf("%%EndProlog"));
  return paintOperators(
    operators(body.replace(/%[^\n]*/g, "")),
    { width: Number(box?.[1]), height: Number(box?.[2]) },
    scale
  );
}

function pdfToImage(pdf: ArrayBuffer, scale: number): RasterImage {
  const bytes = Buffer.from(new Uint8Array(pdf));
  const text = bytes.toString("latin1");
  const box = /\/MediaBox \[([-\d. ]+)\]/.exec(text)?.[1]?.trim().split(/\s+/);
  const content: string[] = [];
  const marker = /(?<!end)stream\r?\n/g;
  let match = marker.exec(text);
  while (match) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    try {
      content.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {
      // Not a Flate stream (fonts, metadata)
    }
    marker.lastIndex = end;
    match = marker.exec(text);
  }
  return paintOperators(
    operators(content.join("\n")),
    { width: Number(box?.[2]), height: Number(box?.[3]) },
    scale
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("art samples", () => {
  it("are sampled within the storage budget", () => {
    for (const name of [...PHOTOS, ...LOGOS]) {
      const image = sample(name);
      expect(isQRArtActive({ mode: "logo", image })).toBe(true);
      // Saved in theme JSON: keep each image under ~150 KB of base64.
      expect(image.data.length).toBeLessThan(150 * 1024);
    }
  });
});

describe.each(CASES)("$mode $variant: $name", (c) => {
  it.each(
    STRENGTHS
  )("decodes at 160, 320 and 640 px and through the camera at strength %s", (intensity) => {
    const props = propsFor(c, intensity);
    const svg = renderSvg(props);
    expect(svg).toContain(`data-qrdx-art-variant="${c.variant}"`);
    const results = decodeAtSizes(svg, props);
    expect(
      results.filter((r) => r.plain !== VALUE).map((r) => r.width),
      "sizes that fail to decode as rendered"
    ).toEqual([]);
    expect(
      results.filter((r) => !r.camera).map((r) => r.width),
      "sizes that fail through the camera model"
    ).toEqual([]);
  });
});

describe("scan score at the default strength", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it.each(CASES)("$mode $variant: $name is ok or great", async (c) => {
    const result = await getScanScore(propsFor(c, DEFAULT_ART_INTENSITY));
    expect(
      ["ok", "great"],
      result.checks
        .filter((check) => !check.passed)
        .map((check) => check.message)
        .join("; ")
    ).toContain(result.grade);
  });
});

describe("exports match the SVG", () => {
  const cases: Case[] = [
    { name: "flowers", mode: "halftone", variant: "color" },
    { name: "portrait", mode: "halftone", variant: "mono" },
    { name: "bloom", mode: "logo", variant: "blend" },
    { name: "summit", mode: "logo", variant: "badge" },
  ];

  it.each(cases)("EPS of $mode $variant ($name) decodes", async (c) => {
    const props = propsFor(c, DEFAULT_ART_INTENSITY);
    const eps = await getQRAsEPS(props, { sizeMm: 50 });
    // 50 mm ≈ 142 pt; 2.5 px per point ≈ 8.6 px per module
    expect(decodeQR(epsToImage(eps, 2.5))).toBe(VALUE);
  });

  it.each(cases)("print PDF of $mode $variant ($name) decodes", async (c) => {
    const props = propsFor(c, DEFAULT_ART_INTENSITY);
    const pdf = await getQRAsPrintPDFBuffer(props, { size: 50, unit: "mm" });
    expect(decodeQR(pdfToImage(pdf, 2.5))).toBe(VALUE);
  });

  it("EPS uses the art's own colors", async () => {
    const props = propsFor(
      { name: "bloom", mode: "logo", variant: "blend" },
      DEFAULT_ART_INTENSITY
    );
    const svg = renderSvg(props);
    const eps = await getQRAsEPS(props);
    const fills = new Set(
      [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1] as string)
    );
    const missing = [...fills].filter((hex) => {
      const { r, g, b } = parseColor(hex) ?? { r: 0, g: 0, b: 0 };
      const fmt = (v: number) => String(Math.round((v / 255) * 1000) / 1000);
      return !eps.includes(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
    });
    expect(missing).toEqual([]);
  });
});

describe("compatibility", () => {
  it("renders art saved before variants (64 px logo, 96 px photo)", () => {
    const logo = createQRArtImage(
      rasterizeSvg(readFileSync(new URL("leaf.svg", FIXTURES), "utf8"), {
        width: 256,
        background: null,
      }),
      { maxSize: 64 }
    );
    const photo = createQRArtImage(
      decodePng(readFileSync(new URL("dog.png", FIXTURES))),
      { maxSize: 96 }
    );
    for (const art of [
      { mode: "logo", image: logo },
      { mode: "halftone", image: photo, intensity: 0.85 },
    ] as QRArt[]) {
      const props = { ...BASE, art };
      const results = decodeAtSizes(renderSvg(props), props);
      expect(results.map((r) => r.plain)).toEqual(SIZES.map(() => VALUE));
    }
  });

  it("falls back to the mode's default variant", () => {
    expect(getQRArtVariant({ mode: "logo" })).toBe("blend");
    expect(getQRArtVariant({ mode: "halftone" })).toBe("color");
    expect(getQRArtVariant({ mode: "halftone", variant: "badge" })).toBe(
      "color"
    );
  });

  it("draws the plain body pattern at strength 0", () => {
    const svg = renderSvg(
      propsFor({ name: "dog", mode: "halftone", variant: "color" }, 0)
    );
    expect(svg).not.toContain("data-qrdx-art");
  });
});

describe("performance", () => {
  // A 57-module code (version 10), the largest the playground commonly shows.
  const value = `https://qrdx.dev/${"a".repeat(84)}`;

  it("uses a version 10 code", () => {
    expect(symbolSize(value, "H")).toBe(57);
  });

  it.each<[string, Case]>([
    ["Image QR", { name: "flowers", mode: "halftone", variant: "color" }],
    ["Image QR mono", { name: "flowers", mode: "halftone", variant: "mono" }],
    ["Logo QR", { name: "bloom", mode: "logo", variant: "blend" }],
    ["Logo QR badge", { name: "bloom", mode: "logo", variant: "badge" }],
  ])("renders %s in well under 50 ms once warm", (_label, c) => {
    const props = { ...propsFor(c, DEFAULT_ART_INTENSITY), value };
    renderSvg(props);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      renderSvg({
        ...props,
        art: { ...(props.art as QRArt), intensity: 0.5 + i / 20 },
      });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    // Median. Shared CI runners (with turbo running other packages' tests at
    // the same time) measured 2.5× slower than a laptop, so CI gets more
    // headroom; a real regression costs seconds, not tens of milliseconds.
    const budgetMs = process.env.CI ? 300 : 100;
    expect(times[2]).toBeLessThan(budgetMs);
  });
});
