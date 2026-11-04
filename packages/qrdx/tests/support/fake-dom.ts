// Minimal browser stand-ins (document.createElement("canvas"), Image) backed
// by the test rasterizer, so browser-only code such as getScanScore runs in
// Node deterministically. Only the calls qrdx makes are implemented.

import { parseColor } from "../../src/utils/parse-color";
import type { SvgNode } from "../../src/utils/svg-geometry";
import { length } from "../../src/utils/svg-painter";
import {
  createImage,
  drawSvg,
  fillPolygons,
  type RasterImage,
  svgFromDataUri,
} from "./raster";

const hex = (n: number) => n.toString(16).padStart(2, "0");

/** Samples per axis when averaging a source footprint into one pixel. */
const RESAMPLE_TAPS = 3;

/**
 * Draws the [sx, sy, sw, sh] region of `from` into [dx, dy, dw, dh] of `to`,
 * averaging a few samples per destination pixel (close enough to a browser's
 * smoothed scaling for decode tests), composited source-over.
 */
function drawCanvasRegion(
  from: RasterImage,
  to: RasterImage,
  [sx, sy, sw, sh, dx, dy, dw, dh]: number[]
) {
  if (!(sw && sh && dw && dh)) return;
  const x0 = Math.max(0, Math.floor(dx));
  const y0 = Math.max(0, Math.floor(dy));
  const x1 = Math.min(to.width, Math.ceil(dx + dw));
  const y1 = Math.min(to.height, Math.ceil(dy + dh));
  const scaleX = sw / dw;
  const scaleY = sh / dh;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const sum = [0, 0, 0, 0];
      let taps = 0;
      for (let ty = 0; ty < RESAMPLE_TAPS; ty++) {
        for (let tx = 0; tx < RESAMPLE_TAPS; tx++) {
          const px = Math.floor(
            sx + (x - dx + (tx + 0.5) / RESAMPLE_TAPS) * scaleX
          );
          const py = Math.floor(
            sy + (y - dy + (ty + 0.5) / RESAMPLE_TAPS) * scaleY
          );
          if (px < 0 || py < 0 || px >= from.width || py >= from.height) {
            continue;
          }
          const at = (py * from.width + px) * 4;
          for (let c = 0; c < 4; c++) sum[c] += from.data[at + c] as number;
          taps++;
        }
      }
      if (!taps) continue;
      const alpha = sum[3] / taps / 255;
      const out = (y * to.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        to.data[out + c] = Math.round(
          (sum[c] / taps) * alpha + (to.data[out + c] as number) * (1 - alpha)
        );
      }
      to.data[out + 3] = Math.round(
        255 * (alpha + ((to.data[out + 3] as number) / 255) * (1 - alpha))
      );
    }
  }
}

class FakeImage {
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  svg: SvgNode | null = null;
  private source = "";
  private readonly listeners = new Map<string, (() => void)[]>();

  get width() {
    return this.naturalWidth;
  }

  get height() {
    return this.naturalHeight;
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    const svg = svgFromDataUri(value);
    setTimeout(() => {
      this.complete = true;
      if (svg) {
        this.svg = svg;
        this.naturalWidth = length(svg.attrs.width, 0, 0) || 300;
        this.naturalHeight =
          length(svg.attrs.height, 0, 0) || this.naturalWidth;
        this.onload?.();
        for (const listener of this.listeners.get("load") ?? []) listener();
      } else {
        this.onerror?.(new Error("unsupported image"));
        for (const listener of this.listeners.get("error") ?? []) listener();
      }
    }, 0);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  decode() {
    return Promise.resolve();
  }
}

class FakeContext {
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "high";
  private style = "#000000";
  private readonly canvas: FakeCanvas;

  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }

  get fillStyle() {
    return this.style;
  }

  set fillStyle(value: string) {
    const color = parseColor(value);
    if (color) {
      this.style =
        color.a >= 1
          ? `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
          : `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }
  }

  fillRect(x: number, y: number, width: number, height: number) {
    const color = parseColor(this.style);
    if (!color) return;
    fillPolygons(
      this.canvas.image,
      [
        [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ],
      ],
      color,
      color.a
    );
  }

  drawImage(source: FakeImage | FakeCanvas, ...args: number[]) {
    if (source instanceof FakeImage) {
      const [dx = 0, dy = 0, dw, dh] = args;
      if (!source.svg) throw new Error("image not loaded");
      drawSvg(
        this.canvas.image,
        source.svg,
        dx,
        dy,
        dw ?? source.naturalWidth,
        dh ?? source.naturalHeight
      );
      return;
    }
    // drawImage(canvas, dx, dy[, dw, dh]) or the 9-argument crop form.
    const crop =
      args.length >= 8
        ? args
        : [
            0,
            0,
            source.width,
            source.height,
            args[0] ?? 0,
            args[1] ?? 0,
            args[2] ?? source.width,
            args[3] ?? source.height,
          ];
    drawCanvasRegion(source.image, this.canvas.image, crop);
  }

  getImageData(x: number, y: number, width: number, height: number) {
    const { image } = this.canvas;
    const out = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const from = ((y + row) * image.width + x) * 4;
      out.set(image.data.subarray(from, from + width * 4), row * width * 4);
    }
    return { data: out, width, height, colorSpace: "srgb" };
  }
}

class FakeCanvas {
  private w = 300;
  private h = 150;
  private buffer: RasterImage | null = null;

  get width() {
    return this.w;
  }

  set width(value: number) {
    this.w = Math.max(1, Math.floor(value));
    this.buffer = null;
  }

  get height() {
    return this.h;
  }

  set height(value: number) {
    this.h = Math.max(1, Math.floor(value));
    this.buffer = null;
  }

  get image(): RasterImage {
    // A new canvas is transparent black.
    this.buffer ??= createImage(this.w, this.h, null);
    return this.buffer;
  }

  getContext(type: string) {
    return type === "2d" ? new FakeContext(this) : null;
  }

  remove() {
    // Detached canvases need no cleanup.
  }

  toDataURL() {
    throw new Error("toDataURL is not supported by the fake DOM");
  }
}

/** Installs the fakes on globalThis; returns a function that removes them. */
export function installFakeDom(): () => void {
  const previous = {
    document: (globalThis as Record<string, unknown>).document,
    Image: (globalThis as Record<string, unknown>).Image,
  };
  Object.assign(globalThis, {
    document: {
      createElement(tag: string) {
        if (tag === "canvas") return new FakeCanvas();
        throw new Error(`fake DOM cannot create <${tag}>`);
      },
    },
    Image: FakeImage,
  });
  return () => {
    Object.assign(globalThis, previous);
    if (previous.document === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previous.Image === undefined) {
      Reflect.deleteProperty(globalThis, "Image");
    }
  };
}
