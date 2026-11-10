import "server-only";

import { encode } from "jpeg-js";
import { decodePNGPixels } from "qrdx";
import { QR_DEFAULTS, renderQrPng } from "@/lib/qr-render";

// The Bot API takes only JPEG for inline photo results
// (InlineQueryResultPhoto.photo_url), and the server's rasterizer makes PNG.
// So the same PNG the image API serves for these defaults is decoded (the
// engine's PNG reader) and re-encoded as JPEG in plain JavaScript (jpeg-js):
// no native image library.

/** High enough that module edges stay crisp for scanners. */
const JPEG_QUALITY = 90;

/** `data` as the image API's default code (black on white), as JPEG bytes. */
export async function renderQrJpeg(
  data: string,
  size: number,
): Promise<Uint8Array> {
  const png = await renderQrPng({ ...QR_DEFAULTS, data, size });
  const pixels = await decodePNGPixels(new Uint8Array(png));
  if (!pixels) throw new Error("The rendered PNG couldn't be read");
  // The code is drawn on an opaque white background, so dropping the alpha
  // channel (JPEG has none) changes nothing.
  const jpeg = encode(
    { data: pixels.data, width: pixels.width, height: pixels.height },
    JPEG_QUALITY,
  );
  return new Uint8Array(jpeg.data);
}
