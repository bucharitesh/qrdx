/** biome-ignore-all lint/style/noMagicNumbers: spec limits */
// A frame as data: the shapes, labels, colors and QR placement the engine
// draws. It renders identically in SVG, canvas, PDF and EPS because it is
// compiled to the same plain shapes the built-in frames use. There is no
// markup, no URL and no image in it, so a spec from anyone is safe to store,
// share and render. Every field is validated with hard limits (see
// FRAME_SPEC_LIMITS); unknown keys are rejected. The engine validates with
// frame-spec-parse.ts, the same rules without zod
// (tests/frame-spec-parse.test.ts keeps the two in step).

import { z } from "zod";
import { FRAME_TEXT_MAX_LENGTH } from "./constants";
import { frameSchema } from "./frame";
import {
  CUSTOM_FRAME_STYLE,
  checkFrameSpec,
  FRAME_COLOR_TOKENS,
  FRAME_ICONS,
  FRAME_SPEC_KIND,
  FRAME_SPEC_LIMITS,
  FRAME_SPEC_VERSION,
  hasPrecision,
} from "./frame-spec-rules";

// The limits, text rules and geometry are in frame-spec-rules.ts (no zod)
export {
  CUSTOM_FRAME_STYLE,
  FRAME_COLOR_TOKENS,
  FRAME_ICON_MAX_SEGMENTS,
  FRAME_ICONS,
  FRAME_SPEC_CAP_HALF,
  FRAME_SPEC_DEFAULT_FONT,
  FRAME_SPEC_KIND,
  FRAME_SPEC_LABEL_MAX_FONT,
  FRAME_SPEC_LIMITS,
  FRAME_SPEC_VERSION,
  frameSpecPadding,
  frameSpecQrZone,
  frameSpecShapeBounds,
  isLatin1Text,
  sanitizeFrameText,
} from "./frame-spec-rules";

// ── Schemas ────────────────────────────────────────────────────────────────

const number = z
  .number()
  .min(-FRAME_SPEC_LIMITS.maxCoordinate)
  .max(FRAME_SPEC_LIMITS.maxCoordinate)
  .refine(hasPrecision, {
    message: `Numbers may have at most ${FRAME_SPEC_LIMITS.maxDecimals} decimals`,
  });
const positive = number.refine((value) => value > 0, {
  message: "Must be greater than 0",
});
const nonNegative = number.refine((value) => value >= 0, {
  message: "Must not be negative",
});

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a #rgb or #rrggbb color");

const baseColorSchema = z.union([z.enum(FRAME_COLOR_TOKENS), hexColorSchema]);

const mixSchema = <T extends z.ZodType>(base: T) =>
  z
    .object({
      mix: z.tuple([base, base]),
      amount: z.number().min(0).max(1).refine(hasPrecision),
    })
    .strict();

/** A theme token, a fixed hex color, or an opaque mix of two of them. */
export const frameSpecColorSchema = z.union([
  baseColorSchema,
  mixSchema(baseColorSchema),
]);

/**
 * The text color's default: a hex color, or a mix of the frame and accent
 * colors (and fixed colors), worked out from the frame's own colors. It
 * can't refer to `text` itself.
 */
const defaultTextColorSchema = z.union([
  hexColorSchema,
  mixSchema(
    z.union([z.enum(["frame", "accent", "background"]), hexColorSchema])
  ),
]);

/**
 * A solid color, or a gradient drawn as solid color steps (so EPS, which
 * has no transparency or blending, draws it the same as SVG).
 */
export const frameSpecPaintSchema = z.union([
  frameSpecColorSchema,
  z
    .object({
      gradient: z
        .object({
          from: frameSpecColorSchema,
          to: frameSpecColorSchema,
          direction: z.enum(["horizontal", "vertical"]).optional(),
          steps: z
            .int()
            .min(2)
            .max(FRAME_SPEC_LIMITS.maxGradientSteps)
            .optional(),
        })
        .strict(),
    })
    .strict(),
]);

const boxFields = {
  x: number,
  y: number,
  width: positive,
  height: positive,
};

/**
 * An outline drawn along a shape's edge, centered on it (half inside, half
 * outside), in one solid color. Corners are mitered, as SVG draws them.
 */
const strokeSchema = z
  .object({
    color: frameSpecColorSchema,
    /** Thickness, at most 10% of the artboard's shorter side */
    width: positive,
  })
  .strict();

const rectShapeSchema = z
  .object({
    type: z.literal("rect"),
    ...boxFields,
    radius: nonNegative.optional(),
    fill: frameSpecPaintSchema,
    /** Area cut out of the rect */
    hole: z
      .object({ ...boxFields, radius: nonNegative.optional() })
      .strict()
      .optional(),
    stroke: strokeSchema.optional(),
  })
  .strict();

const circleShapeSchema = z
  .object({
    type: z.literal("circle"),
    cx: number,
    cy: number,
    r: positive,
    /** Radius of a hole in the middle (a ring) */
    hole: positive.optional(),
    fill: frameSpecPaintSchema,
    stroke: strokeSchema.optional(),
  })
  .strict();

const ellipseShapeSchema = z
  .object({
    type: z.literal("ellipse"),
    cx: number,
    cy: number,
    rx: positive,
    ry: positive,
    fill: frameSpecPaintSchema,
    stroke: strokeSchema.optional(),
  })
  .strict();

const polygonShapeSchema = z
  .object({
    type: z.literal("polygon"),
    points: z
      .array(z.tuple([number, number]))
      .min(3)
      .max(FRAME_SPEC_LIMITS.maxPolygonPoints),
    fill: frameSpecPaintSchema,
    stroke: strokeSchema.optional(),
  })
  .strict();

const pathShapeSchema = z
  .object({
    type: z.literal("path"),
    /** SVG path data: M L H V C S Q T A Z, plain numbers, no exponents */
    d: z.string().min(2).max(FRAME_SPEC_LIMITS.maxPathLength),
    fill: frameSpecPaintSchema,
    fillRule: z.enum(["nonzero", "evenodd"]).optional(),
    stroke: strokeSchema.optional(),
  })
  .strict();

const lineShapeSchema = z
  .object({
    type: z.literal("line"),
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    /** Thickness (lines are filled outlines, never strokes) */
    width: positive,
    cap: z.enum(["butt", "round"]).optional(),
    /** Dash and gap lengths, for perforations */
    dash: z.tuple([positive, positive]).optional(),
    fill: frameSpecPaintSchema,
  })
  .strict();

const iconShapeSchema = z
  .object({
    type: z.literal("icon"),
    icon: z.enum(FRAME_ICONS),
    /** Top-left corner of the icon's square */
    x: number,
    y: number,
    size: positive,
    fill: frameSpecPaintSchema,
  })
  .strict();

export const frameSpecShapeSchema = z.discriminatedUnion("type", [
  rectShapeSchema,
  circleShapeSchema,
  ellipseShapeSchema,
  polygonShapeSchema,
  pathShapeSchema,
  lineShapeSchema,
  iconShapeSchema,
]);

const labelFields = {
  /** Stable id, for editors: a-z, 0-9 and "-" */
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  /**
   * `primary` shows `frame.text`, `secondary` shows `frame.secondaryText`
   * (each falls back to `text`; "" hides the label), `fixed` always shows
   * `text`.
   */
  slot: z.enum(["primary", "secondary", "fixed"]),
  /** Default text */
  text: z.string().max(200),
  /** Longest text the label takes (up to 24 characters) */
  maxLength: z.int().min(1).max(FRAME_TEXT_MAX_LENGTH).optional(),
  color: frameSpecColorSchema,
  weight: z.enum(["bold", "regular"]).optional(),
  /**
   * A band of the artboard that goes away when the label shows no text:
   * the rows from `y` to `y + height` are cut out, everything below moves
   * up and the artwork gets shorter. Shapes that lie wholly inside the band
   * are left out; shapes that cross it are shortened. The band never
   * touches the code or its padding.
   */
  collapse: z.object({ y: number, height: positive }).strict().optional(),
};

const textLabelSchema = z
  .object({
    type: z.literal("text"),
    ...labelFields,
    /** Row the label is fitted in: centered vertically, shrunk to the width */
    box: z.object(boxFields).strict(),
    align: z.enum(["start", "middle", "end"]).optional(),
    /** Font size at fontScale 1 (default: 52% of the row height) */
    fontSize: positive.optional(),
  })
  .strict();

const curvedLabelSchema = z
  .object({
    type: z.literal("curved"),
    ...labelFields,
    /** Letters set along a circle, over the top or along the bottom */
    curve: z
      .object({
        cx: number,
        cy: number,
        radius: positive,
        side: z.enum(["top", "bottom"]),
        /** Most of the circle the text may use, in degrees (default 140) */
        spread: z.number().min(20).max(300).refine(hasPrecision).optional(),
      })
      .strict(),
    /** Font size at fontScale 1 (shrunk to fit the spread) */
    fontSize: positive,
  })
  .strict();

export const frameSpecLabelSchema = z.discriminatedUnion("type", [
  textLabelSchema,
  curvedLabelSchema,
]);

const artboardSide = number.refine(
  (value) =>
    value >= FRAME_SPEC_LIMITS.minArtboard &&
    value <= FRAME_SPEC_LIMITS.maxArtboard,
  {
    message: `Artboard sides must be ${FRAME_SPEC_LIMITS.minArtboard} to ${FRAME_SPEC_LIMITS.maxArtboard} units`,
  }
);

const frameSpecObjectSchema = z
  .object({
    kind: z.literal(FRAME_SPEC_KIND),
    version: z.literal(FRAME_SPEC_VERSION),
    /** Size of the whole artwork, in spec units */
    artboard: z.object({ width: artboardSide, height: artboardSide }).strict(),
    /**
     * Where the code goes (its own margin included). The engine paints an
     * opaque plate of the code's background under it and `padding` around
     * it, so no artwork ever shows in the quiet zone.
     */
    qr: z
      .object({
        x: number,
        y: number,
        size: positive,
        /** Light space around the code (default 8% of size, at least 4%) */
        padding: nonNegative.optional(),
        /** Corner radius of the plate */
        radius: nonNegative.optional(),
        /**
         * What the plate and `background` fills are painted with when the
         * code's background is see-through. "opaque" (the default) paints
         * them white, so artwork never shows through the quiet zone.
         * "background" keeps them see-through too (and leaves the plate
         * out); it's allowed only when nothing but `background` fills, or a
         * ring whose hole clears the plate, lies under the plate. "none"
         * paints no plate at all: the code's own background and margin are
         * its light space, so `padding` may be under 4% (down to 0), and
         * whatever lies under the code shows through a see-through
         * background.
         */
        plate: z.enum(["opaque", "background", "none"]).optional(),
      })
      .strict(),
    /** Default colors, used when the theme sets none */
    colors: z
      .object({
        frame: hexColorSchema,
        /**
         * Default text color (else the frame color): a hex color, or a mix
         * of `frame`, `accent` and fixed colors
         */
        text: defaultTextColorSchema.optional(),
        accent: hexColorSchema.optional(),
      })
      .strict(),
    /** Painted behind the code, in order */
    shapes: z.array(frameSpecShapeSchema).max(FRAME_SPEC_LIMITS.maxShapes),
    labels: z.array(frameSpecLabelSchema).max(FRAME_SPEC_LIMITS.maxLabels),
    /**
     * Color print bleed continues with when the artwork fills its whole
     * artboard edge to edge ("none" by default: bleed stays paper).
     */
    bleed: z.union([z.literal("none"), frameSpecColorSchema]).optional(),
  })
  .strict();

export type FrameSpecColor = z.infer<typeof frameSpecColorSchema>;
/** A spec's default text color (`colors.text`). */
export type FrameSpecDefaultTextColor = z.infer<typeof defaultTextColorSchema>;
export type FrameSpecPaint = z.infer<typeof frameSpecPaintSchema>;
export type FrameSpecShape = z.infer<typeof frameSpecShapeSchema>;
export type FrameSpecLabel = z.infer<typeof frameSpecLabelSchema>;
export type FrameSpecIcon = (typeof FRAME_ICONS)[number];
export type FrameSpec = z.infer<typeof frameSpecObjectSchema>;

/**
 * Zod schema for a frame spec, with every limit and cross-field check
 * (FRAME_SPEC_LIMITS). Validate specs from users with this before storing
 * them; the engine validates again before drawing.
 */
export const frameSpecSchema = frameSpecObjectSchema.superRefine((spec, ctx) =>
  checkFrameSpec(spec, (message, path = []) =>
    ctx.addIssue({ code: "custom", message, path })
  )
);

/** Human-readable problems with `input` as a frame spec (empty when valid). */
export function getFrameSpecIssues(input: unknown): string[] {
  const result = frameSpecSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join(".")}: ${issue.message}`
      : issue.message
  );
}

// ── Frame options ──────────────────────────────────────────────────────────

/**
 * A frame drawn from a spec: `{ style: "custom", spec }`. `text` and
 * `secondaryText` fill the spec's primary and secondary labels; `color`,
 * `textColor` and `secondaryColor` override its frame, text and accent
 * colors; `fontScale` scales its labels.
 */
export const customFrameSchema = frameSchema.extend({
  style: z.literal(CUSTOM_FRAME_STYLE),
  spec: frameSpecSchema,
});

/** A built-in frame (`frameSchema`) or a custom one (`customFrameSchema`). */
export const anyFrameSchema = z.discriminatedUnion("style", [
  frameSchema,
  customFrameSchema,
]);

export type QRCustomFrame = z.infer<typeof customFrameSchema>;
export type AnyQRFrame = z.infer<typeof anyFrameSchema>;
