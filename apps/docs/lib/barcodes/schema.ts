// Saved barcodes' inputs, shared by the dashboard actions, the REST API
// (/v1/barcodes) and MCP's save_barcode. Pure and client-safe.
import { z } from "zod";
import { BARCODE_DATA_MAX, BARCODE_FORMAT_IDS } from "@/lib/barcode/request";
import { barcodeStyleInputSchema } from "@/lib/barcode/style";

export const MAX_BARCODE_TITLE = 100;
export const BARCODE_PAGE_SIZE = 25;
export const MAX_BARCODE_LIST = 100;
export const MAX_BARCODE_BULK = 200;

export const barcodeIdSchema = z.string().trim().min(1).max(64);

export const barcodeTitleSchema = z
  .string()
  .trim()
  .max(MAX_BARCODE_TITLE, `Titles can be up to ${MAX_BARCODE_TITLE} characters`)
  .nullish()
  .transform((value) => value || null)
  .describe(
    `A name to find it by, up to ${MAX_BARCODE_TITLE} characters (default: none; lists show the value)`,
  );

const formatField = z
  .enum(BARCODE_FORMAT_IDS)
  .describe(
    "The symbology, as GET /barcode takes it: ean13, ean8, upca, upce, code128, code39, itf14, gs1-128, datamatrix, pdf417 or aztec",
  );

const valueField = z
  .string()
  .min(1, "Required: the number or text to encode")
  .max(BARCODE_DATA_MAX)
  .describe(
    "The number or text to encode, checked against the format's rules. Retail numbers can leave the check digit off and it's added.",
  );

const folderField = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .nullish()
  .describe(
    "A folder of the workspace by id (the codes' folders); null for none",
  );

/** The fields of a new saved barcode. */
export const createBarcodeSchema = z.object({
  title: barcodeTitleSchema,
  format: formatField,
  value: valueField,
  options: barcodeStyleInputSchema
    .optional()
    .describe(
      "How it's drawn; anything left out uses the format's defaults (black on white, the minimum quiet zone, scale 4)",
    ),
  folderId: folderField,
});

/** A change to a saved barcode: any of its fields; options replace the old ones. */
export const updateBarcodeSchema = z
  .object({
    title: barcodeTitleSchema.optional(),
    format: formatField.optional(),
    value: valueField.optional(),
    options: barcodeStyleInputSchema
      .optional()
      .describe(
        "How it's drawn: replaces the saved options (fields left out go back to the format's defaults)",
      ),
    folderId: folderField,
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "Send at least one field to change",
  });

export type CreateBarcodeInput = z.output<typeof createBarcodeSchema>;
export type UpdateBarcodeInput = z.output<typeof updateBarcodeSchema>;

export const BARCODE_STATUSES = ["active", "trash"] as const;
export type BarcodeStatus = (typeof BARCODE_STATUSES)[number];

/** GET /v1/barcodes query. */
export const listBarcodesQuerySchema = z.object({
  status: z
    .enum(BARCODE_STATUSES)
    .default("active")
    .describe("Which barcodes: `active` (default) or `trash`"),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Search: titles and values contain it"),
  format: z.enum(BARCODE_FORMAT_IDS).optional().describe("Only this symbology"),
  folderId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe("Only this folder's barcodes; `none` for those in no folder"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_BARCODE_LIST)
    .default(50)
    .describe(`Barcodes per page (1-${MAX_BARCODE_LIST})`),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Barcodes to skip, for the next page"),
});

export type ListBarcodesQuery = z.output<typeof listBarcodesQuerySchema>;
