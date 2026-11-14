import "server-only";

import { encode } from "jpeg-js";
import { decodePNGPixels } from "qrdx";
import { CHAT_BASE_STYLE, type ChatDesign } from "@/lib/chat-bots/styles";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { renderDesignPng } from "@/lib/qr-design/score";
import { QR_DEFAULTS, renderQrPng } from "@/lib/qr-render";

// The Bot API takes only JPEG for inline photo results
// (InlineQueryResultPhoto.photo_url), and the server's rasterizer makes PNG.
// So the same PNG the image API serves is decoded (the engine's PNG reader)
// and re-encoded as JPEG in plain JavaScript (jpeg-js): no native image
// library.

/** High enough that module edges stay crisp for scanners. */
const JPEG_QUALITY = 90;

/**
 * The image API's PNG of `data`: the default code (black on white), or
 * `design` drawn the way the image API draws a `style` and `logoIcon` (on
 * its defaults, error correction raised for a big logo).
 */
function renderPng(
  data: string,
  size: number,
  design: ChatDesign | null,
): Promise<ArrayBuffer | Uint8Array> {
  if (!design) return renderQrPng({ ...QR_DEFAULTS, data, size });
  const logo = design.logo ? logoIconDataUrl(design.logo) : undefined;
  return renderDesignPng(
    data,
    { ...CHAT_BASE_STYLE, ...design.styles, showLogo: Boolean(logo) },
    size,
    logo,
    { autoLevel: true },
  );
}

/** `data` as the image API's code in `design` (null: the default), as JPEG bytes. */
export async function renderQrJpeg(
  data: string,
  size: number,
  design: ChatDesign | null = null,
): Promise<Uint8Array> {
  const png = await renderPng(data, size, design);
  const pixels = await decodePNGPixels(new Uint8Array(png));
  if (!pixels) throw new Error("The rendered PNG couldn't be read");
  // JPEG has no alpha channel. The code sits on an opaque background, but a
  // frame's corners can be transparent: lay everything on white, as chat
  // apps show a PNG.
  const rgba = pixels.data;
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] as number;
    if (alpha === 255) continue;
    for (let channel = i; channel < i + 3; channel++) {
      rgba[channel] = Math.round(
        ((rgba[channel] as number) * alpha + 255 * (255 - alpha)) / 255,
      );
    }
    rgba[i + 3] = 255;
  }
  const jpeg = encode(
    { data: rgba, width: pixels.width, height: pixels.height },
    JPEG_QUALITY,
  );
  return new Uint8Array(jpeg.data);
}
