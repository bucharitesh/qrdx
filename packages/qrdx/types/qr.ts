import type * as CSS from "csstype";
import { z } from "zod";
import { type QRArt, qrArtSchema } from "./art";
import { type ColorConfig, colorConfigSchema } from "./color";
import {
  type CornerEyeDotPattern,
  cornerEyeDotPatternSchema,
} from "./corner-dot";
import { type CornerEyePattern, cornerEyePatternSchema } from "./corner-eye";
import { type AnyQRFrame, anyFrameSchema } from "./frame-spec";
import { type BodyPattern, bodyPatternSchema } from "./image-pattern";
import type { TemplateDefinition } from "./template";

/**
 * How a logo is cropped: "square" (as uploaded), "rounded" corners or a
 * "circle". A plate behind the logo takes the same shape.
 */
export const LOGO_SHAPES = ["square", "rounded", "circle"] as const;
export const logoShapeSchema = z.enum(LOGO_SHAPES);
export type LogoShape = z.infer<typeof logoShapeSchema>;

// Zod schemas
export const imageSettingsSchema = z.object({
  src: z.string(),
  height: z.number(),
  width: z.number(),
  excavate: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional(),
  /**
   * Extra clear space around the logo when `excavate` is on, in the same
   * pixels as `width` and `height` (default 0).
   */
  padding: z.number().min(0).optional(),
  /** Crop the logo to this shape (default "square": no crop). */
  shape: logoShapeSchema.optional(),
  /**
   * Solid color of a plate behind the logo, in the logo's shape. The plate
   * fills the logo box and the logo is drawn inset inside it.
   */
  plate: z.string().optional(),
});

/**
 * Smallest and largest logo width, as a share of the code's width. Above
 * 25% even level H stops reading in our decode tests (tests/engine-options).
 */
export const LOGO_SIZE_MIN = 0.1;
export const LOGO_SIZE_MAX = 0.3;
/** Logo width `getQRData` uses when no size is given (25%). */
export const LOGO_SIZE_DEFAULT = 0.25;
/** Most clear space around a logo, in modules. */
export const LOGO_PADDING_MAX = 2;

/**
 * Logo layout for `getQRData` and `<QRCode>`, in units that don't depend on
 * the render size: `size` is a share of the code's width, `padding` is clear
 * space in modules, `x` and `y` place the logo's center across the code
 * (0 to 1, 0.5 is the middle; the logo always stays inside the code).
 * `shape` crops it and `plate` draws a solid plate behind it.
 */
export const logoOptionsSchema = z.object({
  size: z.number().min(LOGO_SIZE_MIN).max(LOGO_SIZE_MAX).optional(),
  padding: z.number().min(0).max(LOGO_PADDING_MAX).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  shape: logoShapeSchema.optional(),
  plate: z.string().optional(),
});
export type LogoOptions = z.infer<typeof logoOptionsSchema>;

export const errorLevelSchema = z.enum(["L", "M", "Q", "H"]);

/** Smallest and largest `moduleScale` (size of each data module). */
export const MODULE_SCALE_MIN = 0.5;
export const MODULE_SCALE_MAX = 1;

/**
 * Share of the code a logo may cover before `autoLevel` raises error
 * correction to H (level L recovers about 7%).
 */
export const AUTO_LEVEL_LOGO_COVERAGE = 0.07;

/**
 * Outline of the whole code: "square" (the QR symbol as is), "circle" or
 * "heart": the symbol sits in a disc or a heart filled with decorative
 * modules. Decoders read only the symbol, which keeps its quiet ring
 * (`margin`, at least QR_CIRCLE_QUIET_MIN modules) before the decoration
 * starts. `shape` also takes a `QRSilhouette`, an outline of your own.
 */
export const QR_SHAPES = ["square", "circle", "heart"] as const;
export const qrShapeSchema = z.enum(QR_SHAPES);
export type QRShape = z.infer<typeof qrShapeSchema>;
/** Smallest light ring between a shaped code's symbol and its decoration. */
export const QR_CIRCLE_QUIET_MIN = 3;

/** Most cells along a silhouette's longer side. */
export const QR_SILHOUETTE_MAX_CELLS = 64;
/** Fewest cells along each side of a silhouette. */
export const QR_SILHOUETTE_MIN_CELLS = 8;
/**
 * Smallest share of the artwork's width the symbol and its quiet ring may
 * take inside a silhouette (a circle code's is about 0.7, a heart's 0.6).
 * Thinner silhouettes are refused: the code would be a small square in a
 * large field of decoration.
 */
export const QR_SILHOUETTE_MIN_SHARE = 0.42;

/**
 * An outline of your own for `shape`: a small grid sampled from a picture's
 * alpha or darkness (`createQRSilhouette`, `loadQRSilhouette`), never the
 * picture itself. The symbol sits in the middle of the silhouette's largest
 * square and the rest of it fills with decorative modules, like a circle
 * code. `getQRSilhouetteFit` says whether one is roomy enough; one that
 * isn't draws as a square code.
 */
export const qrSilhouetteSchema = z
  .object({
    type: z.literal("silhouette"),
    width: z
      .number()
      .int()
      .min(QR_SILHOUETTE_MIN_CELLS)
      .max(QR_SILHOUETTE_MAX_CELLS),
    height: z
      .number()
      .int()
      .min(QR_SILHOUETTE_MIN_CELLS)
      .max(QR_SILHOUETTE_MAX_CELLS),
    cells: z
      .string()
      .max(QR_SILHOUETTE_MAX_CELLS * QR_SILHOUETTE_MAX_CELLS)
      .regex(/^[01]*$/)
      .describe(
        'Row by row, "1" inside the shape and "0" outside: width × height characters'
      ),
  })
  .refine(
    (silhouette) =>
      silhouette.cells.length === silhouette.width * silhouette.height,
    {
      message: "Silhouette cells do not match its width and height",
    }
  );
export type QRSilhouette = z.infer<typeof qrSilhouetteSchema>;

/** What `shape` takes: a named outline or a silhouette. */
export const qrCodeShapeSchema = z.union([qrShapeSchema, qrSilhouetteSchema]);
export type QRCodeShape = QRShape | QRSilhouette;

/** The three finder patterns, for per-eye colors. */
export const EYE_POSITIONS = ["topLeft", "topRight", "bottomLeft"] as const;
export type EyePosition = (typeof EYE_POSITIONS)[number];

/** Colors of one eye: `outer` is the frame, `inner` the dot in it. */
export const eyeColorOverrideSchema = z.object({
  outer: colorConfigSchema.optional(),
  inner: colorConfigSchema.optional(),
});

/** Per-eye overrides of `eyeColor` (outer) and `dotColor` (inner). */
export const eyeColorsSchema = z.object({
  topLeft: eyeColorOverrideSchema.optional(),
  topRight: eyeColorOverrideSchema.optional(),
  bottomLeft: eyeColorOverrideSchema.optional(),
});

export const qrPropsSchema = z.object({
  value: z.string(),
  size: z.number().optional(),
  level: errorLevelSchema.optional(),
  bgColor: colorConfigSchema.optional(),
  fgColor: colorConfigSchema.optional(),
  eyeColor: colorConfigSchema.optional(),
  dotColor: colorConfigSchema.optional(),
  bodyPattern: bodyPatternSchema.optional(),
  cornerEyePattern: cornerEyePatternSchema.optional(),
  cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
  margin: z.number().optional(),
  imageSettings: imageSettingsSchema.optional(),
  isOGContext: z.boolean().optional(),
  templateId: z.string().optional(),
  customProps: z.record(z.string(), z.any()).optional(),
  frame: anyFrameSchema.optional(),
  art: qrArtSchema.optional(),
  eyeColors: eyeColorsSchema.optional(),
  moduleScale: z
    .number()
    .min(MODULE_SCALE_MIN)
    .max(MODULE_SCALE_MAX)
    .optional(),
  autoLevel: z.boolean().optional(),
  shape: qrCodeShapeSchema.optional(),
});

// Inferred types
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
export type ErrorLevel = z.infer<typeof errorLevelSchema>;
export type EyeColorOverride = z.infer<typeof eyeColorOverrideSchema>;
export type EyeColors = z.infer<typeof eyeColorsSchema>;

export interface QRProps {
  value: string;
  size?: number;
  level?: ErrorLevel;
  bgColor?: ColorConfig;
  fgColor?: ColorConfig;
  eyeColor?: ColorConfig;
  dotColor?: ColorConfig;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  margin?: number;
  style?: QRStyle;
  imageSettings?: ImageSettings;
  isOGContext?: boolean;
  templateId?: string;
  // Custom template definition - if provided, this will be used instead of looking up by templateId
  customTemplate?: TemplateDefinition<any>;
  // Generic custom props that can be used by any template
  // Each template can define its own custom props type (e.g., FlamQRProps)
  customProps?: Record<string, any>;
  // Frame around the code: a built-in style, or { style: "custom", spec }
  // (see types/frame-spec.ts); the rendered output grows to fit it
  frame?: AnyQRFrame;
  // Blend a logo or photo into the modules (vector, no AI); see types/art.ts
  art?: QRArt;
  // Per-eye colors; each overrides eyeColor (outer) / dotColor (inner)
  eyeColors?: EyeColors;
  // Size of each data module, 0.5 to 1 (default 1). Connected styles get
  // thinner lines instead. Alignment patterns stay full size.
  moduleScale?: number;
  // Raise error correction to H when the logo covers more than 7% of the
  // code (off by default, so existing output never changes)
  autoLevel?: boolean;
  // Outline: "circle" or "heart" puts the symbol in a disc or a heart of
  // decorative modules (see QR_SHAPES); a QRSilhouette fills an outline of
  // your own. Ignored with a template.
  shape?: QRCodeShape;
  // For editors drawing a live preview: marks each frame label <text> with
  // data-qrdx-frame-label (its FrameLabel.field). Off by default, and every
  // export (getQRAsSVGDataUri and the PNG, JPG, PDF and EPS built on it)
  // drops it, so downloads never carry the marker.
  frameLabelMarkers?: boolean;
  // For editors drawing a live preview: marks the drawn parts with
  // data-qrdx-part ("eye-outer" and "eye-centre", each with data-qrdx-eye,
  // "body", "logo", "background"; see QR_PART_ATTRIBUTE). Off by default,
  // and every export drops it, like frameLabelMarkers.
  partMarkers?: boolean;
}

/**
 * Inline styles for the root element, as a style object (`{ maxWidth: 200 }`):
 * the same type as React's `CSSProperties`, without needing React.
 */
export type QRStyle = CSS.Properties<string | number>;

/**
 * Attributes for the root `<svg>`, with React's names (`className`, `style`,
 * `aria-label`, `data-*`…). Event handlers and functions are left out of
 * markup, as React leaves them out.
 */
export interface QRSVGAttributes {
  [attribute: string]: any;
}

/** What the core draws (`createQRCodeTree`, `toSVGString`): `QRProps` plus root attributes. */
export type QRSVGOptions = QRProps & QRSVGAttributes;
