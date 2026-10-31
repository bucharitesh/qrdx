import { z } from "zod";

/**
 * Art modes blend a picture into the code itself (vector output, no AI):
 * - "logo": modules inside the logo's shape take the logo's colors, the rest
 *   fade to a lighter tone; finder, timing and alignment patterns stay solid.
 * - "halftone": every module shows the photo around a center square that
 *   keeps the module's true dark/light value.
 */
export const QR_ART_MODES = ["logo", "halftone"] as const;

export const qrArtModeSchema = z.enum(QR_ART_MODES);
export type QRArtMode = z.infer<typeof qrArtModeSchema>;

/** Largest side of an art sample grid, in pixels. */
export const QR_ART_MAX_SAMPLE_SIZE = 192;

const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * A small RGBA bitmap sampled from the source image (see `createQRArtImage`
 * and `loadQRArtImage`). Storing pixels instead of an image URL keeps
 * rendering synchronous and identical in the browser, on the server and in
 * the CLI, and never fetches anything.
 */
export const qrArtImageSchema = z
  .object({
    width: z.number().int().min(1).max(QR_ART_MAX_SAMPLE_SIZE),
    height: z.number().int().min(1).max(QR_ART_MAX_SAMPLE_SIZE),
    /** Base64 of the RGBA bytes, row by row (width × height × 4 bytes) */
    data: z
      .string()
      .max(base64Length(QR_ART_MAX_SAMPLE_SIZE * QR_ART_MAX_SAMPLE_SIZE * 4)),
  })
  .refine(
    (image) =>
      image.data.length === base64Length(image.width * image.height * 4),
    { message: "Art image data does not match its width and height" }
  );
export type QRArtImage = z.infer<typeof qrArtImageSchema>;

export const qrArtSchema = z.object({
  mode: qrArtModeSchema,
  image: qrArtImageSchema,
  /** 0 = plain code, 1 = strongest effect (default 0.6) */
  intensity: z.number().min(0).max(1).optional(),
});
export type QRArt = z.infer<typeof qrArtSchema>;
