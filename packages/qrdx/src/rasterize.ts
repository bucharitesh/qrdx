/** biome-ignore-all lint/style/noMagicNumbers: image format magic bytes */
// Node-friendly rasterization for PNG export (getQRAsPNG in download.tsx).
// Both rasterizers are optional peer dependencies loaded only when a PNG is
// asked for, so installing qrdx never pulls in a native module:
//
// - @resvg/resvg-js is tried first: it draws the SVG the way browsers do,
//   embedded logos included (PNG, JPEG, GIF, WebP and SVG images).
// - sharp is tried next, but its bundled SVG renderer skips embedded <image>
//   elements, so the logo is located with a marker render and composited
//   onto the pixels afterwards.

type SharpFactory = typeof import("sharp").default;

/** A logo loaded for rasterizing: the raw bytes, plus the data URL the SVG embeds. */
export interface RasterLogo {
  bytes: Uint8Array;
  dataUrl: string;
}

const LOGO_FETCH_TIMEOUT_MS = 10_000;

const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x80_00) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x80_00));
  }
  return btoa(binary);
};

/**
 * Sniffs a file's first bytes into an image MIME type, or null. These are
 * the types the rasterizers draw (resvg renders PNG, JPEG, GIF and WebP
 * images, plus nested SVG, the same way browsers do).
 */
function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 512))
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    return "image/svg+xml";
  }
  return null;
}

/**
 * Loads a logo the way a Node export needs it: a data URL is decoded, an
 * http(s) URL is fetched, and anything else is read from disk when Node's
 * fs is available. Returns null when it can't be loaded or isn't an image
 * the rasterizers draw — the logo is left out then, the same thing the
 * browser path does when an <img> fails to load.
 */
export async function loadLogoForRasterizer(
  src: string
): Promise<RasterLogo | null> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    if (comma < 0) {
      return null;
    }
    // Whatever the caller handed over stays the <image> href; the bytes are
    // for sharp's composite path only and may fail to decode.
    try {
      const bytes = src.slice(5, comma).endsWith(";base64")
        ? base64ToBytes(src.slice(comma + 1))
        : new TextEncoder().encode(decodeURIComponent(src.slice(comma + 1)));
      return { bytes, dataUrl: src };
    } catch {
      return null;
    }
  }

  let bytes: Uint8Array;
  if (/^https?:\/\//i.test(src)) {
    try {
      const response = await fetch(src, {
        signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  } else if (typeof process !== "undefined" && process.versions?.node) {
    // A local path. The specifier is computed so browser bundlers never
    // try to resolve node:fs.
    try {
      const specifier = ["node:fs", "promises"].join("/");
      const fs = (await import(specifier)) as typeof import("node:fs/promises");
      bytes = new Uint8Array(await fs.readFile(src));
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const mime = sniffImageMime(bytes);
  if (!mime) {
    return null;
  }
  return { bytes, dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}` };
}

/**
 * Rasterizes the SVG the library renders into PNG bytes, at the SVG's own
 * size (a fractional frame size rounds the way the browser's canvas does).
 * The rasterizer is an optional peer dependency, loaded only here; when
 * neither is installed the error names what to install.
 */
export async function rasterizeSvgToPng(
  svg: string,
  logo: RasterLogo | null
): Promise<Uint8Array> {
  let Resvg: typeof import("@resvg/resvg-js").Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js"));
  } catch (resvgError) {
    // Not installed (or its binary didn't load): try sharp instead.
    return await rasterizeWithSharp(svg, logo, resvgError);
  }
  // fitTo "original" (the default) renders at the SVG's own width and
  // height, so the PNG is exactly as large as the SVG markup says.
  const rendered = new Resvg(svg).render();
  return new Uint8Array(rendered.asPng());
}

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function rasterizeWithSharp(
  svg: string,
  logo: RasterLogo | null,
  resvgError: unknown
): Promise<Uint8Array> {
  let sharp: SharpFactory;
  try {
    sharp = ((await import("sharp")) as { default: SharpFactory }).default;
  } catch (sharpError) {
    throw new Error(
      "PNG export in Node needs an optional rasterizer package: " +
        "`npm install @resvg/resvg-js` (draws embedded logos like a browser) " +
        "or `npm install sharp`. " +
        `(${describeError(resvgError)}; ${describeError(sharpError)})`
    );
  }

  const png = await sharp(new TextEncoder().encode(svg)).png().toBuffer();
  // sharp's bundled SVG renderer skips embedded <image> elements, so the
  // logo never reaches the pixels: find where it belongs and composite it.
  if (!logo) {
    return new Uint8Array(png);
  }
  const box = await findLogoBox(sharp, svg);
  if (!box) {
    return new Uint8Array(png);
  }
  const logoPng = await sharp(logo.bytes)
    .resize(box.width, box.height, { fit: "fill" })
    .png()
    .toBuffer();
  const composited = await sharp(png)
    .composite([{ input: logoPng, left: box.left, top: box.top }])
    .png()
    .toBuffer();
  return new Uint8Array(composited);
}

/**
 * Finds the logo's pixel box in the rendered output. The <image> is swapped
 * for a lone visible rect, so the box comes out right even inside template
 * transforms.
 */
async function findLogoBox(sharp: SharpFactory, svg: string) {
  const imageTag = svg.match(/<image\b[^>]*?(?:\/>|><\/image>)/)?.[0];
  if (!imageTag) {
    return null;
  }
  const markerTag = imageTag
    .replace(/^<image\b/, '<rect class="qrdx-logo-box"')
    .replace(/\shref="[^"]*"/, "")
    .replace(/(?:\/>|><\/image>)$/, ' fill="#000"/>');
  const markerSvg = svg
    .replace(imageTag, markerTag)
    .replace(
      /<svg\b[^>]*>/,
      (open) =>
        `${open}<style>*{visibility:hidden}.qrdx-logo-box{visibility:visible}</style>`
    );
  const { info } = await sharp(new TextEncoder().encode(markerSvg))
    .png()
    .trim()
    .toBuffer({ resolveWithObject: true });
  return {
    left: -(info.trimOffsetLeft ?? 0),
    top: -(info.trimOffsetTop ?? 0),
    width: info.width,
    height: info.height,
  };
}
