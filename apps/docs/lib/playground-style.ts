// A design as a link: the `style` parameter of /playground. The value is
// "1." followed by base64url-encoded JSON with short keys for an allowlist
// of style fields, at most MAX_STYLE_PARAM_LENGTH characters (about 4 KB).
//
// Never in it: the logo (customLogo, an uploaded image or a remote address),
// Logo QR / Image QR art (an image) and any content. Colors are limited to
// hex, rgb()/hsl() and color names, so a value can't point the renderer at a
// remote resource. Decoding validates every field and rejects the whole
// value when anything is off.

import { getTemplateIds } from "qrdx";
import {
  anyFrameSchema,
  bodyPatternSchema,
  type ColorConfig,
  colorConfigSchema,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  EYE_POSITIONS,
  type EyePosition,
  errorLevelSchema,
  LOGO_PADDING_MAX,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
} from "qrdx/types";
import { z } from "zod";
import {
  MAX_STYLE_PARAM_LENGTH,
  parsePresetId,
  parseStyleValue,
  STYLE_PARAM_VERSION,
} from "@/lib/playground-links";
import type { ThemeStyles } from "@/types/theme";

/** Short key for each style field a link may carry. */
const KEYS = {
  bgColor: "b",
  fgColor: "f",
  eyeColor: "e",
  dotColor: "d",
  bodyPattern: "p",
  cornerEyePattern: "c",
  cornerEyeDotPattern: "o",
  level: "l",
  margin: "m",
  templateId: "t",
  frame: "r",
  showLogo: "g",
  // Engine options the editor exposes (see ENGINE_OPTION_FIELDS below)
  eyeColors: "ec",
  moduleScale: "ms",
  autoLevel: "al",
  logoOptions: "lo",
} as const satisfies Partial<Record<keyof ThemeStyles, string>>;
type LinkedField = keyof typeof KEYS;

/** Key of the preset the design started from (a label and Reset base only). */
const PRESET_KEY = "k";

/** Largest quiet zone the editor offers, in modules. */
const MARGIN_MAX = 16;

/** Parts of a design a link leaves out. */
export type OmittedPart = "logo" | "art" | "frame";

const SAFE_COLOR =
  /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([\d\s.,%/+-]{1,64}\)|[a-z]{3,24})$/i;

const isSafeColor = (value: unknown): value is string =>
  typeof value === "string" && SAFE_COLOR.test(value);

function isSafeColorConfig(value: unknown): value is ColorConfig {
  const parsed = colorConfigSchema.safeParse(value);
  if (!parsed.success) return false;
  const color = parsed.data;
  if (typeof color === "string") return isSafeColor(color);
  if (color.type === "solid") return isSafeColor(color.color);
  return (
    color.stops.length <= 16 &&
    color.stops.every((stop) => isSafeColor(stop.color))
  );
}

const safeColorConfig = z.custom<ColorConfig>(isSafeColorConfig);
const safeOptionalColor = z.string().refine(isSafeColor).optional();

const templateIds = new Set(getTemplateIds());

// ── Engine options: per-eye colors, module size, auto error correction and
// the logo's size, clear space and position. Each is validated as strictly
// as the engine accepts it, or more: colors through the same safe-color
// check, numbers inside the engine's ranges, no extra keys anywhere.
const eyeOverrideSchema = z
  .object({
    outer: safeColorConfig.optional(),
    inner: safeColorConfig.optional(),
  })
  .strict();
const ENGINE_OPTION_FIELDS = {
  eyeColors: z
    .object(
      Object.fromEntries(
        EYE_POSITIONS.map((position) => [
          position,
          eyeOverrideSchema.optional(),
        ]),
      ) as Record<EyePosition, z.ZodOptional<typeof eyeOverrideSchema>>,
    )
    .strict()
    .optional(),
  moduleScale: z
    .number()
    .min(MODULE_SCALE_MIN)
    .max(MODULE_SCALE_MAX)
    .optional(),
  autoLevel: z.literal(true).optional(),
  logoOptions: z
    .object({
      size: z.number().min(LOGO_SIZE_MIN).max(LOGO_SIZE_MAX).optional(),
      padding: z.number().min(0).max(LOGO_PADDING_MAX).optional(),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
    })
    .strict()
    .optional(),
};

/** The style a link carries, as strict as the editor's own schema or more. */
const linkedStyleSchema = z
  .object({
    bgColor: safeColorConfig.optional(),
    fgColor: safeColorConfig.optional(),
    eyeColor: safeColorConfig.optional(),
    dotColor: safeColorConfig.optional(),
    bodyPattern: bodyPatternSchema.optional(),
    cornerEyePattern: cornerEyePatternSchema.optional(),
    cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
    level: errorLevelSchema.optional(),
    margin: z.number().min(0).max(MARGIN_MAX).optional(),
    templateId: z
      .string()
      .refine((id) => templateIds.has(id))
      .optional(),
    frame: anyFrameSchema
      .refine((frame) =>
        [frame.color, frame.textColor, frame.secondaryColor].every(
          (color) => safeOptionalColor.safeParse(color).success,
        ),
      )
      .optional(),
    showLogo: z.literal(true).optional(),
    ...ENGINE_OPTION_FIELDS,
  })
  .strict();

type LinkedStyle = z.infer<typeof linkedStyleSchema>;

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const base64 =
      value.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice((value.length + 3) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function pack(style: LinkedStyle, preset?: string): string {
  const compact: Record<string, unknown> = {};
  for (const field of Object.keys(KEYS) as LinkedField[]) {
    if (style[field] !== undefined) compact[KEYS[field]] = style[field];
  }
  if (preset) compact[PRESET_KEY] = preset;
  return `${STYLE_PARAM_VERSION}.${toBase64Url(JSON.stringify(compact))}`;
}

export interface EncodedStyle {
  /** The `style` value */
  value: string;
  /** What the link leaves out of this design */
  omitted: OmittedPart[];
}

/**
 * The `style` value for a design, without its logo, art or content. A
 * custom frame too large for a link is left out. `preset`: the built-in
 * preset the design started from, kept as its label and Reset base.
 * Null when nothing valid is left to share.
 */
export function encodeStyleParam(
  styles: ThemeStyles,
  options: { preset?: string } = {},
): EncodedStyle | null {
  const omitted: OmittedPart[] = [];
  const style: LinkedStyle = {};

  for (const field of Object.keys(KEYS) as LinkedField[]) {
    if (field === "showLogo") continue;
    const value = styles[field];
    if (value === undefined) continue;
    const parsed = linkedStyleSchema.shape[field].safeParse(value);
    if (parsed.success) {
      (style as Record<string, unknown>)[field] = parsed.data;
    } else if (field === "frame") {
      omitted.push("frame");
    }
  }

  // The QRdx mark travels; an uploaded logo never does.
  if (styles.showLogo) {
    if (styles.customLogo) omitted.push("logo");
    else style.showLogo = true;
  }
  if (styles.art) omitted.push("art");

  const preset = parsePresetId(options.preset) ?? undefined;
  let value = pack(style, preset);
  if (value.length > MAX_STYLE_PARAM_LENGTH && style.frame) {
    delete style.frame;
    if (!omitted.includes("frame")) omitted.push("frame");
    value = pack(style, preset);
  }
  if (value.length > MAX_STYLE_PARAM_LENGTH) return null;
  if (Object.keys(style).length === 0) return null;
  return { value, omitted };
}

export interface DecodedStyle {
  styles: ThemeStyles;
  /** The preset the design started from, if the link names one */
  preset?: string;
}

/** The design in a `style` value, or null when anything about it is invalid. */
export function decodeStyleParam(
  raw: string | null | undefined,
): DecodedStyle | null {
  const value = parseStyleValue(raw);
  if (!value) return null;
  const json = fromBase64Url(value.slice(STYLE_PARAM_VERSION.length + 1));
  if (json === null) return null;

  let compact: unknown;
  try {
    compact = JSON.parse(json);
  } catch {
    return null;
  }
  if (!compact || typeof compact !== "object" || Array.isArray(compact)) {
    return null;
  }

  const source = compact as Record<string, unknown>;
  const expanded: Record<string, unknown> = {};
  for (const field of Object.keys(KEYS) as LinkedField[]) {
    if (source[KEYS[field]] !== undefined)
      expanded[field] = source[KEYS[field]];
  }
  const parsed = linkedStyleSchema.safeParse(expanded);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return null;

  const presetRaw = source[PRESET_KEY];
  const preset =
    presetRaw === undefined
      ? undefined
      : (parsePresetId(typeof presetRaw === "string" ? presetRaw : null) ??
        null);
  if (preset === null) return null;

  return {
    styles: parsed.data as ThemeStyles,
    ...(preset ? { preset } : {}),
  };
}
