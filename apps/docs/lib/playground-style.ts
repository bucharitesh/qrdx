// A design as a link: the `style` parameter of /playground. The value is
// "1." followed by base64url-encoded JSON with short keys for an allowlist
// of style fields, at most MAX_STYLE_PARAM_LENGTH characters (about 4 KB).
//
// Never in it: the logo (customLogo, an uploaded image or a remote address),
// Logo QR / Image QR art (an image) and any content. Colors are limited to
// hex, rgb()/hsl() and color names, so a value can't point the renderer at a
// remote resource. Decoding validates every field and rejects the whole
// value when anything is off.

import { type FrameSpec, getTemplateIds } from "qrdx";
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
  logoShapeSchema,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
  qrShapeSchema,
} from "qrdx/types";
import { z } from "zod";
import { LOADED_OFFICIAL_FRAMES } from "@/lib/frames/library";
import {
  hasImageFills,
  hasSilhouette,
  withoutImageFills,
} from "@/lib/paint/image-fills";
import {
  MAX_STYLE_PARAM_LENGTH,
  type PlaygroundLinkOptions,
  parsePresetId,
  parseStyleValue,
  playgroundHref,
  STYLE_PARAM_VERSION,
} from "@/lib/playground-links";
import {
  type LinkedField,
  OFFICIAL_FRAME_KEY,
  PRESET_KEY,
  packStyleParam,
  STYLE_KEYS,
} from "@/lib/playground-style-pack";
import type { ThemeStyles } from "@/types/theme";

const KEYS = STYLE_KEYS;

/** Largest quiet zone the editor offers, in modules. */
const MARGIN_MAX = 16;

/** Parts of a design a link leaves out. */
export type OmittedPart = "logo" | "art" | "frame" | "image" | "silhouette";

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
  // An image fill travels like a logo: never in a link
  if (color.type === "image") return false;
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
      shape: logoShapeSchema.optional(),
      plate: safeOptionalColor,
    })
    .strict()
    .optional(),
  shape: qrShapeSchema.optional(),
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

const pack = (
  style: LinkedStyle,
  preset?: string,
  officialFrame?: string,
): string =>
  packStyleParam(style as Partial<ThemeStyles>, preset, officialFrame);

/**
 * Where links find QRdx's official frames: the id of an unchanged official
 * spec, and the spec of an id. In the browser, the library loaded so far
 * (lib/frames/library.ts, the default); on the server, the full catalogue
 * (OFFICIAL_FRAME_RESOLVER in lib/community/catalog.ts).
 */
export interface OfficialFrameResolver {
  idOfSpec: (spec: FrameSpec) => string | undefined;
  specOf: (id: string) => FrameSpec | undefined;
}

/**
 * The official frame (qrdx OFFICIAL_FRAMES) whose exact spec `frame`
 * draws, by id; undefined for any other frame. Its spec then travels as the
 * id, and decodeStyleParam puts the spec back.
 */
function officialFrameId(
  frame: unknown,
  officialFrames: OfficialFrameResolver,
): string | undefined {
  if (!frame || typeof frame !== "object") return undefined;
  const { style, spec } = frame as { style?: unknown; spec?: unknown };
  if (style !== "custom" || !spec || typeof spec !== "object") return undefined;
  return officialFrames.idOfSpec(spec as FrameSpec);
}

/**
 * The official frame id a `style` value names (its spec travels as the id),
 * so a caller can load that frame before decoding. Null for none.
 */
export function officialFrameIdOfStyleParam(
  raw: string | null | undefined,
): string | null {
  const value = parseStyleValue(raw);
  if (!value) return null;
  const json = fromBase64Url(value.slice(STYLE_PARAM_VERSION.length + 1));
  if (json === null) return null;
  try {
    const compact = JSON.parse(json) as Record<string, unknown> | null;
    const id = compact?.[OFFICIAL_FRAME_KEY];
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
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
  options: { preset?: string; officialFrames?: OfficialFrameResolver } = {},
): EncodedStyle | null {
  const omitted: OmittedPart[] = [];
  const style: LinkedStyle = {};
  // Image fills travel like logos, never in a link: each part keeps its
  // underlay color, or its default without one. So does a traced
  // silhouette: the link's code takes its named shape.
  const linked = withoutImageFills(styles);
  if (hasImageFills(styles)) omitted.push("image");
  if (hasSilhouette(styles)) omitted.push("silhouette");

  for (const field of Object.keys(KEYS) as LinkedField[]) {
    if (field === "showLogo") continue;
    const value = linked[field];
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
  // An official frame travels by id (the spec is checked as it was given).
  const official = style.frame
    ? officialFrameId(
        linked.frame,
        options.officialFrames ?? LOADED_OFFICIAL_FRAMES,
      )
    : undefined;
  let value = pack(style, preset, official);
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
  officialFrames: OfficialFrameResolver = LOADED_OFFICIAL_FRAMES,
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
  // An official frame by id: its spec goes back into the custom frame, which
  // must name no spec of its own. Then it's checked like any other frame.
  const officialRaw = source[OFFICIAL_FRAME_KEY];
  if (officialRaw !== undefined) {
    const officialSpec =
      typeof officialRaw === "string"
        ? officialFrames.specOf(officialRaw)
        : undefined;
    const frame = expanded.frame;
    if (
      !officialSpec ||
      !frame ||
      typeof frame !== "object" ||
      Array.isArray(frame) ||
      (frame as { style?: unknown }).style !== "custom" ||
      "spec" in frame
    ) {
      return null;
    }
    expanded.frame = { ...frame, spec: officialSpec };
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

/**
 * A link into the playground that opens with `design` applied: how pages
 * link an example's look. Without a design, a built-in preset as it ships
 * travels as `preset`. With one (a preset with a frame or border added, a
 * showcase look) it travels as `style`, carrying `preset` as its label and
 * Reset base. The rest (type, sample, tab, art, open) goes to playgroundHref
 * as given. A design with nothing a link can carry falls back to the preset.
 */
export function playgroundDesignHref({
  design,
  officialFrames,
  ...options
}: Omit<PlaygroundLinkOptions, "style" | "themeId"> & {
  design?: ThemeStyles;
  /** Server code passes the full catalogue (OFFICIAL_FRAME_RESOLVER) */
  officialFrames?: OfficialFrameResolver;
}): string {
  const encoded = design
    ? encodeStyleParam(design, { preset: options.preset, officialFrames })
    : null;
  return encoded
    ? playgroundHref({ ...options, preset: undefined, style: encoded.value })
    : playgroundHref(options);
}
