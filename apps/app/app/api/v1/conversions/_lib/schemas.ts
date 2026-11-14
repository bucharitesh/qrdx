import { z } from "zod";

// Request schema of POST /v1/conversions, here rather than in the route file
// so the OpenAPI generator (lib/openapi) documents exactly what it validates.

const MAX_METADATA_KEYS = 20;

const valueSchema = z
  .union([z.number(), z.string().trim()])
  .transform((value, ctx) => {
    const text = typeof value === "number" ? value.toFixed(2) : value;
    if (
      !/^\d{1,12}(?:\.\d{1,2})?$/.test(text) ||
      (typeof value === "number" && !(Number.isFinite(value) && value >= 0))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "value must be a non-negative amount with up to 2 decimals",
      });
      return z.NEVER;
    }
    return text;
  });

/** POST /v1/conversions body */
export const conversionBodySchema = z.object({
  sid: z.string().max(200).optional(),
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[\p{L}\p{N} _.:/-]+$/u,
      "name: letters, numbers, spaces and _ . : / -",
    )
    .default("conversion"),
  value: valueSchema.optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code like USD")
    .optional(),
  id: z.string().trim().min(1).max(128).optional(),
  metadata: z
    .record(
      z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/),
      z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
    )
    .refine((value) => Object.keys(value).length <= MAX_METADATA_KEYS, {
      message: `metadata can have up to ${MAX_METADATA_KEYS} keys`,
    })
    .optional(),
});
