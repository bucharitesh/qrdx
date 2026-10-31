import { z } from "zod";

/**
 * Art modes blend a picture into the code itself (vector output, no AI):
 * - "logo" (Logo QR): the logo, traced into crisp vector shapes, either fills
 *   the code under a fine dot screen ("blend") or sits on a rounded plate in
 *   the middle of a code tinted with its colors ("badge").
 * - "halftone" (Image QR): the photo shows through every module around a
 *   small center dot that keeps the module's dark/light value, in full color
 *   ("color") or as an error-diffused black-and-white halftone ("mono").
 * Finder, alignment and format patterns always stay crisp.
 */
export const QR_ART_MODES = ["logo", "halftone"] as const;

export const qrArtModeSchema = z.enum(QR_ART_MODES);
export type QRArtMode = z.infer<typeof qrArtModeSchema>;

/** Looks within each mode; the first one is the mode's default. */
export const QR_ART_VARIANTS = {
  logo: ["blend", "badge"],
  halftone: ["color", "mono"],
} as const satisfies Record<QRArtMode, readonly string[]>;

export const qrArtVariantSchema = z.enum([
  ...QR_ART_VARIANTS.logo,
  ...QR_ART_VARIANTS.halftone,
]);
export type QRArtVariant = z.infer<typeof qrArtVariantSchema>;

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
  /**
   * Look within the mode (see QR_ART_VARIANTS). Omitted, or a variant of the
   * other mode, means the mode's default: "blend" for logo, "color" for
   * halftone.
   */
  variant: qrArtVariantSchema.optional(),
  /**
   * Logo mode: color the finder eyes from the logo (default true). Per-eye
   * `eyeColors` still win.
   */
  matchEyes: z.boolean().optional(),
});
export type QRArt = z.infer<typeof qrArtSchema>;
