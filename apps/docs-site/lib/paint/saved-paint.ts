// What a saved design may paint with. The engine (and the npm library) take
// any image `src`; a design QRdx stores and shows to others (codes, themes,
// templates, the REST API) may only hold the picture itself, as a data:image
// URL, the same rule logos follow: a picture from a link would load in every
// viewer's browser (a tracking pixel, an IP leak to workspace members).
// themeStylePropsSchema (types/theme.ts) uses these for all six paint slots.
import {
  angularGradientSchema,
  type ColorConfig,
  imagePaintSchema,
  linearGradientSchema,
  radialGradientSchema,
  solidColorSchema,
} from "qrdx/types";
import { z } from "zod";

/** A base64 data:image URL in a format every export embeds or redraws. */
export const IMAGE_FILL_SRC_PATTERN =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Longest picture a saved image fill may hold, in characters of data URL:
 * the same 1.5 MB a saved code's whole style may take (qr-codes.ts). The
 * picker keeps pictures at 1024 px, far below it.
 */
export const IMAGE_FILL_MAX_LENGTH = 1_500_000;

export const IMAGE_FILL_SRC_MESSAGE =
  "Image fills must be a data:image URL (PNG, JPEG, WebP or GIF); pictures from links aren't accepted.";

export const IMAGE_FILL_TOO_LARGE_MESSAGE =
  "This image fill is too large to save (1.5 MB at most); use a smaller picture.";

/** Why a saved image fill's `src` is refused, or null when it is fine. */
export function imageFillSrcProblem(src: string): string | null {
  if (src.length > IMAGE_FILL_MAX_LENGTH) return IMAGE_FILL_TOO_LARGE_MESSAGE;
  return IMAGE_FILL_SRC_PATTERN.test(src) ? null : IMAGE_FILL_SRC_MESSAGE;
}

// The image option documents the rule (OpenAPI reads `pattern` and
// `maxLength`); the refine below enforces it with a message that names it.
const savedImagePaintSchema = imagePaintSchema.extend({
  src: z.string().min(1).meta({
    description:
      "The picture as a base64 data:image URL (PNG, JPEG, WebP or GIF), at most 1.5 MB. Pictures from links aren't accepted.",
    pattern: "^data:image/(png|jpeg|webp|gif);base64,",
    maxLength: IMAGE_FILL_MAX_LENGTH,
  }),
});

/**
 * A color, a gradient or an image fill, as a saved design may hold it: an
 * image fill's `src` must be a data:image URL under the size cap.
 */
export const savedColorConfigSchema = z
  .union([
    z.string(),
    solidColorSchema,
    linearGradientSchema,
    radialGradientSchema,
    angularGradientSchema,
    savedImagePaintSchema,
  ])
  .superRefine((paint, ctx) => {
    if (typeof paint !== "object" || paint.type !== "image") return;
    const problem = imageFillSrcProblem(paint.src);
    if (problem)
      ctx.addIssue({ code: "custom", message: problem, path: ["src"] });
  }) as z.ZodType<ColorConfig>;

const savedEyeColorOverrideSchema = z.object({
  outer: savedColorConfigSchema.optional(),
  inner: savedColorConfigSchema.optional(),
});

/** Per-eye colors (as the engine's eyeColorsSchema) with saved paints. */
export const savedEyeColorsSchema = z.object({
  topLeft: savedEyeColorOverrideSchema.optional(),
  topRight: savedEyeColorOverrideSchema.optional(),
  bottomLeft: savedEyeColorOverrideSchema.optional(),
});
