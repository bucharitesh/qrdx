/** biome-ignore-all lint/style/noMagicNumbers: geometry under test */
// Heart and silhouette codes (shape: "heart" or a QRSilhouette), held to the
// circle code's rules (tests/qr-shape.test.ts): the symbol keeps a quiet
// ring of at least QR_CIRCLE_QUIET_MIN modules that no decoration and no
// edge of the outline enters, every solid body and eye decodes at three
// phone distances through the camera model and in sharp renders (and with
// zbar when it is installed), the print PDF and EPS draw the outline and
// decode, image fills and angular gradients follow it, the scan score
// grades it like a square code, and silhouettes too thin to hold the code
// are refused and draw as square codes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import { getQRAsPrintPDFBuffer, getQRModuleCount } from "../src/print";
import {
  getHeartOutline,
  getSilhouetteOutline,
  insidePolygons,
} from "../src/qr-outline";
import {
  circleQuietZone,
  getLayoutMargin,
  getQRSilhouetteFit,
  shapeDecoration,
} from "../src/qr-shape";
import { getScanScore } from "../src/scan-score";
import { createQRSilhouette } from "../src/silhouette";
import type {
  AngularGradient,
  BodyPattern,
  CornerEyePattern,
  QRCodeShape,
  QRProps,
  QRSilhouette,
} from "../types";
import {
  QR_CIRCLE_QUIET_MIN,
  QR_SILHOUETTE_MIN_SHARE,
  qrPropsSchema,
  qrSilhouetteSchema,
} from "../types/qr";
import { installFakeDom } from "./support/fake-dom";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import {
  decodeQR,
  type RasterImage,
  rasterizeSvg,
  toPng,
} from "./support/raster";

const VALUES = [
  "https://qrdx.dev/q/Ab3dE9x?utm=campaign",
  "https://example.com",
  "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;",
];
const VALUE = VALUES[0] as string;
const symbol = (value: string, level: "M" | "H" = "M") =>
  qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]).size;

/** RGBA pixels of SVG shapes drawn on a clear 256 px canvas. */
function pixelsOf(body: string, background: string | null = null) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${body}</svg>`;
  return rasterizeSvg(svg, { width: 256, background });
}
const shapeOf = (body: string) =>
  createQRSilhouette(pixelsOf(`<g fill="#111">${body}</g>`));

const star = (points: number, outer: number, inner: number) =>
  Array.from({ length: 2 * points }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
  }).join(" ");

const SHAPES = {
  cloud:
    '<circle cx="70" cy="110" r="45"/><circle cx="120" cy="90" r="55"/><circle cx="155" cy="125" r="35"/><rect x="40" y="110" width="130" height="50" rx="25"/>',
  bubble:
    '<path d="M20 30 h160 a10 10 0 0 1 10 10 v100 a10 10 0 0 1 -10 10 h-110 l-35 35 v-35 h-15 a10 10 0 0 1 -10 -10 v-100 a10 10 0 0 1 10 -10z"/>',
  pin: '<path d="M100 190 C70 140 30 110 30 75 A70 70 0 0 1 170 75 C170 110 130 140 100 190Z"/>',
  "fat star": `<polygon points="${star(5, 95, 55)}"/>`,
};
const THIN = {
  "thin star": `<polygon points="${star(5, 95, 40)}"/>`,
  bar: '<rect x="0" y="80" width="200" height="40"/>',
  ring: '<path fill-rule="evenodd" d="M100 10 A90 90 0 1 1 99.9 10Z M100 30 A70 70 0 1 0 100.1 30Z"/>',
};
const silhouettes = Object.fromEntries(
  Object.entries(SHAPES).map(([name, body]) => [name, shapeOf(body)])
) as Record<keyof typeof SHAPES, QRSilhouette>;

const shapedCode = (
  shape: QRCodeShape,
  extra: Partial<QRProps> = {}
): QRProps => ({
  value: VALUE,
  size: 512,
  level: "M",
  shape,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "rounded",
  ...extra,
});

/** Polygons of a shaped code's outline, in modules of its layout grid. */
function outlineOf(shape: QRCodeShape) {
  const outline =
    shape === "heart"
      ? getHeartOutline()
      : getSilhouetteOutline(shape as QRSilhouette).outline;
  if (!outline) throw new Error("no outline");
  return outline;
}

/** The quiet ring stays inside the outline with no edge entering it. */
function expectRingInside(shape: QRCodeShape, n: number, margin: number) {
  const outline = outlineOf(shape);
  const layout = getLayoutMargin(n, margin, shape);
  const quiet = circleQuietZone(margin);
  const size = n + 2 * layout;
  const low = (layout - quiet) / size;
  const high = (layout + n + quiet) / size;
  for (let i = 0; i <= 64; i++) {
    const t = low + ((high - low) * i) / 64;
    for (const [x, y] of [
      [t, low],
      [t, high],
      [low, t],
      [high, t],
    ] as const) {
      expect(insidePolygons(outline.polygons, x, y), `${n}/${margin}`).toBe(
        true
      );
    }
  }
  const entering = outline.polygons
    .flat()
    .filter(([x, y]) => x > low && x < high && y > low && y < high);
  expect(entering).toEqual([]);
}

// ── Layout ─────────────────────────────────────────────────────────────────

describe("layout", () => {
  it("fits the symbol and its quiet ring inside the heart", () => {
    for (const n of [21, 29, 45, 77]) {
      for (const margin of [0, 3, 6]) {
        expect(circleQuietZone(margin)).toBeGreaterThanOrEqual(
          QR_CIRCLE_QUIET_MIN
        );
        expectRingInside("heart", n, margin);
      }
    }
  });

  it("fits it inside each silhouette", () => {
    for (const shape of Object.values(silhouettes)) {
      for (const n of [21, 33, 57]) {
        for (const margin of [0, 4]) expectRingInside(shape, n, margin);
      }
    }
  });

  it("decorates only outside the quiet ring and inside the outline", () => {
    const n = symbol(VALUE);
    for (const shape of ["heart", silhouettes.cloud] as QRCodeShape[]) {
      const outline = outlineOf(shape);
      const layout = getLayoutMargin(n, 0, shape);
      const quiet = circleQuietZone(0);
      const grid = shapeDecoration(VALUE, n, 0, shape);
      const size = n + 2 * layout;
      expect(grid).toHaveLength(size);
      let dark = 0;
      let cells = 0;
      for (const [y, row] of (grid ?? []).entries()) {
        for (const [x, on] of row.entries()) {
          const inRing =
            x >= layout - quiet &&
            x < layout + n + quiet &&
            y >= layout - quiet &&
            y < layout + n + quiet;
          // The module's own square (with its rim) inside the outline
          const corners = [
            [x, y],
            [x + 1, y],
            [x, y + 1],
            [x + 1, y + 1],
          ].every(([cx, cy]) =>
            insidePolygons(
              outline.polygons,
              (cx as number) / size,
              (cy as number) / size
            )
          );
          if (on) expect(inRing || !corners, `${x},${y}`).toBe(false);
          if (!inRing && corners) {
            cells++;
            if (on) dark++;
          }
        }
      }
      // About half dark, like data, and the same for the same value
      expect(dark / cells).toBeGreaterThan(0.35);
      expect(dark / cells).toBeLessThan(0.6);
      expect(shapeDecoration(VALUE, n, 0, shape)).toEqual(grid);
    }
  });

  it("draws the outline, not a square, behind the code", () => {
    const heart = renderSvg(shapedCode("heart"));
    expect(heart).toMatch(/<path d="M256 [^"]+Z" fill="#FFFFFF"><\/path>/);
    expect(heart).not.toMatch(/<rect fill="#FFFFFF" height="512"/);
    const cloud = renderSvg(shapedCode(silhouettes.cloud));
    expect(cloud).toMatch(/<path d="M[^"]+Q[^"]+Z" fill="#FFFFFF"><\/path>/);
  });

  it("the heart is about 57% symbol, a circle about 66%", () => {
    expect(2 * getHeartOutline().half).toBeCloseTo(0.572, 2);
    const n = symbol(VALUE);
    const share = (shape: QRCodeShape) =>
      (n + 2 * circleQuietZone(0)) / (n + 2 * getLayoutMargin(n, 0, shape));
    expect(share("heart")).toBeGreaterThan(0.5);
    expect(share("circle")).toBeGreaterThan(share("heart"));
  });

  it("counts the outline's modules for print and lays a logo out in them", () => {
    const n = symbol(VALUE, "H");
    const layout = getLayoutMargin(n, 2, "heart");
    expect(
      getQRModuleCount({ ...shapedCode("heart"), level: "H", margin: 2 })
    ).toBe(n + 2 * layout);
    const settings = getQRData({
      value: VALUE,
      level: "H",
      margin: 2,
      shape: "heart",
      logo: "data:,x",
      logoOptions: { padding: 1 },
    }).imageSettings;
    expect(settings?.padding).toBeCloseTo(1024 / (n + 2 * layout));
  });
});

// ── Silhouettes ────────────────────────────────────────────────────────────

describe("silhouettes", () => {
  it("samples alpha into a bounded grid cropped to the shape", () => {
    const disc = shapeOf('<circle cx="60" cy="60" r="40"/>');
    expect(qrSilhouetteSchema.safeParse(disc).success).toBe(true);
    // Cropped: a disc fills its grid, 64 cells across
    expect([disc.width, disc.height]).toEqual([64, 64]);
    expect(disc.cells[32 * 64 + 32]).toBe("1");
    expect(disc.cells[0]).toBe("0");
    expect(getQRSilhouetteFit(disc)).toMatchObject({ ok: true });
  });

  it("uses darkness for opaque pictures, light shapes on dark too", () => {
    const body = '<circle cx="100" cy="100" r="80"/>';
    const fromAlpha = shapeOf(body);
    const dark = createQRSilhouette(
      pixelsOf(`<g fill="#1f2937">${body}</g>`, "#ffffff")
    );
    const light = createQRSilhouette(
      pixelsOf(`<g fill="#fde68a">${body}</g>`, "#111827")
    );
    const diff = (a: QRSilhouette, b: QRSilhouette) =>
      [...a.cells].filter((cell, i) => cell !== b.cells[i]).length;
    expect(diff(dark, fromAlpha)).toBeLessThan(40);
    expect(diff(light, fromAlpha)).toBeLessThan(40);
  });

  it("cleans up specks and pinholes", () => {
    const clean = shapeOf('<circle cx="100" cy="100" r="80"/>');
    const specked = shapeOf(
      '<circle cx="100" cy="100" r="80"/><rect x="2" y="2" width="3" height="3"/><rect fill="#fff" x="98" y="98" width="3" height="3"/>'
    );
    expect(specked.cells).toBe(clean.cells);
  });

  it("refuses pictures with no shape or a tiny one", () => {
    expect(() => createQRSilhouette(pixelsOf(""))).toThrow(/No shape found/);
    expect(() =>
      createQRSilhouette(pixelsOf('<rect x="10" y="10" width="6" height="6"/>'))
    ).toThrow(/too small/);
  });

  it("refuses shapes too thin to hold the code, which then draw square", () => {
    for (const [name, body] of Object.entries(THIN)) {
      const shape = shapeOf(body);
      const fit = getQRSilhouetteFit(shape);
      expect(fit, name).toMatchObject({ ok: false, reason: "thin" });
      expect(fit.ok ? "" : fit.message).toMatch(/too thin/);
      const props = shapedCode(shape);
      expect(getLayoutMargin(symbol(VALUE), 0, shape)).toBe(0);
      expect(renderSvg(props)).toMatch(/<rect fill="#FFFFFF" height="512"/);
      expect(capture(props, { modulePx: 6 })).toBe(VALUE);
    }
    for (const shape of Object.values(silhouettes)) {
      const fit = getQRSilhouetteFit(shape);
      expect(fit.ok).toBe(true);
      expect(fit.ok && fit.share).toBeGreaterThanOrEqual(
        QR_SILHOUETTE_MIN_SHARE
      );
    }
  });

  it("validates its grid and caps it", () => {
    const base = silhouettes.cloud;
    const bad = [
      { ...base, cells: `${base.cells}0` },
      { ...base, cells: base.cells.replace("1", "2") },
      { ...base, width: 65 },
      { ...base, width: 4, height: 4, cells: "1".repeat(16) },
    ];
    for (const shape of bad) {
      expect(qrSilhouetteSchema.safeParse(shape).success).toBe(false);
    }
    expect(qrPropsSchema.safeParse(shapedCode(base)).success).toBe(true);
    expect(qrPropsSchema.safeParse(shapedCode("heart")).success).toBe(true);
    // A malformed grid draws a square code rather than throwing
    const broken = { ...base, cells: "1" } as QRSilhouette;
    expect(getQRSilhouetteFit(broken)).toMatchObject({ reason: "invalid" });
    expect(capture(shapedCode(broken), { modulePx: 6 })).toBe(VALUE);
  });
});

// ── Decoding ───────────────────────────────────────────────────────────────

/** Captures that miss: camera at phone distances, sharp at three sizes. */
function misses(props: QRProps, values = VALUES): string[] {
  const missed: string[] = [];
  for (const value of values) {
    const code = { ...props, value };
    for (const modulePx of PHONE_MODULE_SIZES) {
      if (capture(code, { modulePx }) !== value)
        missed.push(`camera ${modulePx}px ${value}`);
    }
    for (const modulePx of [6, 9, 14]) {
      if (capture(code, { modulePx, camera: false }) !== value)
        missed.push(`sharp ${modulePx}px ${value}`);
    }
  }
  return missed;
}

describe("heart codes decode", () => {
  const bodies: BodyPattern[] = ["square", "rounded", "classy", "liquid"];
  const eyes: CornerEyePattern[] = ["square", "rounded", "gear"];
  for (const bodyPattern of bodies) {
    for (const cornerEyePattern of eyes) {
      it(`${bodyPattern} body, ${cornerEyePattern} eyes`, () => {
        expect(
          misses(shapedCode("heart", { bodyPattern, cornerEyePattern }))
        ).toEqual([]);
      });
    }
  }

  it("in the default look (circle dots, gear eyes)", () => {
    expect(
      misses(
        shapedCode("heart", {
          bodyPattern: "circle",
          cornerEyePattern: "gear",
          cornerEyeDotPattern: "circle",
        })
      )
    ).toEqual([]);
  });

  it("with a centered logo on H", () => {
    const props: QRProps = {
      ...getQRData({
        value: VALUE,
        size: 512,
        level: "H",
        shape: "heart",
        logo: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#1d4ed8"/></svg>')}`,
        logoOptions: { size: 0.15 },
      }),
      level: "H",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
    };
    expect(
      PHONE_MODULE_SIZES.filter(
        (modulePx) => capture(props, { modulePx }) !== VALUE
      )
    ).toEqual([]);
  });
});

describe("silhouette codes decode", () => {
  for (const [name, shape] of Object.entries(silhouettes)) {
    it(name, () => {
      expect(misses(shapedCode(shape))).toEqual([]);
      expect(
        misses(
          shapedCode(shape, {
            bodyPattern: "rounded",
            cornerEyePattern: "gear",
          })
        )
      ).toEqual([]);
    });
  }
});

const ZBAR = (() => {
  const probe = spawnSync("zbarimg", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
})();
const workDir = ZBAR ? mkdtempSync(join(tmpdir(), "qrdx-shapes-")) : "";
afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!ZBAR)("zbar reads crisp renders", () => {
  const read = async (image: RasterImage, name: string) => {
    const file = join(workDir, `${name}.png`);
    writeFileSync(file, await toPng(image));
    return spawnSync("zbarimg", ["--raw", "-q", file], {
      encoding: "utf8",
    }).stdout.replace(/\n$/, "");
  };
  const shapes: [string, QRCodeShape][] = [
    ["heart", "heart"],
    ["cloud", silhouettes.cloud],
    ["pin", silhouettes.pin],
  ];
  for (const [name, shape] of shapes) {
    it(name, async () => {
      const failed: string[] = [];
      for (const [v, value] of VALUES.entries()) {
        for (const eye of ["square", "rounded"] as const) {
          const props = shapedCode(shape, {
            value,
            cornerEyePattern: eye,
            bodyPattern: "rounded",
          });
          const n = symbol(value);
          const modules = n + 2 * getLayoutMargin(n, 0, shape);
          for (const modulePx of [6, 10]) {
            const image = rasterizeSvg(renderSvg(props), {
              width: modules * modulePx,
              pad: 4 * modulePx,
            });
            if (
              (await read(image, `${name}-${v}-${eye}-${modulePx}`)) !== value
            )
              failed.push(`${eye} ${modulePx}px ${value}`);
          }
        }
      }
      expect(failed).toEqual([]);
    });
  }
});

// ── Exports and paints ─────────────────────────────────────────────────────

describe("print PDF and EPS", () => {
  it("PDF draws the heart and decodes", async () => {
    const buffer = await getQRAsPrintPDFBuffer(shapedCode("heart"), {
      size: 60,
      unit: "mm",
    });
    expect(decodeQR(rasterizePdf(buffer, 3).image)).toBe(VALUE);
  });

  it("EPS draws the heart and decodes", async () => {
    const eps = await getQRAsEPS(shapedCode("heart"), { sizeMm: 60 });
    expect(decodeQR(rasterizeEps(eps, 3).image)).toBe(VALUE);
  });

  it("PDF and EPS draw a silhouette and decode", async () => {
    const props = shapedCode(silhouettes.bubble);
    const buffer = await getQRAsPrintPDFBuffer(props, { size: 60 });
    expect(decodeQR(rasterizePdf(buffer, 3).image)).toBe(VALUE);
    const eps = await getQRAsEPS(props, { sizeMm: 60 });
    expect(decodeQR(rasterizeEps(eps, 3).image)).toBe(VALUE);
  });
});

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
/** A 2×2 PNG, two light tones: a picture for the background. */
const LIGHT_PICTURE = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#fef9c3"/><rect width="1" height="1" fill="#e0f2fe"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

describe("image fills and angular gradients follow the outline", () => {
  it("an angular gradient on the dots decodes in SVG, PDF and EPS", async () => {
    const props = shapedCode("heart", { fgColor: SWEEP, eyeColor: SWEEP });
    for (const modulePx of [4, 6, 9]) {
      expect(capture(props, { modulePx })).toBe(VALUE);
    }
    const pdf = await getQRAsPrintPDFBuffer(props, { size: 60 });
    expect(decodeQR(rasterizePdf(pdf, 3).image)).toBe(VALUE);
    const eps = await getQRAsEPS(props, { sizeMm: 60 });
    expect(decodeQR(rasterizeEps(eps, 3).image)).toBe(VALUE);
  });

  it("an image fill paints the heart, not the square around it", () => {
    const props = shapedCode("heart", {
      bgColor: {
        type: "image",
        src: LIGHT_PICTURE,
        fit: "cover",
        scale: 1,
        position: "center",
        opacity: 1,
        underlay: "#fef9c3",
      },
    });
    const svg = renderSvg(props);
    expect(svg).toMatch(
      /<path d="M256 [^"]+Z" fill="url\(#img-[^)]+\)"><\/path>/
    );
    const image = rasterizeSvg(svg, { width: 512, background: "#000000" });
    const at = (x: number, y: number) =>
      Array.from(image.data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 3));
    // The artwork's corner is outside the heart: the page shows through
    expect(at(4, 508)).toEqual([0, 0, 0]);
    const n = symbol(VALUE);
    const layout = getLayoutMargin(n, 0, "heart");
    const ring = Math.round(((layout - 1.5) * 512) / (n + 2 * layout));
    // The quiet ring, inside: one of the picture's two light tones
    expect(["254,249,195", "224,242,254"]).toContain(at(256, ring).join(","));
    for (const modulePx of [4, 6, 9]) {
      expect(capture(props, { modulePx })).toBe(VALUE);
    }
  });
});

// The score decodes the artwork at fixed widths (96, 160 and 320 px), so a
// shaped code, whose symbol is a smaller part of it, scores lower at the
// same width: the honest answer, since it must print bigger to scan as far.
describe("the scan score counts the smaller symbol", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("square > circle > heart at the same width, from decoding alone", async () => {
    const score = (shape: QRCodeShape) =>
      getScanScore({ ...shapedCode(shape), size: 1024 });
    const square = await score("square");
    const circle = await score("circle");
    const heart = await score("heart");
    const cloud = await score(silhouettes.cloud);
    expect(square.score).toBeGreaterThan(circle.score);
    expect(circle.score).toBeGreaterThan(heart.score);
    for (const result of [heart, cloud]) {
      expect(result.grade).not.toBe("poor");
      const failed = result.checks.filter((check) => !check.passed);
      expect(failed.every((check) => check.id.startsWith("decode-"))).toBe(
        true
      );
      // Close up it reads; the ring counts as the quiet zone
      expect(result.checks.find((c) => c.id === "decode-320")?.passed).toBe(
        true
      );
      expect(result.checks.find((c) => c.id === "quiet-zone")?.message).toBe(
        "Quiet zone of 3 modules (4 is ideal)"
      );
    }
  });
});
