import { cornerEyeDotPatternSchema, cornerEyePatternSchema } from "qrdx/types";
import { z } from "zod";
import {
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  qrImageFormats,
  qrOptionsSchema,
} from "@/lib/qr-render";

// Query schema of GET /v1/qr, here rather than in the route file so the
// OpenAPI generator (lib/openapi) documents exactly what it validates.

/** GET /v1/qr query (the route also lower/upper-cases a few enums first). */
export const qrImageQuerySchema = qrOptionsSchema.extend({
  // Retired shapes are no longer listed, but existing image URLs that use
  // them keep rendering exactly as before.
  eye: cornerEyePatternSchema.default(QR_DEFAULTS.eye),
  dot: cornerEyeDotPatternSchema.default(QR_DEFAULTS.dot),
  format: z.enum(qrImageFormats).default("svg"),
  size: z.coerce
    .number()
    .int()
    .min(QR_SIZE_MIN)
    .max(QR_SIZE_MAX)
    .default(QR_DEFAULTS.size),
  margin: z.coerce
    .number()
    .int()
    .min(0)
    .max(QR_MARGIN_MAX)
    .default(QR_DEFAULTS.margin),
});
