import "server-only";

// The image API's pixel formats beyond PNG, converted on the server from
// the same PNG render with sharp (loaded only when one is asked for). To add
// a format: list it here and in `qrImageFormats` (lib/qr-render.ts), give it
// a content type and a case in convertPng; the route and the MCP links pick
// it up from there.

/** Formats made from the PNG render. */
export const CONVERTED_FORMATS = ["webp"] as const;
export type ConvertedFormat = (typeof CONVERTED_FORMATS)[number];

export const IMAGE_CONTENT_TYPES: Record<ConvertedFormat, string> = {
  webp: "image/webp",
};

export const isConvertedFormat = (format: string): format is ConvertedFormat =>
  (CONVERTED_FORMATS as readonly string[]).includes(format);

/**
 * PNG bytes in another format. WebP is lossless: the same pixels,
 * transparency included, in a smaller file.
 */
export async function convertPng(
  png: ArrayBuffer | Uint8Array,
  format: ConvertedFormat,
): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const image = sharp(new Uint8Array(png));
  switch (format) {
    case "webp":
      return new Uint8Array(
        await image.webp({ lossless: true, effort: 4 }).toBuffer(),
      );
    default:
      throw new TypeError(`Unknown image format: ${format satisfies never}`);
  }
}
