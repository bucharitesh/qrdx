/** biome-ignore-all lint/style/noMagicNumbers: geometry under test */
// Logo crop (imageSettings.shape), the plate behind it (imageSettings.plate)
// and background removal. The crop is an SVG <clipPath>; the print PDF and
// EPS clip to the same outline before drawing the image, the plate is a
// plain filled shape, and each variant decodes at three phone distances.
import { beforeAll, describe, expect, it } from "vitest";
import { getQRAsEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import { LOGO_PLATE_INSET } from "../src/logo";
import { removeLogoBackdrop } from "../src/logo-cleanup";
import { getQRAsPrintPDFBuffer } from "../src/print";
import type { LogoOptions, QRProps } from "../types";
import {
  channelDistance,
  rasterizeEps,
  rasterizePdf,
  readPdf,
} from "./support/print-raster";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import { createImage, decodeQR, toPng } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
const PLATE = "#fde68a";

let LOGO_PNG = "";
beforeAll(async () => {
  const png = await toPng(createImage(32, 32, "#1d4ed8"));
  LOGO_PNG = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
});

function props(logoOptions: LogoOptions, extra: Partial<QRProps> = {}) {
  return {
    ...getQRData({
      value: VALUE,
      size: 256,
      margin: 4,
      level: "H",
      logo: LOGO_PNG,
      logoOptions,
    }),
    level: "H" as const,
    bodyPattern: "square" as const,
    cornerEyePattern: "square" as const,
    cornerEyeDotPattern: "square" as const,
    ...extra,
  };
}

const imageTag = (svg: string) => /<image\b[^>]*>/.exec(svg)?.[0] ?? "";
const attr = (tag: string, name: string) =>
  Number(new RegExp(` ${name}="([\\d.]+)"`).exec(tag)?.[1]);

describe("SVG", () => {
  it("leaves a square logo without a plate exactly as before", () => {
    const svg = renderSvg(props({ size: 0.2 }));
    expect(svg).not.toContain("<clipPath");
    expect(imageTag(svg)).not.toContain("clip-path");
  });

  it("crops to a circle with a clip path the image uses", () => {
    const svg = renderSvg(props({ size: 0.2, shape: "circle" }));
    const id = /<clipPath id="([^"]+)"><circle /.exec(svg)?.[1];
    expect(id).toBeTruthy();
    expect(imageTag(svg)).toContain(`clip-path="url(#${id})"`);
  });

  it("rounds the corners with a rounded rect", () => {
    const svg = renderSvg(props({ size: 0.2, shape: "rounded" }));
    expect(svg).toMatch(/<clipPath id="[^"]+"><rect [^>]*rx="[\d.]+"/);
  });

  it("draws the plate in the logo's shape and insets the logo on it", () => {
    const plain = renderSvg(props({ size: 0.2 }));
    const svg = renderSvg(props({ size: 0.2, shape: "circle", plate: PLATE }));
    expect(svg).toContain(`<circle cx="`);
    expect(svg).toMatch(new RegExp(`<circle [^>]*fill="${PLATE}"`));
    const before = imageTag(plain);
    const after = imageTag(svg);
    expect(attr(after, "width")).toBeCloseTo(
      attr(before, "width") * (1 - 2 * LOGO_PLATE_INSET),
      1
    );
    // The plate comes before (under) the image
    expect(svg.indexOf(PLATE)).toBeLessThan(svg.indexOf("<image"));
  });

  it("gives two codes with the same logo box the same clip id", () => {
    const a = renderSvg(props({ size: 0.2, shape: "circle" }));
    const b = renderSvg(props({ size: 0.2, shape: "circle" }));
    const id = (svg: string) => /<clipPath id="([^"]+)"/.exec(svg)?.[1];
    expect(id(a)).toBe(id(b));
    expect(id(renderSvg(props({ size: 0.25, shape: "circle" })))).not.toBe(
      id(a)
    );
  });
});

describe("each variant decodes at three phone distances", () => {
  const variants: [string, LogoOptions][] = [
    ["circle crop", { size: 0.22, shape: "circle" }],
    ["rounded crop", { size: 0.22, shape: "rounded" }],
    ["circle crop on a plate", { size: 0.22, shape: "circle", plate: PLATE }],
    ["rounded plate", { size: 0.22, shape: "rounded", plate: "#ffffff" }],
    ["square plate", { size: 0.22, plate: "#e5e7eb" }],
  ];
  for (const [name, logoOptions] of variants) {
    it(name, () => {
      const code = props(logoOptions);
      expect(
        PHONE_MODULE_SIZES.filter(
          (modulePx) => capture(code, { modulePx }) !== VALUE
        )
      ).toEqual([]);
    });
  }
});

describe("print PDF and EPS clip the logo", () => {
  const shaped = () => props({ size: 0.22, shape: "circle", plate: PLATE });
  const plate: [number, number, number] = [0xfd, 0xe6, 0x8a];

  it("PDF: clips (W n) before drawing the image, and paints the plate", async () => {
    const buffer = await getQRAsPrintPDFBuffer(shaped(), {
      size: 50,
      unit: "mm",
    });
    const { content } = readPdf(buffer);
    expect(content).toMatch(/\bW\s+n\b[\s\S]*?\/\S+ Do/);
    const rendered = rasterizePdf(buffer, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    expect(
      rendered.fills.some((fill) => channelDistance(fill, plate) <= 2)
    ).toBe(true);
  });

  it("PDF: a square logo without a plate has no clip around its image", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props({ size: 0.22 }), {
      size: 50,
      unit: "mm",
    });
    expect(readPdf(buffer).content).not.toMatch(/\bW\s+n\b/);
  });

  it("EPS: clips before the image, and paints the plate", async () => {
    const eps = await getQRAsEPS(shaped(), { sizeMm: 50 });
    const clipAt = eps.search(/ clip n\n/);
    expect(clipAt).toBeGreaterThan(-1);
    expect(clipAt).toBeLessThan(eps.indexOf("/ImageType 1"));
    // The clip is undone after the image
    expect(
      eps.indexOf("grestore", eps.indexOf("/ImageType 1"))
    ).toBeGreaterThan(-1);
    const rendered = rasterizeEps(eps, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    expect(
      rendered.fills.some((fill) => channelDistance(fill, plate) <= 2)
    ).toBe(true);
  });
});

describe("removeLogoBackdrop", () => {
  /** A blue disc with a white hole, on a white (or `backdrop`) square. */
  function logo(backdrop = "#ffffff", size = 40) {
    const image = createImage(size, size, backdrop);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        if (d < size * 0.4 && d > size * 0.12) {
          const i = (y * size + x) * 4;
          image.data.set([29, 78, 216, 255], i);
        }
      }
    }
    return image;
  }
  const alphaAt = (
    img: { data: ArrayLike<number>; width: number },
    x: number,
    y: number
  ) => img.data[(y * img.width + x) * 4 + 3] as number;

  it("clears the background but keeps the same color inside the mark", () => {
    const source = logo();
    const cleaned = removeLogoBackdrop(source);
    expect(cleaned).not.toBeNull();
    const out = cleaned as NonNullable<typeof cleaned>;
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, 39, 20)).toBe(0);
    // The blue ring stays opaque, and so does the white hole it encloses
    expect(alphaAt(out, 20, 8)).toBe(255);
    expect(alphaAt(out, 20, 20)).toBe(255);
    // The source is not changed
    expect(alphaAt(source, 0, 0)).toBe(255);
  });

  it("works on a colored background too", () => {
    const cleaned = removeLogoBackdrop(logo("#fef3c7"));
    expect(cleaned && alphaAt(cleaned, 0, 0)).toBe(0);
  });

  it("returns null when there is no solid background", () => {
    expect(removeLogoBackdrop(logo("#00000000"))).toBeNull();
    const mixed = logo();
    mixed.data.set([255, 0, 0, 255], 0);
    expect(removeLogoBackdrop(mixed)).toBeNull();
    expect(
      removeLogoBackdrop({ width: 0, height: 0, data: new Uint8Array() })
    ).toBeNull();
  });
});
