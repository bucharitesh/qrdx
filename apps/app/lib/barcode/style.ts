// How a barcode is drawn: colors, bar height, quiet zone, scale, the text
// under the bars and rotation. Shared by the generator, the dashboard, the
// image API and saved barcodes (their `options` column), so every place
// fills the same defaults and keeps to the same ranges. Pure and
// client-safe.
import { z } from "zod";
import { type BarcodeFormatId, getBarcodeFormat } from "./formats";

/** Clockwise rotation in degrees. */
export const BARCODE_ROTATIONS = [0, 90, 180, 270] as const;
export type BarcodeRotation = (typeof BARCODE_ROTATIONS)[number];

export interface BarcodeStyle {
  /** Bars and text, as #rrggbb */
  foreground: string;
  /** Background, as #rrggbb */
  background: string;
  /** Print the human-readable digits or text under linear codes */
  showText: boolean;
  /** Bar height of linear codes, in millimetres */
  barHeightMm: number;
  /** Blank margin in modules: left and right of linear codes, all round 2D ones */
  quietZone: number;
  /** Pixels per drawing unit in the preview and the raster downloads */
  scale: number;
  /** Clockwise rotation, in degrees (0 when left out) */
  rotation?: BarcodeRotation;
}

export const BARCODE_LIMITS = {
  scale: { min: 1, max: 10, default: 4 },
  barHeightMm: { min: 5, max: 60 },
  quietZone: { min: 0, maxLinear: 20, max2d: 10 },
} as const;

const HEX6 = /^#[0-9a-f]{6}$/;

/**
 * A color as the renderer takes it (#rrggbb, lowercase) from #rgb, #rrggbb
 * or either without the #; null when it isn't one.
 */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${[...raw].map((digit) => digit + digit).join("")}`;
  }
  return HEX6.test(`#${raw}`) ? `#${raw}` : null;
}

/** The style a new barcode of `id` starts with. */
export function defaultBarcodeStyle(id: BarcodeFormatId): BarcodeStyle {
  const format = getBarcodeFormat(id);
  return {
    foreground: "#000000",
    background: "#ffffff",
    showText: true,
    barHeightMm: format.barHeightMm ?? 15,
    quietZone: format.quietZone.default,
    scale: BARCODE_LIMITS.scale.default,
    rotation: 0,
  };
}

/** The largest quiet zone `id` takes, in modules. */
export const maxQuietZone = (id: BarcodeFormatId) =>
  getBarcodeFormat(id).kind === "linear"
    ? BARCODE_LIMITS.quietZone.maxLinear
    : BARCODE_LIMITS.quietZone.max2d;

const hexField = (what: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const hex = normalizeHex(value);
      if (!hex) {
        ctx.addIssue({
          code: "custom",
          message: `The ${what} must be a hex color such as 000000 or #1f2937`,
        });
        return z.NEVER;
      }
      return hex;
    });

/**
 * Style fields as the API and saved barcodes take them: every field
 * optional, so a partial style fills the rest from the format's defaults
 * (resolveBarcodeStyle). Ranges that depend on the format (the quiet zone)
 * are checked there.
 */
export const barcodeStyleInputSchema = z.object({
  foreground: hexField("bar color")
    .optional()
    .describe("Bars and text, as hex (default 000000)"),
  background: hexField("background")
    .optional()
    .describe("Background, as hex (default ffffff)"),
  showText: z
    .boolean()
    .optional()
    .describe(
      "Print the digits or text under linear barcodes (default true; 2D codes have none)",
    ),
  barHeightMm: z
    .number()
    .min(BARCODE_LIMITS.barHeightMm.min)
    .max(BARCODE_LIMITS.barHeightMm.max)
    .optional()
    .describe(
      "Bar height of linear barcodes in millimetres at the vector size (default depends on the format)",
    ),
  quietZone: z
    .number()
    .int()
    .min(BARCODE_LIMITS.quietZone.min)
    .max(BARCODE_LIMITS.quietZone.maxLinear)
    .optional()
    .describe(
      "Blank margin in modules: left and right of linear barcodes (up to 20), all round 2D codes (up to 10). Defaults to the format's minimum.",
    ),
  scale: z
    .number()
    .int()
    .min(BARCODE_LIMITS.scale.min)
    .max(BARCODE_LIMITS.scale.max)
    .optional()
    .describe("Pixels per module in raster images (1-10, default 4)"),
  rotation: z
    .union(BARCODE_ROTATIONS.map((angle) => z.literal(angle)))
    .optional()
    .describe("Clockwise rotation in degrees: 0, 90, 180 or 270 (default 0)"),
});

export type BarcodeStyleInput = z.input<typeof barcodeStyleInputSchema>;

export type ResolvedStyle =
  | { ok: true; style: BarcodeStyle }
  | { ok: false; field: keyof BarcodeStyle; message: string };

/**
 * A full style for `id`: the fields given (already parsed by
 * barcodeStyleInputSchema), the format's defaults for the rest. Fails on a
 * quiet zone above what the format takes.
 */
export function resolveBarcodeStyle(
  id: BarcodeFormatId,
  input: Partial<BarcodeStyle> | null | undefined,
): ResolvedStyle {
  const style = { ...defaultBarcodeStyle(id) };
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value !== undefined && key in style) {
      (style as Record<string, unknown>)[key] = value;
    }
  }
  const max = maxQuietZone(id);
  if (style.quietZone > max) {
    return {
      ok: false,
      field: "quietZone",
      message: `${getBarcodeFormat(id).label} takes a quiet zone of up to ${max} modules`,
    };
  }
  return { ok: true, style };
}

/**
 * A stored style (a saved barcode's `options`), read leniently: anything
 * missing or out of range falls back to the format's default, so an old or
 * hand-edited row still draws.
 */
export function storedBarcodeStyle(
  id: BarcodeFormatId,
  stored: unknown,
): BarcodeStyle {
  const base = defaultBarcodeStyle(id);
  if (!stored || typeof stored !== "object") return base;
  const style: Partial<BarcodeStyle> = {};
  for (const [key, schema] of Object.entries(barcodeStyleInputSchema.shape) as [
    keyof BarcodeStyle,
    z.ZodType,
  ][]) {
    const parsed = schema.safeParse((stored as Record<string, unknown>)[key]);
    if (parsed.success && parsed.data !== undefined) {
      (style as Record<string, unknown>)[key] = parsed.data;
    }
  }
  const resolved = resolveBarcodeStyle(id, style);
  return resolved.ok ? resolved.style : base;
}

/** The fields that differ from the format's defaults, for compact storage and URLs. */
export function styleChanges(
  id: BarcodeFormatId,
  style: BarcodeStyle,
): Partial<BarcodeStyle> {
  const base = defaultBarcodeStyle(id);
  const linear = getBarcodeFormat(id).kind === "linear";
  const changes: Partial<BarcodeStyle> = {};
  for (const key of Object.keys(base) as (keyof BarcodeStyle)[]) {
    // Bar height and text don't apply to 2D codes.
    if (!linear && (key === "barHeightMm" || key === "showText")) continue;
    const value = style[key] ?? base[key];
    if (value !== base[key]) {
      (changes as Record<string, unknown>)[key] = value;
    }
  }
  return changes;
}
