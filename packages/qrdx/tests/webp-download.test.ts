/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// WebP downloads in each kind of browser, on the fake DOM (tests/support):
// a canvas encoder that writes lossless WebP (Chrome) is used as is; one
// that only writes lossy WebP at quality 1, or none at all (Safari hands
// back a PNG), is replaced by the built-in lossless encoder. The file is
// always real WebP, at the canvas size, transparent where the code is, and
// it scans.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadQRCode,
  getDownloadFilename,
  getQRAsWebP,
  getQRCodeDataUrl,
} from "../src/download";
import { getFrameDimensions } from "../src/frame";
import { getQRAsCanvas } from "../src/index";
import { getWebPCompression, isWebPFile } from "../src/utils/webp";
import { canvasToWebP } from "../src/webp";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { decodeQR } from "./support/raster";

type Encoder = "lossless" | "lossy" | "png" | "none";

interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): {
    getImageData(
      x: number,
      y: number,
      w: number,
      h: number
    ): { data: Uint8ClampedArray };
  };
  toBlob?: unknown;
}

let uninstall: () => void = () => undefined;
let encoder: Encoder = "lossless";
const requests: { type: string; quality: number | undefined }[] = [];

/** The canvas encoder of a browser of each kind, made with libwebp. */
function installToBlob() {
  const canvas = document.createElement("canvas") as unknown as CanvasLike;
  const prototype = Object.getPrototypeOf(canvas) as CanvasLike;
  prototype.toBlob = function toBlob(
    this: CanvasLike,
    callback: (blob: Blob | null) => void,
    type: string,
    quality?: number
  ) {
    requests.push({ type, quality });
    const { data } = this.getContext("2d").getImageData(
      0,
      0,
      this.width,
      this.height
    );
    const image = sharp(Buffer.from(data), {
      raw: { width: this.width, height: this.height, channels: 4 },
    });
    if (encoder === "none") {
      setTimeout(() => callback(null), 0);
      return;
    }
    // Chrome writes lossless at quality 1; the "lossy" browser never does.
    const encoded =
      encoder === "png"
        ? image.png().toBuffer()
        : encoder === "lossless" && quality === 1
          ? image.webp({ lossless: true }).toBuffer()
          : image
              .webp({ quality: Math.round((quality ?? 0.8) * 100) })
              .toBuffer();
    encoded.then((buffer) =>
      callback(
        new Blob([new Uint8Array(buffer)], {
          type: encoder === "png" ? "image/png" : "image/webp",
        })
      )
    );
  };
}

beforeEach(() => {
  uninstall = installFakeDom();
  encoder = "lossless";
  requests.length = 0;
  installToBlob();
});

afterEach(() => {
  uninstall();
});

const VALUE = "https://qrdx.dev/webp";

async function pixelsOf(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), info };
}

async function bytesOf(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("getQRAsWebP", () => {
  it.each([
    ["lossless", "the browser's file"],
    ["lossy", "the built-in encoder (the browser's was lossy)"],
    ["png", "the built-in encoder (the browser made a PNG)"],
    ["none", "the built-in encoder (the browser made nothing)"],
  ] as const)("%s canvas encoder: lossless WebP from %s", async (kind) => {
    encoder = kind;
    const blob = await getQRAsWebP({ value: VALUE, size: 320 });
    expect(blob.type).toBe("image/webp");
    const bytes = await bytesOf(blob);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WEBP");
    expect(getWebPCompression(bytes)).toBe("lossless");
    expect(requests).toEqual([{ type: "image/webp", quality: 1 }]);

    const { data, info } = await pixelsOf(bytes);
    expect([info.width, info.height]).toEqual([320, 320]);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      VALUE
    );
  });

  it("is pixel for pixel the canvas, wherever it was encoded", async () => {
    const canvas = (await getQRAsCanvas(
      { value: VALUE, size: 200, bgColor: "transparent" },
      "image/webp",
      true
    )) as unknown as CanvasLike;
    const { data } = canvas.getContext("2d").getImageData(0, 0, 200, 200);
    for (const kind of ["lossless", "png"] as const) {
      encoder = kind;
      const blob = await canvasToWebP(canvas as unknown as HTMLCanvasElement);
      const decoded = await pixelsOf(await bytesOf(blob));
      expect(Buffer.compare(Buffer.from(decoded.data), Buffer.from(data))).toBe(
        0
      );
    }
  });

  it("keeps a transparent background transparent", async () => {
    for (const kind of ["lossless", "png"] as const) {
      encoder = kind;
      const blob = await getQRAsWebP({
        value: VALUE,
        size: 240,
        bgColor: "transparent",
        margin: 4,
      });
      const { data, info } = await pixelsOf(await bytesOf(blob));
      expect(info.channels).toBe(4);
      // The quiet zone is fully transparent; the modules are opaque.
      expect(data[3]).toBe(0);
      expect(data[(info.width * info.height - 1) * 4 + 3]).toBe(0);
      const alphas = new Set<number>();
      for (let index = 3; index < data.length; index += 4) {
        alphas.add(data[index] as number);
      }
      expect(alphas.has(255)).toBe(true);
    }
  });

  it("includes a frame in its size", async () => {
    encoder = "png";
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const blob = await getQRAsWebP({ value: VALUE, size: 300, frame });
    const { info } = await pixelsOf(await bytesOf(blob));
    const { width, height } = getFrameDimensions(300, frame);
    expect([info.width, info.height]).toEqual([
      Math.round(width),
      Math.round(height),
    ]);
  });

  it("asks for lossy WebP when given a quality, and keeps it", async () => {
    encoder = "lossy";
    const blob = await getQRAsWebP(
      { value: VALUE, size: 200 },
      { quality: 0.8 }
    );
    expect(requests).toEqual([{ type: "image/webp", quality: 0.8 }]);
    expect(getWebPCompression(await bytesOf(blob))).toBe("lossy");
  });

  it("falls back to lossless when a quality is given but WebP can't be made", async () => {
    encoder = "png";
    const blob = await getQRAsWebP(
      { value: VALUE, size: 200 },
      { quality: 0.5 }
    );
    expect(getWebPCompression(await bytesOf(blob))).toBe("lossless");
  });
});

describe("WebP downloads", () => {
  let saved: { name: string; href: string }[] = [];

  beforeEach(() => {
    saved = [];
    const createCanvas = document.createElement.bind(document);
    Object.assign(globalThis.document, {
      createElement(tag: string) {
        if (tag === "a") {
          const link = {
            href: "",
            download: "",
            click: () => saved.push({ name: link.download, href: link.href }),
          };
          return link;
        }
        return createCanvas(tag);
      },
      body: { appendChild: () => undefined, removeChild: () => undefined },
    });
  });

  it("saves a .webp named after its pixel size that holds WebP", async () => {
    encoder = "png";
    await downloadQRCode(
      { value: VALUE },
      { format: "webp", size: { width: 400, height: 400 } }
    );
    expect(saved).toHaveLength(1);
    const [file] = saved;
    expect(file?.name).toBe("qr-code-400x400.webp");
    expect(file?.href.startsWith("data:image/webp;base64,")).toBe(true);
    const bytes = new Uint8Array(
      Buffer.from(file?.href.split(",")[1] ?? "", "base64")
    );
    expect(isWebPFile(bytes)).toBe(true);
    const { info } = await pixelsOf(bytes);
    expect([info.width, info.height]).toEqual([400, 400]);
  });

  it("names a framed WebP after its canvas", () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const { width, height } = getFrameDimensions(400, frame);
    expect(
      getDownloadFilename("webp", { width: 400, height: 400 }, frame)
    ).toBe(`qr-code-${Math.round(width)}x${Math.round(height)}.webp`);
  });

  it("returns WebP data URLs, through getQRCodeDataUrl and getQRAsCanvas", async () => {
    for (const kind of ["lossless", "png"] as const) {
      encoder = kind;
      const props: QRProps = { value: VALUE };
      const fromDataUrl = await getQRCodeDataUrl(props, "webp", {
        width: 128,
        height: 128,
      });
      const fromCanvas = (await getQRAsCanvas(
        { ...props, size: 128 },
        "image/webp"
      )) as string;
      for (const url of [fromDataUrl, fromCanvas]) {
        expect(url.startsWith("data:image/webp;base64,")).toBe(true);
        const bytes = new Uint8Array(
          Buffer.from(url.split(",")[1] ?? "", "base64")
        );
        expect(getWebPCompression(bytes)).toBe("lossless");
      }
    }
  });
});
