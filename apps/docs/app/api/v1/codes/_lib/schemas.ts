import { z } from "zod";
import {
  createCodeSchema,
  hasAnyField,
  MAX_BULK_CREATE,
  updateCodeFields,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { SCAN_RANGE_KEYS } from "@/lib/scans";

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
