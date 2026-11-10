import type { QrCodeKind } from "@repo/database";
import { z } from "zod";
import { idempotencyKeySchema } from "@/app/dashboard/codes/_lib/bulk";
import {
  createCodeSchema,
  hasAnyField,
  MAX_BULK_CREATE,
  updateCodeFields,
} from "@/app/dashboard/codes/_lib/qr-codes";
import {
  pageForCodeSchema,
  pageIdSchema,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { FILE_ID } from "@/lib/qr-api/style";
import { LOGO_ICON_HELP, logoIconSchema } from "@/lib/qr-design/logo-icon";
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
 * POST /v1/codes with an array: up to MAX_BULK_CREATE codes in one request
 * (arrays of more than one need Pro). Arrays and single objects are parsed
 * separately: a union would collapse a bad destination into a bare "Invalid
 * input" and hide the reason from callers.
 */
export const createCodesBatchSchema = z
  .array(createCodeSchema)
  .min(1, "Send at least one code")
  .max(
    MAX_BULK_CREATE,
    `Send up to ${MAX_BULK_CREATE.toLocaleString("en-US")} codes per request`,
  );

// ─── Large batches (feat/large-batches) ─────────────────────────────────────

/** POST /v1/codes request headers, for the OpenAPI document. */
export const createCodesHeadersSchema = z.object({
  "Idempotency-Key": idempotencyKeySchema.optional(),
  Prefer: z
    .literal("return=minimal")
    .optional()
    .describe(
      "Send `return=minimal` to get each created code without its `style` (id, slug, links, destination, title, status, createdAt): smaller responses for large batches.",
    ),
});

// ─── Changing a code's type (app/dashboard/codes/_lib/code-kind.ts) ─────────

/** PATCH fields that switch a code between a website link and a hosted page. */
export const codeKindFields = {
  kind: z
    .enum(["redirect", "page"] as const satisfies readonly QrCodeKind[])
    .optional()
    .describe(
      "Switch what the code opens, keeping its short link and scans: `redirect` (a website link; send `destinationUrl` with it) or `page` (a hosted page; send `pageId` or `page`)",
    ),
  pageId: pageIdSchema
    .optional()
    .describe(
      'With `kind: "page"`: a hosted page of the workspace the code should open, such as one it opened before',
    ),
  page: pageForCodeSchema
    .optional()
    .describe(
      'With `kind: "page"`: a new hosted page from a template. It counts toward the plan\'s hosted pages',
    ),
};

/** The fields a type change needs, and none it can't use. */
function checkKindChange(
  body: {
    kind?: string;
    destinationUrl?: string;
    pageId?: string;
    page?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (body.kind === undefined) {
    if (body.pageId !== undefined)
      issue("pageId", 'Send `kind: "page"` with `pageId`');
    if (body.page !== undefined)
      issue("page", 'Send `kind: "page"` with `page`');
    return;
  }
  if (body.kind === "redirect") {
    if (body.destinationUrl === undefined) {
      issue("destinationUrl", "Send the website link as `destinationUrl`");
    }
    if (body.pageId !== undefined || body.page !== undefined) {
      issue("kind", "A website link takes `destinationUrl`, not a page");
    }
    return;
  }
  if ((body.pageId === undefined) === (body.page === undefined)) {
    issue(
      "page",
      "Send either `pageId` (an existing page) or `page` (a new one)",
    );
  }
  if (body.destinationUrl !== undefined) {
    issue(
      "destinationUrl",
      "A hosted page code opens its page: leave `destinationUrl` out",
    );
  }
}

/** Ask scanners for precise location (lib/scan-location): Pro and Business to turn on. */
const preciseLocationField = z
  .boolean()
  .optional()
  .describe(
    "Ask scanners for their precise location (Pro and Business). Redirect codes show a short step with Allow and Skip; hosted pages ask on the page. Off by default; turning it off never needs a plan.",
  );

/** PATCH /v1/codes/{id} body: the editable fields, plus `archived`. */
export const patchCodeSchema = updateCodeFields
  .extend({
    archived: z.boolean().optional(),
    ...codeKindFields,
    preciseLocation: preciseLocationField,
  })
  .superRefine(checkKindChange)
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
      logoIcon: logoIconSchema
        .optional()
        .describe(
          `${LOGO_ICON_HELP} Saved in \`customLogo\` as the editor saves it.`,
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
    ...codeKindFields,
    preciseLocation: preciseLocationField,
  })
  .superRefine(checkKindChange)
  .refine(hasAnyField, { message: "Nothing to update" });
