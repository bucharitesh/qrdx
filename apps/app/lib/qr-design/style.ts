// How a QR code looks, as the AI chat and the MCP `design_qr` tool describe
// it: every style option the engine renders, limited to values it accepts.
// The same schema is Gemini's structured output (lib/ai/agent) and the MCP
// input, and `toThemeStyles` turns it into the editor's ThemeStyles.
//
// Not here, on purpose: uploaded logos and Logo QR / Image QR art (they need
// an image the user supplies) and retired shapes (curly eyes; diamond, star
// and banner centers), which don't scan reliably.
import { getTemplateIds } from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type ColorConfig,
  DEFAULT_FRAME_TEXT,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  getSolidColor,
  isGradient,
  type QRFrame,
} from "qrdx/types";
import { z } from "zod";
import type { ThemeStyles } from "@/types/theme";

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Quick logo icons the editor offers (components/editor/control-sections/logo-presets.tsx). */
export const LOGO_ICON_IDS = [
  "wifi",
  "location",
  "phone",
  "email",
  "link",
  "file",
  "calendar",
  "whatsapp",
  "instagram",
] as const;
export type LogoIconId = (typeof LOGO_ICON_IDS)[number];

/**
 * "none": no logo. "keep": whatever logo the code shows now (an uploaded one
 * stays). "qrdx": the QRdx mark. The rest are the editor's quick icons.
 */
export const LOGO_CHOICES = ["none", "keep", "qrdx", ...LOGO_ICON_IDS] as const;
export type LogoChoice = (typeof LOGO_CHOICES)[number];

/** Engine border templates; "default" is no border. */
export const TEMPLATE_IDS = getTemplateIds() as [string, ...string[]];

export const ERROR_LEVELS = ["L", "M", "Q", "H"] as const;

export const MARGIN_MAX = 16;

type Hex = (description: string) => z.ZodString;

/** A two-color gradient on one part of the code. */
type GradientInput = {
  type: "linear" | "radial";
  from: string;
  to: string;
  angle?: number;
};

const strictHex: Hex = (description) =>
  z.string().regex(HEX_COLOR).describe(`${description}, #RRGGBB`);
const strictLabel = (description: string) =>
  z.string().max(FRAME_TEXT_MAX_LENGTH).describe(description);

/*
 * Models don't reliably keep to regex patterns or length limits in
 * structured output (Gemini once wrote an explanation inside a color). The
 * designer gets plain strings, and sanitizeDesignStyle makes its answer
 * valid before the strict schema checks it.
 */
const looseHex: Hex = (description) =>
  z.string().describe(`${description}, exactly #RRGGBB`);
const looseLabel = (description: string) => z.string().describe(description);

const gradientSchemaOf = (hex: Hex) =>
  z
    .object({
      type: z.enum(["linear", "radial"]),
      from: hex("Start color"),
      to: hex("End color"),
      angle: z
        .number()
        .int()
        .min(0)
        .max(360)
        .optional()
        .describe("Linear gradients only: 0 left to right, 90 top to bottom"),
    })
    .describe("A two-color gradient that replaces the solid color");

const frameSchemaOf = (hex: Hex, label: (description: string) => z.ZodString) =>
  z.object({
    style: z
      .enum(FRAME_STYLES)
      .describe("Call-to-action frame around the code; none for no frame"),
    text: label(
      `Frame label, at most ${FRAME_TEXT_MAX_LENGTH} characters (default "${DEFAULT_FRAME_TEXT}")`,
    ).optional(),
    secondaryText: label(
      "Second label: bottom band of banner-top-bottom, lower arc of circle, menu-card footer",
    ).optional(),
    color: hex("Frame color").optional(),
    textColor: hex("Frame label color").optional(),
  });

const styleSchemaOf = (
  hex: Hex,
  label: (description: string) => z.ZodString,
) => {
  const gradientSchema = gradientSchemaOf(hex);
  return z.object({
    bgColor: hex("Background color"),
    fgColor: hex("Color of the dots (data modules)"),
    eyeColor: hex("Color of the three corner eye frames"),
    dotColor: hex("Color of the corner eye centers"),
    bodyPattern: z.enum(BODY_PATTERN).describe("Shape of the dots"),
    cornerEyePattern: z
      .enum(CORNER_EYE_PATTERNS)
      .describe("Shape of the corner eye frames"),
    cornerEyeDotPattern: z
      .enum(CORNER_EYE_DOT_PATTERNS)
      .describe("Shape of the corner eye centers"),
    gradients: z
      .object({
        body: gradientSchema.optional(),
        background: gradientSchema.optional(),
        eyes: gradientSchema.optional(),
        eyeCentres: gradientSchema.optional(),
      })
      .optional()
      .describe(
        "Optional gradients; leave a part out for its solid color. Each gradient's colors must contrast with the background like the solid ones",
      ),
    margin: z
      .number()
      .int()
      .min(0)
      .max(MARGIN_MAX)
      .describe("Quiet zone around the code, in modules (4 is ideal)"),
    level: z
      .enum(ERROR_LEVELS)
      .describe(
        "Error correction: L 7%, M 15%, Q 25%, H 30% (use H with a logo)",
      ),
    frame: frameSchemaOf(hex, label),
    templateId: z
      .enum(TEMPLATE_IDS)
      .describe('Decorative border template; "default" for none'),
    logo: z
      .enum(LOGO_CHOICES)
      .describe(
        "Center logo: none, keep (the current one), qrdx, or an icon (wifi, location, phone, email, link, file, calendar, whatsapp, instagram)",
      ),
  });
};

export const designFrameSchema = frameSchemaOf(strictHex, strictLabel);

/** The complete look of a code (no content). */
export const designStyleSchema = styleSchemaOf(strictHex, strictLabel);

/** The designer model's output: the same shape with plain strings. */
export const designerOutputSchema = styleSchemaOf(looseHex, looseLabel);

/** The first #RRGGBB (or #RGB) in a model's color, or `fallback`. */
function cleanHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const long = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])/.exec(value)?.[0];
  if (long) return long.toUpperCase();
  const short = /#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])(?![0-9a-fA-F])/.exec(
    value,
  );
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase()
    : fallback;
}

const cleanLabel = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, FRAME_TEXT_MAX_LENGTH)
    : undefined;

/**
 * A designer answer made valid: colors reduced to the #RRGGBB they
 * contain (or the fallback style's), labels clipped to the frame limit.
 */
export function sanitizeDesignStyle(
  raw: z.infer<typeof designerOutputSchema>,
  fallback: DesignStyle,
): DesignStyle {
  const gradient = (value: GradientInput | undefined, from: string) =>
    value
      ? {
          ...value,
          from: cleanHex(value.from, from),
          to: cleanHex(value.to, from),
        }
      : undefined;
  const fg = cleanHex(raw.fgColor, fallback.fgColor);
  const bg = cleanHex(raw.bgColor, fallback.bgColor);
  const gradients = raw.gradients
    ? Object.fromEntries(
        Object.entries({
          body: gradient(raw.gradients.body, fg),
          background: gradient(raw.gradients.background, bg),
          eyes: gradient(raw.gradients.eyes, fg),
          eyeCentres: gradient(raw.gradients.eyeCentres, fg),
        }).filter(([, value]) => value),
      )
    : undefined;
  const text = cleanLabel(raw.frame.text);
  const secondaryText = cleanLabel(raw.frame.secondaryText);
  const color = raw.frame.color ? cleanHex(raw.frame.color, "") : "";
  const textColor = raw.frame.textColor
    ? cleanHex(raw.frame.textColor, "")
    : "";
  return {
    ...raw,
    bgColor: bg,
    fgColor: fg,
    eyeColor: cleanHex(raw.eyeColor, fg),
    dotColor: cleanHex(raw.dotColor, fg),
    ...(gradients && Object.keys(gradients).length > 0 ? { gradients } : {}),
    frame: {
      style: raw.frame.style,
      ...(text !== undefined ? { text } : {}),
      ...(secondaryText ? { secondaryText } : {}),
      ...(color ? { color } : {}),
      ...(textColor ? { textColor } : {}),
    },
  } as DesignStyle;
}

export type DesignStyle = z.infer<typeof designStyleSchema>;

/** A plain black-on-white code: what a design falls back to. */
export const CLASSIC_STYLE: DesignStyle = {
  bgColor: "#FFFFFF",
  fgColor: "#000000",
  eyeColor: "#000000",
  dotColor: "#000000",
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
  margin: 4,
  level: "Q",
  frame: { style: "none" },
  templateId: "default",
  logo: "none",
};

const toColor = (
  solid: string,
  gradient: GradientInput | undefined,
): ColorConfig => {
  if (!gradient) return solid;
  const stops = [
    { color: gradient.from, offset: 0 },
    { color: gradient.to, offset: 100 },
  ];
  return gradient.type === "linear"
    ? { type: "linear", stops, angle: gradient.angle ?? 0 }
    : { type: "radial", stops };
};

/** Frame props the engine renders, or undefined for "none". */
export function toFrame(frame: DesignStyle["frame"]): QRFrame | undefined {
  if (frame.style === "none") return undefined;
  return {
    style: frame.style,
    text: frame.text?.trim() || DEFAULT_FRAME_TEXT,
    ...(frame.secondaryText?.trim()
      ? { secondaryText: frame.secondaryText.trim() }
      : {}),
    ...(frame.color ? { color: frame.color } : {}),
    ...(frame.textColor ? { textColor: frame.textColor } : {}),
  };
}

/** How the logo shows, apart from which image (icons resolve in the browser). */
export interface LogoSetting {
  showLogo: boolean;
  /** The image source: the current logo, the QRdx mark, or an icon id */
  source: "keep" | "qrdx" | LogoIconId | null;
}

export function toLogoSetting(logo: LogoChoice): LogoSetting {
  if (logo === "none") return { showLogo: false, source: null };
  return { showLogo: true, source: logo };
}

/**
 * The editor's ThemeStyles for a design, without the logo image (the
 * browser resolves icons and keeps an uploaded logo; see LogoSetting).
 */
export function toThemeStyles(design: DesignStyle): ThemeStyles {
  const gradients = design.gradients ?? {};
  const frame = toFrame(design.frame);
  return {
    bgColor: toColor(design.bgColor, gradients.background),
    fgColor: toColor(design.fgColor, gradients.body),
    eyeColor: toColor(design.eyeColor, gradients.eyes),
    dotColor: toColor(design.dotColor, gradients.eyeCentres),
    bodyPattern: design.bodyPattern,
    cornerEyePattern: design.cornerEyePattern,
    cornerEyeDotPattern: design.cornerEyeDotPattern,
    margin: design.margin,
    level: design.level,
    ...(frame ? { frame } : {}),
    ...(design.templateId !== "default"
      ? { templateId: design.templateId }
      : {}),
    showLogo: design.logo !== "none",
  };
}

const solidHex = (color: ColorConfig | undefined, fallback: string) => {
  const solid = getSolidColor(color, fallback);
  return typeof solid === "string" && HEX_COLOR.test(solid)
    ? solid.toUpperCase()
    : fallback;
};

const gradientOf = (color: ColorConfig | undefined) => {
  if (!color || typeof color === "string" || !isGradient(color)) {
    return undefined;
  }
  const from = color.stops[0]?.color;
  const to = color.stops.at(-1)?.color;
  if (!(from && to && HEX_COLOR.test(from) && HEX_COLOR.test(to))) {
    return undefined;
  }
  return color.type === "linear"
    ? { type: "linear" as const, from, to, angle: Math.round(color.angle ?? 0) }
    : { type: "radial" as const, from, to };
};

const pick = <T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T => (options.includes(value as T) ? (value as T) : fallback);

/**
 * The design that matches editor styles, as the starting point for a
 * change ("make it darker"). Values the schema can't express (a retired
 * shape, an rgba color) fall back to safe ones.
 */
export function fromThemeStyles(
  styles: ThemeStyles,
  logo: { showLogo: boolean } = { showLogo: Boolean(styles.showLogo) },
): DesignStyle {
  const fg = solidHex(styles.fgColor, "#000000");
  const gradients = {
    body: gradientOf(styles.fgColor),
    background: gradientOf(styles.bgColor),
    eyes: gradientOf(styles.eyeColor),
    eyeCentres: gradientOf(styles.dotColor),
  };
  const hasGradient = Object.values(gradients).some(Boolean);
  const frame = styles.frame;
  return {
    bgColor: solidHex(styles.bgColor, "#FFFFFF"),
    fgColor: fg,
    eyeColor: solidHex(styles.eyeColor, fg),
    dotColor: solidHex(styles.dotColor, fg),
    bodyPattern: pick(BODY_PATTERN, styles.bodyPattern, "square"),
    cornerEyePattern: pick(
      CORNER_EYE_PATTERNS,
      styles.cornerEyePattern,
      "rounded",
    ),
    cornerEyeDotPattern: pick(
      CORNER_EYE_DOT_PATTERNS,
      styles.cornerEyeDotPattern,
      "rounded",
    ),
    ...(hasGradient
      ? {
          gradients: Object.fromEntries(
            Object.entries(gradients).filter(([, value]) => value),
          ),
        }
      : {}),
    margin: Math.min(
      MARGIN_MAX,
      Math.max(0, Math.round(styles.margin ?? CLASSIC_STYLE.margin)),
    ),
    level: pick(ERROR_LEVELS, styles.level, "Q"),
    // A custom frame (a frame spec) can't be described here: the chat and
    // the MCP tool design built-in frames only.
    frame:
      frame && frame.style !== "none" && frame.style !== "custom"
        ? {
            style: frame.style,
            ...(frame.text !== undefined ? { text: frame.text } : {}),
            ...(frame.secondaryText
              ? { secondaryText: frame.secondaryText }
              : {}),
            ...(frame.color && HEX_COLOR.test(frame.color)
              ? { color: frame.color }
              : {}),
            ...(frame.textColor && HEX_COLOR.test(frame.textColor)
              ? { textColor: frame.textColor }
              : {}),
          }
        : { style: "none" },
    templateId: pick(TEMPLATE_IDS, styles.templateId, "default"),
    logo: logo.showLogo ? "keep" : "none",
  };
}

const PLAIN_NAMES: Record<string, string> = {
  bgColor: "background",
  fgColor: "dots",
  eyeColor: "corner eyes",
  dotColor: "eye centers",
  bodyPattern: "dot shape",
  cornerEyePattern: "eye shape",
  cornerEyeDotPattern: "eye center shape",
  margin: "margin",
  level: "error correction",
  frame: "frame",
  templateId: "border",
  logo: "logo",
  gradients: "gradients",
};

const describeValue = (key: string, value: unknown): string => {
  if (key === "frame") {
    const frame = value as DesignStyle["frame"];
    return frame.style === "none"
      ? "none"
      : `${frame.style}${frame.text ? ` "${frame.text}"` : ""}`;
  }
  if (key === "templateId") return value === "default" ? "none" : String(value);
  if (key === "gradients") {
    const entries = Object.entries((value ?? {}) as object);
    return entries.length ? entries.map(([part]) => part).join(", ") : "none";
  }
  return String(value);
};

/** "dots #1E3A8A → #111111" lines for every option that differs. */
export function styleDiff(
  before: DesignStyle | null,
  after: DesignStyle,
): { key: string; label: string; from?: string; to: string }[] {
  return (Object.keys(PLAIN_NAMES) as (keyof DesignStyle)[]).flatMap((key) => {
    const next = after[key];
    const previous = before?.[key];
    if (JSON.stringify(previous ?? null) === JSON.stringify(next ?? null)) {
      return [];
    }
    if (next === undefined && key === "gradients" && !previous) return [];
    return [
      {
        key,
        label: PLAIN_NAMES[key] ?? key,
        ...(previous !== undefined
          ? { from: describeValue(key, previous) }
          : {}),
        to: describeValue(key, next ?? (key === "gradients" ? {} : "")),
      },
    ];
  });
}
