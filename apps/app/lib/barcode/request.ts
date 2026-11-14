// A barcode image request, as GET /v1/barcode's query, POST /v1/barcode's
// JSON body and MCP's generate_barcode take it: the format, the value, the
// file type and the style in short names (fg, bg, height, text, rotate).
// Here rather than in the route so the OpenAPI document (lib/openapi)
// describes exactly what's validated. Pure.
import { z } from "zod";
import { BARCODE_FILE_TYPES, type BarcodeFileType } from "./files";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  getBarcodeFormat,
  validateBarcodeInput,
} from "./formats";
import {
  BARCODE_LIMITS,
  BARCODE_ROTATIONS,
  type BarcodeRotation,
  type BarcodeStyle,
  barcodeStyleInputSchema,
  resolveBarcodeStyle,
} from "./style";

export const BARCODE_FORMAT_IDS = BARCODE_FORMATS.map(
  (format) => format.id,
) as [BarcodeFormatId, ...BarcodeFormatId[]];

/** The longest value any format takes (2D codes: 1,000 characters). */
export const BARCODE_DATA_MAX = Math.max(
  ...BARCODE_FORMATS.map((format) => format.maxLength),
);

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Spellings people write: "EAN-13", "code-128", "UPC-A", "azteccode". */
const FORMAT_ALIASES = new Map<string, BarcodeFormatId>([
  ...BARCODE_FORMATS.map((format) => [squash(format.id), format.id] as const),
  ...BARCODE_FORMATS.map(
    (format) => [squash(format.label), format.id] as const,
  ),
  ["azteccode", "aztec"],
  ["gs1128", "gs1-128"],
  ["ucc128", "gs1-128"],
  ["ean128", "gs1-128"],
  ["itf", "itf14"],
  ["pdf", "pdf417"],
]);

/** A format id from how a URL or a person writes it; null when unknown. */
export function parseBarcodeFormat(value: string): BarcodeFormatId | null {
  return FORMAT_ALIASES.get(squash(value)) ?? null;
}

const formatField = z
  .enum(BARCODE_FORMAT_IDS)
  .describe(
    `The symbology: ${BARCODE_FORMATS.map((format) => `\`${format.id}\` (${format.label})`).join(", ")}`,
  );

const dataField = z
  .string()
  .min(1, "Required: the number or text to encode")
  .max(BARCODE_DATA_MAX, `Must be at most ${BARCODE_DATA_MAX} characters`)
  .describe(
    "The number or text to encode. Retail numbers (EAN, UPC, ITF-14, GS1 GTINs and SSCCs) can leave the check digit off and it's added; a wrong one is an error.",
  );

const typeField = z
  .enum(BARCODE_FILE_TYPES)
  .default("svg")
  .describe(
    "File type: svg (default), png, jpg, webp, avif, pdf or eps. Raster images are `scale` pixels per module; SVG, PDF and EPS are vectors at one point per module (0.353 mm).",
  );

const hexText = (what: string) =>
  z
    .string()
    .max(7)
    .optional()
    .describe(
      `${what} as hex, such as 000000 (in URLs leave out the # or encode it as %23)`,
    );

/** GET /v1/barcode query (the route lower-cases `format` and `type` first). */
export const barcodeImageQuerySchema = z.object({
  format: formatField,
  data: dataField,
  type: typeField,
  fg: hexText("Bar and text color (default 000000)"),
  bg: hexText("Background color (default ffffff)"),
  scale: z.coerce
    .number()
    .int()
    .min(BARCODE_LIMITS.scale.min)
    .max(BARCODE_LIMITS.scale.max)
    .optional()
    .describe("Pixels per module in raster images (1-10, default 4)"),
  height: z.coerce
    .number()
    .min(BARCODE_LIMITS.barHeightMm.min)
    .max(BARCODE_LIMITS.barHeightMm.max)
    .optional()
    .describe(
      "Bar height of linear barcodes in millimetres at the vector size (5-60; default depends on the format, 23 for EAN-13)",
    ),
  quietZone: z.coerce
    .number()
    .int()
    .min(BARCODE_LIMITS.quietZone.min)
    .max(BARCODE_LIMITS.quietZone.maxLinear)
    .optional()
    .describe(
      "Blank margin in modules: left and right of linear barcodes (0-20), all round 2D codes (0-10). Defaults to the format's minimum (11 for EAN-13, 10 for Code 128).",
    ),
  text: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .describe("Print the digits or text under linear barcodes (default true)"),
  rotate: z
    .enum(BARCODE_ROTATIONS.map(String) as [string, ...string[]])
    .optional()
    .describe("Clockwise rotation in degrees: 0 (default), 90, 180 or 270"),
});

/** POST /v1/barcode body and MCP generate_barcode input: the same fields, as JSON. */
export const barcodeImageBodySchema = z.object({
  format: formatField,
  data: dataField,
  type: typeField,
  fg: hexText("Bar and text color (default 000000)"),
  bg: hexText("Background color (default ffffff)"),
  scale: barcodeStyleInputSchema.shape.scale,
  height: z
    .number()
    .min(BARCODE_LIMITS.barHeightMm.min)
    .max(BARCODE_LIMITS.barHeightMm.max)
    .optional()
    .describe(
      "Bar height of linear barcodes in millimetres at the vector size (5-60; default depends on the format)",
    ),
  quietZone: barcodeStyleInputSchema.shape.quietZone,
  text: z
    .boolean()
    .optional()
    .describe("Print the digits or text under linear barcodes (default true)"),
  rotate: barcodeStyleInputSchema.shape.rotation,
});

export type BarcodeImageQuery = z.output<typeof barcodeImageQuerySchema>;
export type BarcodeImageBody = z.output<typeof barcodeImageBodySchema>;

export interface BarcodeIssue {
  param: string;
  message: string;
}

export interface ResolvedBarcodeRequest {
  format: BarcodeFormatId;
  /** The value drawn: check digit added, UPC-A shortened to UPC-E, ... */
  value: string;
  /** What was added or changed ("Check digit 7 added.") */
  note?: string;
  style: BarcodeStyle;
  type: BarcodeFileType;
}

export type ResolvedRequest =
  | { ok: true; request: ResolvedBarcodeRequest }
  | { ok: false; issues: BarcodeIssue[] };

/** Field names of the short style parameters, for error messages. */
const PARAM_FOR: Record<keyof BarcodeStyle, string> = {
  foreground: "fg",
  background: "bg",
  showText: "text",
  barHeightMm: "height",
  quietZone: "quietZone",
  scale: "scale",
  rotation: "rotate",
};

/**
 * Checks a parsed query or body against the format's rules: the value's
 * characters, length and check digit, the colors and the quiet zone.
 */
export function resolveBarcodeRequest(
  input: BarcodeImageQuery | BarcodeImageBody,
): ResolvedRequest {
  const issues: BarcodeIssue[] = [];
  const style = barcodeStyleInputSchema.safeParse({
    foreground: input.fg,
    background: input.bg,
    scale: input.scale,
    barHeightMm: input.height,
    quietZone: input.quietZone,
    showText:
      typeof input.text === "string"
        ? input.text === "true" || input.text === "1"
        : input.text,
    rotation:
      input.rotate === undefined
        ? undefined
        : (Number(input.rotate) as BarcodeRotation),
  });
  if (!style.success) {
    for (const issue of style.error.issues) {
      const field = issue.path[0] as keyof BarcodeStyle;
      issues.push({
        param: PARAM_FOR[field] ?? String(field),
        message: issue.message,
      });
    }
  }
  const checked = validateBarcodeInput(input.format, input.data);
  if (!checked.ok) {
    issues.push({
      param: "data",
      message: `${getBarcodeFormat(input.format).label}: ${checked.error}`,
    });
  }
  if (!style.success || !checked.ok) return { ok: false, issues };

  const resolved = resolveBarcodeStyle(input.format, style.data);
  if (!resolved.ok) {
    return {
      ok: false,
      issues: [{ param: PARAM_FOR[resolved.field], message: resolved.message }],
    };
  }
  return {
    ok: true,
    request: {
      format: input.format,
      value: checked.value,
      ...(checked.note ? { note: checked.note } : {}),
      style: resolved.style,
      type: input.type,
    },
  };
}
