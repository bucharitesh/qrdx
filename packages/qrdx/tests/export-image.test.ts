/** biome-ignore-all lint/style/noMagicNumbers: sample points and tolerances */
// Image fills: a picture painted through the dots, the eyes or the
// background. The SVG draws it as a <pattern> over the whole code; the PDF
// embeds it once and paints it inside each shape; EPS refuses it. With the
// six sample photos (fixtures copied from
// apps/app/public/images/art-samples/photos), each fill decodes at phone
// distances once its opacity over the underlay passes the scan score's
// contrast check for pictures (7:1 in the code, 12:1 behind it, judged by
// the picture's lightest and darkest tenth, getImageTonesFromPixels):
// sharp at every distance, and through the camera model (blur and contrast
// loss) at two of the three at least. A picture's detail inside the modules
// makes jsQR miss the odd distance at one exact blur and scale; the scan
// score reports that as fragile at that size.
import { readFileSync } from "node:fs";
import { describe, expect, it, test } from "vitest";
import { EPS_IMAGE_FILL_REASON, getQRAsEPS, hasImageFill } from "../src/eps";
import { getQRAsPrintPDFBuffer } from "../src/print";
import {
  getImageTonesFromPixels,
  getScanContrast,
  type ImageToneMap,
  SCAN_CONTRAST_MIN,
  SCAN_IMAGE_CONTRAST_MIN,
} from "../src/scan-score";
import { decodePng } from "../src/utils/png";
import { renderPrintSVG } from "../src/utils/print-shared";
import {
  colorConfigSchema,
  getNormalizedColor,
  type ImagePaint,
  type QRProps,
} from "../types";
import {
  channelDistance,
  pixel,
  rasterizePdf,
  readPdf,
} from "./support/print-raster";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import { decodeQR, type RasterImage, rasterizeSvg } from "./support/raster";

/** Distances (px per module) where the code fails, sharp and through the camera. */
function misses(props: QRProps, images: Map<string, RasterImage>) {
  const failing = (camera: boolean) =>
    PHONE_MODULE_SIZES.filter(
      (modulePx) => capture(props, { modulePx, camera, images }) !== VALUE
    );
  return { sharp: failing(false), camera: failing(true) };
}

/**
 * Scans at phone distances: through the camera at two of three at least,
 * and sharp at every one (`sharpMisses` allows some: jsQR misses a flat gray
 * background on a white page at exactly 9 px per module too, photo or not).
 */
function expectScans(
  props: QRProps,
  images: Map<string, RasterImage>,
  label: string,
  sharpMisses = 0
) {
  const missed = misses(props, images);
  expect(
    missed.sharp.length,
    `${label}: sharp missed ${missed.sharp.join(", ")} px`
  ).toBeLessThanOrEqual(sharpMisses);
  expect(
    missed.camera.length,
    `${label}: camera missed ${missed.camera.join(", ")} px`
  ).toBeLessThanOrEqual(1);
  if (missed.camera.length > 0) {
    console.info(
      `${label}: through the camera, fragile at ${missed.camera.join(", ")} px per module`
    );
  }
}

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const FIXTURES = new URL("./fixtures/art/", import.meta.url);
const PHOTOS = [
  "dog",
  "flowers",
  "latte",
  "mountain",
  "portrait",
  "sneaker",
] as const;

interface Photo {
  src: string;
  bitmap: RasterImage;
}

const photos = new Map<string, Photo>();
async function photo(name: string): Promise<Photo> {
  const cached = photos.get(name);
  if (cached) return cached;
  const bytes = readFileSync(new URL(`${name}.png`, FIXTURES));
  const decoded = await decodePng(new Uint8Array(bytes));
  if (!decoded) throw new Error(`${name}.png doesn't decode`);
  const loaded = {
    src: `data:image/png;base64,${bytes.toString("base64")}`,
    bitmap: {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.width,
      height: decoded.height,
    },
  };
  photos.set(name, loaded);
  return loaded;
}

const BASE: QRProps = {
  value: VALUE,
  level: "M",
  margin: 4,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

const fill = (src: string, extra: Partial<ImagePaint> = {}): ImagePaint => ({
  type: "image",
  src,
  fit: "cover",
  scale: 1,
  position: "center",
  opacity: 1,
  ...extra,
});

/**
 * The highest opacity over `underlay` at which the picture passes the scan
 * score's contrast check in `role` (what the picker's fix looks for), or
 * null when even the bare underlay doesn't.
 */
function scannableOpacity(
  props: QRProps,
  role: "fgColor" | "bgColor",
  paint: ImagePaint,
  tones: ImageToneMap
): number | null {
  const passes = (opacity: number) => {
    const { ratio, required } = getScanContrast(
      { ...props, [role]: { ...paint, opacity } },
      { imageTones: tones }
    );
    return ratio >= required + 0.1;
  };
  if (passes(1)) return 1;
  if (!passes(0)) return null;
  let good = 0;
  let bad = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (good + bad) / 2;
    if (passes(mid)) good = mid;
    else bad = mid;
  }
  return Math.floor(good * 100) / 100;
}

const imagesOf = (...list: Photo[]) =>
  new Map(list.map((item) => [item.src, item.bitmap]));

// ── The type ───────────────────────────────────────────────────────────────

describe("image paint type", () => {
  it("validates with defaults and previews as a CSS background", () => {
    const parsed = colorConfigSchema.parse({
      type: "image",
      src: "data:image/png;base64,AAAA",
    });
    expect(parsed).toEqual(fill("data:image/png;base64,AAAA"));
    expect(
      colorConfigSchema.safeParse({ type: "image", src: "", fit: "cover" })
        .success
    ).toBe(false);
    expect(
      getNormalizedColor(
        fill("data:x", { position: "top-left", underlay: "#000000" })
      )
    ).toBe('url("data:x") left top / cover no-repeat, #000000');
    expect(getNormalizedColor(fill("data:x", { fit: "tile", scale: 2 }))).toBe(
      'url("data:x") center / 50% auto repeat, transparent'
    );
  });
});

// ── SVG ────────────────────────────────────────────────────────────────────

describe("SVG", () => {
  it("draws the picture in a pattern over the whole code", async () => {
    const { src } = await photo("dog");
    const svg = renderSvg({
      ...BASE,
      size: 400,
      fgColor: fill(src, { opacity: 0.6, underlay: "#111827" }),
    });
    const pattern = /<pattern[^>]*>[\s\S]*?<\/pattern>/.exec(svg)?.[0] ?? "";
    expect(pattern).toMatch(
      /<pattern height="400" id="img-[^"]+" patternUnits="userSpaceOnUse" width="400" x="0" y="0">/
    );
    expect(pattern).toContain('<rect fill="#111827" height="400" width="400"');
    expect(pattern).toMatch(
      /<image height="400" href="data:image\/png;base64,[^"]+" opacity="0.6" preserveAspectRatio="xMidYMid slice" width="400" x="0" y="0">/
    );
    expect(svg).toMatch(/<g fill="url\(#img-[^)]+\)">/);
  });

  it("places it by fit, position and scale", async () => {
    const { src } = await photo("dog");
    const markup = (paint: Partial<ImagePaint>) =>
      /<image [^>]*>/.exec(
        renderSvg({ ...BASE, size: 400, fgColor: fill(src, paint) })
      )?.[0] ?? "";
    expect(markup({ fit: "contain", position: "top-left" })).toContain(
      'preserveAspectRatio="xMinYMin meet"'
    );
    // Twice the code's size, anchored bottom right: it reaches up and left
    const zoomed = markup({ scale: 2, position: "bottom-right" });
    expect(zoomed).toContain('preserveAspectRatio="xMaxYMax slice"');
    expect(zoomed).toMatch(/height="800".*width="800" x="-400" y="-400"/);
    // Tiles a quarter of the code wide at scale 1, half at 2
    const tiled = renderSvg({
      ...BASE,
      size: 400,
      fgColor: fill(src, { fit: "tile", scale: 2 }),
    });
    expect(tiled).toMatch(/<pattern height="200" [^>]*width="200"/);
  });

  it("embeds a picture shared by the dots and the eyes once", async () => {
    const { src } = await photo("dog");
    const paint = fill(src, { underlay: "#000000", opacity: 0.5 });
    const svg = renderSvg({
      ...BASE,
      fgColor: paint,
      eyeColor: paint,
      dotColor: paint,
    });
    expect(svg.match(/<image /g)).toHaveLength(1);
    expect(svg.match(/<pattern /g)).toHaveLength(1);
  });

  it("paints the photo at its opacity over the underlay", async () => {
    const dog = await photo("dog");
    // The 160 px photo covers the 1000-unit code exactly at scale 1
    const props: QRProps = {
      ...BASE,
      bgColor: fill(dog.src, { opacity: 0.5, underlay: "#000000" }),
    };
    const image = rasterizeSvg(await renderPrintSVG(props), {
      width: 800,
      images: imagesOf(dog),
    });
    // A point in the quiet zone (background only)
    const [x, y] = [20, 400];
    const source = pixel(
      dog.bitmap as never,
      Math.floor((x / 800) * 160),
      Math.floor((y / 800) * 160)
    );
    const expected = source.map((v) => v * 0.5) as [number, number, number];
    expect(channelDistance(pixel(image, x, y), expected)).toBeLessThanOrEqual(
      2
    );
  });
});

// ── Decoding with the sample photos ────────────────────────────────────────

describe.each(PHOTOS)("%s", (name) => {
  test("as the dots, darkened until it passes, scans at phone distances", async () => {
    const picture = await photo(name);
    const tones = getImageTonesFromPixels(picture.bitmap);
    expect(tones).not.toBeNull();
    const imageTones = { [picture.src]: tones as NonNullable<typeof tones> };
    const paint = fill(picture.src, { underlay: "#000000" });
    const opacity = scannableOpacity(BASE, "fgColor", paint, imageTones);
    expect(opacity).not.toBeNull();
    const props: QRProps = {
      ...BASE,
      fgColor: { ...paint, opacity: opacity as number },
      eyeColor: "#000000",
    };
    const contrast = getScanContrast(props, { imageTones });
    expect(contrast.required).toBe(SCAN_IMAGE_CONTRAST_MIN.code);
    expect(contrast.ratio).toBeGreaterThanOrEqual(contrast.required);
    expectScans(props, imagesOf(picture), `${name} dots (opacity ${opacity})`);
  });

  test("as the background, faded until it passes, scans at phone distances", async () => {
    const picture = await photo(name);
    const tones = getImageTonesFromPixels(picture.bitmap);
    const imageTones = { [picture.src]: tones as NonNullable<typeof tones> };
    const paint = fill(picture.src, { underlay: "#ffffff" });
    const props: QRProps = { ...BASE, fgColor: "#111111" };
    const opacity = scannableOpacity(props, "bgColor", paint, imageTones);
    expect(opacity).not.toBeNull();
    const faded = {
      ...props,
      bgColor: { ...paint, opacity: opacity as number },
    };
    // A faded photo reads as a gray background: like a flat gray, it can
    // miss 9 px sharp on a white page (see expectScans)
    expectScans(
      faded,
      imagesOf(picture),
      `${name} background (opacity ${opacity})`,
      1
    );
  });
});

describe("dots and eyes sharing a picture", () => {
  it("decode at phone distances", async () => {
    const picture = await photo("mountain");
    const tones = getImageTonesFromPixels(picture.bitmap);
    const imageTones = { [picture.src]: tones as NonNullable<typeof tones> };
    const paint = fill(picture.src, { underlay: "#000000" });
    const opacity = scannableOpacity(BASE, "fgColor", paint, imageTones);
    const shared = { ...paint, opacity: opacity as number };
    const props: QRProps = {
      ...BASE,
      fgColor: shared,
      eyeColor: shared,
      dotColor: shared,
    };
    expectScans(props, imagesOf(picture), "mountain dots and eyes");
  });
});

describe("contrast with a picture", () => {
  it("asks more of a picture, judged by its tones, and the underlay without them", async () => {
    const latte = await photo("latte");
    const tones = getImageTonesFromPixels(latte.bitmap);
    const imageTones = { [latte.src]: tones as NonNullable<typeof tones> };
    const bare: QRProps = { ...BASE, fgColor: fill(latte.src) };
    const dots = getScanContrast(bare, { imageTones });
    expect(dots.required).toBe(SCAN_IMAGE_CONTRAST_MIN.code);
    expect(dots.ratio).toBeLessThan(SCAN_CONTRAST_MIN);
    const behind = getScanContrast(
      { ...BASE, bgColor: fill(latte.src) },
      { imageTones }
    );
    expect(behind.required).toBe(SCAN_IMAGE_CONTRAST_MIN.background);
    // Flat colors keep the usual line
    expect(getScanContrast(BASE).required).toBe(SCAN_CONTRAST_MIN);
    // Without tones the picture counts as its underlay
    expect(
      getScanContrast({
        ...BASE,
        fgColor: fill(latte.src, { underlay: "#000000" }),
      }).ratio
    ).toBeGreaterThan(20);
  });
});

// ── PDF and EPS ────────────────────────────────────────────────────────────

describe("PDF", () => {
  it("embeds the picture once, paints it in each shape and decodes", async () => {
    const picture = await photo("flowers");
    const tones = getImageTonesFromPixels(picture.bitmap);
    const imageTones = { [picture.src]: tones as NonNullable<typeof tones> };
    const paint = fill(picture.src, { underlay: "#000000" });
    const opacity = scannableOpacity(BASE, "fgColor", paint, imageTones);
    const props: QRProps = {
      ...BASE,
      fgColor: { ...paint, opacity: opacity as number },
    };
    const buffer = await getQRAsPrintPDFBuffer(props, { size: 50 });
    const pdf = readPdf(buffer);
    expect(pdf.xObjects.size).toBe(1);
    expect(pdf.text.match(/\/Subtype \/Image/g)).toHaveLength(1);
    expect(pdf.content).toMatch(/\/GS\d+ gs/);
    const rendered = rasterizePdf(buffer, 3);
    expect(rendered.images).toBeGreaterThan(150);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    // Same picture as the SVG at module centres
    const svg = rasterizeSvg(await renderPrintSVG(props), {
      width: rendered.image.width,
      images: imagesOf(picture),
    });
    expect(decodeQR(svg)).toBe(VALUE);
  });
});

describe("EPS", () => {
  it("refuses image fills with the reason", async () => {
    const { src } = await photo("dog");
    const props: QRProps = { ...BASE, bgColor: fill(src) };
    expect(hasImageFill(props)).toBe(true);
    expect(
      hasImageFill({ ...BASE, eyeColors: { topLeft: { inner: fill(src) } } })
    ).toBe(true);
    expect(hasImageFill(BASE)).toBe(false);
    await expect(getQRAsEPS(props)).rejects.toThrow(EPS_IMAGE_FILL_REASON);
  });
});
