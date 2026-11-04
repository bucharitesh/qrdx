import { z } from "zod";
import {
  createCodeSchema,
  hasAnyField,
  MAX_BULK_CREATE,
  updateCodeFields,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { FILE_ID } from "@/lib/qr-api/style";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import { SCAN_RANGE_KEYS } from "@/lib/scans";
import { themeStylePropsSchema } from "@/types/theme";

// Request schemas of /v1/codes. They live here, not in the route files, so
// the OpenAPI generator (lib/openapi) documents exactly what the routes
// validate; Next route files may only export handlers.

/** GET /v1/codes query */
export const listCodesQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/**
 * POST /v1/codes with an array: up to 100 codes in one request (arrays of
 * more than one need Pro). Arrays and single objects are parsed separately:
 * a union would collapse a bad destination into a bare "Invalid input" and
 * hide the reason from callers.
 */
export const createCodesBatchSchema = z
  .array(createCodeSchema)
  .min(1)
  .max(MAX_BULK_CREATE);

/** PATCH /v1/codes/{id} body: the editable fields, plus `archived`. */
export const patchCodeSchema = updateCodeFields
  .extend({ archived: z.boolean().optional() })
  .refine(hasAnyField, { message: "Nothing to update" });

/** GET /v1/codes/{id}/scans query */
export const scansQuerySchema = z.object({
  range: z.enum(SCAN_RANGE_KEYS as [string, ...string[]]).optional(),
  // Individual scans, newest first; 0 = aggregates only.
  limit: z.coerce.number().int().min(0).max(500).default(0),
  before: z.iso.datetime().optional(),
});

/**
 * A code's `style` as the API takes it: the saved-theme JSON (the `Style`
 * component) plus the API-only logo fields, which ./style.ts resolves before
 * the body is validated with createCodeSchema. For the OpenAPI document.
 */
export const codeStyleInputSchema = z.intersection(
  themeStylePropsSchema,
  z
    .object({
      logoFileId: z
        .string()
        .regex(FILE_ID)
        .optional()
        .describe(
          "A logo uploaded to the workspace (PNG or JPEG image), by file id. Saved as the file's link in `customLogo`, with `showLogo: true`.",
        ),
      logoIcon: z
        .enum(LOGO_ICON_IDS)
        .optional()
        .describe(
          "One of the editor's quick logo icons, saved in `customLogo` as the editor saves it",
        ),
    })
    .describe(
      "API-only logo fields. `customLogo` must be an image data URL (as the editor saves logos) or a link to one of the workspace's files: logos from other sites are refused.",
    ),
);

/** POST /v1/codes body, as documented (the route resolves the logo fields). */
export const createCodeInputSchema = createCodeSchema.extend({
  style: codeStyleInputSchema.nullish(),
});

/** PATCH /v1/codes/{id} body, as documented. */
export const patchCodeInputSchema = updateCodeFields
  .extend({
    archived: z.boolean().optional(),
    style: codeStyleInputSchema.optional(),
  })
  .refine(hasAnyField, { message: "Nothing to update" });
