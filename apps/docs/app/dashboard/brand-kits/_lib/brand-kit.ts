import {
  bodyPatternSchema,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
} from "qrdx/types";
import { z } from "zod";
import { MAX_LOGO_FILE_SIZE } from "@/lib/constants";
import type { QRStyle } from "@/types/theme";

/** Same formats as the editor's logo upload (components/editor/control-sections/logo-controls.tsx). */
export const BRAND_KIT_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export const BRAND_KIT_NAME_MAX = 60;

// Colors end up in SVG attributes: allow hex, named and rgb()/hsl() colors only.
const colorString = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[#a-zA-Z0-9(),.%\s-]+$/, "Invalid color");

const gradientStop = z.object({
  color: colorString,
  offset: z.number().min(0).max(100),
});

export const brandColorSchema = z.union([
  colorString,
  z.object({ type: z.literal("solid"), color: colorString }),
  z.object({
    type: z.literal("linear"),
    stops: z.array(gradientStop).min(2).max(8),
    angle: z.number().min(-360).max(360).default(0),
  }),
  z.object({
    type: z.literal("radial"),
    stops: z.array(gradientStop).min(2).max(8),
  }),
]);

export const brandKitColorsSchema = z.object({
  bgColor: brandColorSchema.optional(),
  fgColor: brandColorSchema.optional(),
  eyeColor: brandColorSchema.optional(),
  dotColor: brandColorSchema.optional(),
});

export const brandKitStyleSchema = z.object({
  bodyPattern: bodyPatternSchema.optional(),
  cornerEyePattern: cornerEyePatternSchema.optional(),
  cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
  templateId: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});

const LOGO_DATA_URL =
  /^data:(image\/png|image\/jpeg|image\/webp|image\/svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decoded byte size of a base64 payload. */
function base64Bytes(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export function isValidLogoDataUrl(value: string): boolean {
  const match = LOGO_DATA_URL.exec(value);
  return Boolean(match && base64Bytes(match[2]) <= MAX_LOGO_FILE_SIZE);
}

const logoSchema = z
  .string()
  // 1MB of base64 plus the data URL prefix
  .max(Math.ceil(MAX_LOGO_FILE_SIZE / 3) * 4 + 64)
  .refine(
    isValidLogoDataUrl,
    "Logo must be a PNG, JPG, WebP or SVG of 1MB or less",
  );

export const brandKitInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(BRAND_KIT_NAME_MAX),
  logo: logoSchema.nullable(),
  colors: brandKitColorsSchema,
  style: brandKitStyleSchema,
  isDefault: z.boolean().default(false),
});

export type BrandKitColors = z.infer<typeof brandKitColorsSchema>;
export type BrandKitStyle = z.infer<typeof brandKitStyleSchema>;
export type BrandKitInput = z.input<typeof brandKitInputSchema>;

export interface BrandKit {
  id: string;
  name: string;
  logo: string | null;
  colors: BrandKitColors;
  style: BrandKitStyle;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** List entry for menus: the (possibly large) logo is fetched only when a kit is applied. */
export type BrandKitSummary = Omit<BrandKit, "logo"> & { hasLogo: boolean };

/** Parses stored JSON defensively: rows written before a schema change keep working. */
export function parseStoredColors(value: unknown): BrandKitColors {
  const parsed = brandKitColorsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export function parseStoredStyle(value: unknown): BrandKitStyle {
  const parsed = brandKitStyleSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Editor style fields a kit sets. Fields the kit leaves empty are not touched. */
export function brandKitToStyles(
  kit: Pick<BrandKit, "colors" | "style" | "logo">,
): Partial<QRStyle> {
  const styles: Partial<QRStyle> = {};
  for (const [key, value] of Object.entries(kit.colors)) {
    if (value !== undefined) {
      styles[key as keyof BrandKitColors] = value;
    }
  }
  for (const [key, value] of Object.entries(kit.style)) {
    if (value !== undefined) {
      (styles as Record<string, unknown>)[key] = value;
    }
  }
  if (kit.logo) {
    styles.customLogo = kit.logo;
    styles.showLogo = true;
  }
  return styles;
}
