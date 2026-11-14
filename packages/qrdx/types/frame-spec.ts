/** biome-ignore-all lint/style/noMagicNumbers: spec limits */
// A frame as data: the shapes, labels, colors and QR placement the engine
// draws. It renders identically in SVG, canvas, PDF and EPS because it is
// compiled to the same plain shapes the built-in frames use. There is no
// markup, no URL and no image in it, so a spec from anyone is safe to store,
// share and render. Every field is validated with hard limits (see
// FRAME_SPEC_LIMITS); unknown keys are rejected.

import { z } from "zod";
import { countPathSegments, tokenizePathData } from "../src/utils/path-data";
import { clipPolygon, segmentsBounds } from "../src/utils/polygon-clip";
import { parsePathData } from "../src/utils/svg-geometry";
import {
  FRAME_FONT_SCALE_MAX,
  FRAME_TEXT_MAX_LENGTH,
  frameSchema,
} from "./frame";

export const FRAME_SPEC_KIND = "qrdx.frame";
export const FRAME_SPEC_VERSION = 1;

/** Value of `frame.style` that draws `frame.spec`. */
export const CUSTOM_FRAME_STYLE = "custom";

export const FRAME_SPEC_LIMITS = {
  /** Artboard sides, in spec units */
  minArtboard: 50,
  maxArtboard: 2000,
  /** Largest absolute coordinate anywhere in a spec */
  maxCoordinate: 4000,
  /** Decimals a number may have */
  maxDecimals: 3,
  maxShapes: 64,
  maxLabels: 8,
  maxPolygonPoints: 256,
  /** Characters in one path's data */
  maxPathLength: 16_000,
  /** Segments across the spec: path commands (arcs count 4), polygon points, dashes */
  maxSegments: 2000,
  /** Gradient steps on one shape */
  maxGradientSteps: 64,
  /** Gradient work across the spec: steps × the shape's segments */
  maxGradientWork: 16_000,
  /** Size of the spec as JSON, in UTF-8 bytes */
  maxBytes: 32_768,
  /** The code must be at least this share of the artboard's shorter side */
  minQrShare: 0.5,
  /** Light padding around the code, as a share of its size */
  minPadding: 0.04,
  defaultPadding: 0.08,
  /** Characters in a label */
  maxTextLength: FRAME_TEXT_MAX_LENGTH,
} as const;

/** Built-in glyphs a spec can place with an `icon` shape (no images). */
export const FRAME_ICONS = [
  "wifi",
  "star",
  "heart",
  "phone",
  "headphones",
  "calendar",
  "user",
  "chat",
  "bag",
  "bell",
  "cup",
  "card",
  "check",
  "info",
  "home",
  "pin",
  "share",
  "download",
  "clock",
  "snowflake",
  "pumpkin",
  "tree",
  "sparkle",
  "gift",
] as const;

/**
 * Largest label font as a share of its row height, so ascenders and
 * descenders stay inside the row (and so off the code's padding).
 */
export const FRAME_SPEC_LABEL_MAX_FONT = 0.95;

/** Most segments any built-in icon has (counted against maxSegments). */
export const FRAME_ICON_MAX_SEGMENTS = 200;

/**
 * Theme colors a spec can bind to: `frame` is `frame.color`, `text` is
 * `frame.textColor`, `accent` is `frame.secondaryColor` (the gradient end)
 * and `background` is the code's background color.
 */
export const FRAME_COLOR_TOKENS = [
  "frame",
  "text",
  "accent",
  "background",
] as const;

// ── Text ───────────────────────────────────────────────────────────────────

// Controls, invisible and direction-changing characters, and lone UTF-16
// surrogates (which can't be encoded into a data URI).
const LINE_BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
const INVISIBLE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: each code point in the class is stripped on its own
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]|\udb40[\udc00-\udcff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Label text as a frame may draw it: NFC, no control, invisible or
 * bidirectional-override characters, single spaces, trimmed and at most
 * `maxLength` characters (code points).
 */
export function sanitizeFrameText(
  text: string,
  maxLength: number = FRAME_TEXT_MAX_LENGTH
): string {
  const clean = text
    .slice(0, 1000)
    .normalize("NFC")
    .replace(LINE_BREAKS, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(clean).slice(0, Math.max(0, maxLength)).join("").trim();
}

/** True when `text` uses only Latin-1 (what PDF and EPS labels can print). */
export function isLatin1Text(text: string): boolean {
  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) > 0xff) {
      return false;
    }
  }
  return true;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const hasPrecision = (value: number) =>
  Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;

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

// ── Cross-field checks ─────────────────────────────────────────────────────

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The code plus its padding: nothing may be drawn over it. */
export function frameSpecQrZone(spec: FrameSpec): Box {
  const padding = frameSpecPadding(spec);
  return {
    x0: spec.qr.x - padding,
    y0: spec.qr.y - padding,
    x1: spec.qr.x + spec.qr.size + padding,
    y1: spec.qr.y + spec.qr.size + padding,
  };
}

/** The code itself, without its padding. */
function frameSpecQrBox(spec: FrameSpec): Box {
  return {
    x0: spec.qr.x,
    y0: spec.qr.y,
    x1: spec.qr.x + spec.qr.size,
    y1: spec.qr.y + spec.qr.size,
  };
}

/** The plate's padding around the code, in spec units. */
export function frameSpecPadding(spec: FrameSpec): number {
  return spec.qr.padding ?? spec.qr.size * FRAME_SPEC_LIMITS.defaultPadding;
}

/** Font size of a text label with no `fontSize`, as a share of its row. */
export const FRAME_SPEC_DEFAULT_FONT = 0.52;

/**
 * Half the height a label's capitals fill, as a share of its font size: a
 * text label's letters are centered on its row, so they fill the row's
 * middle, this far above and below it.
 */
export const FRAME_SPEC_CAP_HALF = 0.35;

/** The largest font a text label draws (at the largest fontScale). */
function textLabelMaxFont(
  label: Extract<FrameSpecLabel, { type: "text" }>
): number {
  const base = label.fontSize ?? label.box.height * FRAME_SPEC_DEFAULT_FONT;
  return Math.min(
    base * FRAME_FONT_SCALE_MAX,
    label.box.height * FRAME_SPEC_LABEL_MAX_FONT
  );
}

const overlaps = (a: Box, b: Box) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 &&
  Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6;

// ── The plate ─────────────────────────────────────────────────────────────

type Point = [number, number];

/** Points along the plate's outline (its corners rounded by `qr.radius`). */
function plateOutline(spec: FrameSpec): Point[] {
  const zone = frameSpecQrZone(spec);
  const r = Math.min(
    spec.qr.radius ?? 0,
    (zone.x1 - zone.x0) / 2,
    (zone.y1 - zone.y0) / 2
  );
  const corners: [number, number, number][] = [
    [zone.x0 + r, zone.y0 + r, Math.PI],
    [zone.x1 - r, zone.y0 + r, -Math.PI / 2],
    [zone.x1 - r, zone.y1 - r, 0],
    [zone.x0 + r, zone.y1 - r, Math.PI / 2],
  ];
  const points: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 8; i++) {
      const angle = start + (Math.PI / 2) * (i / 8);
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  }
  return points;
}

function insideRoundedBox(
  [x, y]: Point,
  box: { x: number; y: number; width: number; height: number },
  radius: number
): boolean {
  const tolerance = 0.01;
  if (
    x < box.x - tolerance ||
    y < box.y - tolerance ||
    x > box.x + box.width + tolerance ||
    y > box.y + box.height + tolerance
  ) {
    return false;
  }
  const r = Math.min(radius, box.width / 2, box.height / 2);
  const cx = Math.min(Math.max(x, box.x + r), box.x + box.width - r);
  const cy = Math.min(Math.max(y, box.y + r), box.y + box.height - r);
  return Math.hypot(x - cx, y - cy) <= r + tolerance;
}

/** Area of a simple polygon (shoelace). */
function polygonArea(points: Point[]): number {
  let twice = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length] as Point;
    twice += x0 * y1 - x1 * y0;
  });
  return Math.abs(twice) / 2;
}

/**
 * True when `shape` may paint under the plate: anything but a `background`
 * fill, a ring whose hole holds the whole plate, or a polygon that stays
 * off it. Paths, lines, ellipses and icons count when their bounds reach
 * the plate.
 */
function paintsUnderPlate(
  shape: FrameSpecShape,
  spec: FrameSpec,
  bounds: Box
): boolean {
  const zone = frameSpecQrZone(spec);
  if (!overlaps(bounds, zone)) {
    return false;
  }
  if ("stroke" in shape && shape.stroke) {
    return true;
  }
  if (shape.fill === "background") {
    return false;
  }
  if (shape.type === "rect" && shape.hole) {
    const { hole } = shape;
    return !plateOutline(spec).every((point) =>
      insideRoundedBox(point, hole, hole.radius ?? 0)
    );
  }
  if (shape.type === "circle" && shape.hole) {
    const hole = shape.hole;
    return !plateOutline(spec).every(
      ([x, y]) => Math.hypot(x - shape.cx, y - shape.cy) <= hole + 0.01
    );
  }
  if (shape.type === "polygon") {
    const clipped = clipPolygon(shape.points as Point[], zone);
    return clipped.length > 2 && polygonArea(clipped) > 1e-6;
  }
  return true;
}

/**
 * Bounds of a spec shape (null for path data outside the grammar) and the
 * segments it counts against FRAME_SPEC_LIMITS.maxSegments.
 */
export function frameSpecShapeBounds(shape: FrameSpecShape): {
  bounds: Box | null;
  segments: number;
} {
  const outline = outlineBounds(shape);
  const stroke = "stroke" in shape ? shape.stroke : undefined;
  if (!(stroke && outline.bounds)) {
    return outline;
  }
  // Half the width outside a curve; a mitered corner reaches further (up to
  // SVG's default miter limit of 4 half widths)
  const reach =
    shape.type === "circle" || shape.type === "ellipse"
      ? stroke.width / 2
      : shape.type === "rect"
        ? (stroke.width * Math.SQRT2) / 2
        : stroke.width * 2;
  const { x0, y0, x1, y1 } = outline.bounds;
  return {
    bounds: { x0: x0 - reach, y0: y0 - reach, x1: x1 + reach, y1: y1 + reach },
    // The outline is drawn a second time, as the stroke
    segments: outline.segments * 2,
  };
}

function outlineBounds(shape: FrameSpecShape): {
  bounds: Box | null;
  segments: number;
} {
  switch (shape.type) {
    case "rect":
      return {
        bounds: {
          x0: shape.x,
          y0: shape.y,
          x1: shape.x + shape.width,
          y1: shape.y + shape.height,
        },
        segments: shape.hole ? 18 : 9,
      };
    case "circle":
      return {
        bounds: {
          x0: shape.cx - shape.r,
          y0: shape.cy - shape.r,
          x1: shape.cx + shape.r,
          y1: shape.cy + shape.r,
        },
        segments: shape.hole ? 10 : 5,
      };
    case "ellipse":
      return {
        bounds: {
          x0: shape.cx - shape.rx,
          y0: shape.cy - shape.ry,
          x1: shape.cx + shape.rx,
          y1: shape.cy + shape.ry,
        },
        segments: 5,
      };
    case "polygon": {
      const xs = shape.points.map(([x]) => x);
      const ys = shape.points.map(([, y]) => y);
      return {
        bounds: {
          x0: Math.min(...xs),
          y0: Math.min(...ys),
          x1: Math.max(...xs),
          y1: Math.max(...ys),
        },
        segments: shape.points.length,
      };
    }
    case "path": {
      const commands = tokenizePathData(shape.d, FRAME_SPEC_LIMITS.maxDecimals);
      if (!commands) {
        return { bounds: null, segments: 0 };
      }
      const bounds = segmentsBounds(parsePathData(shape.d));
      return { bounds, segments: countPathSegments(commands) };
    }
    case "line": {
      const half = shape.width / 2;
      const length = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      const dashes = shape.dash
        ? Math.ceil(length / (shape.dash[0] + shape.dash[1]))
        : 1;
      return {
        bounds: {
          x0: Math.min(shape.x1, shape.x2) - half,
          y0: Math.min(shape.y1, shape.y2) - half,
          x1: Math.max(shape.x1, shape.x2) + half,
          y1: Math.max(shape.y1, shape.y2) + half,
        },
        segments: dashes * (shape.cap === "round" ? 4 : 5),
      };
    }
    default:
      return {
        bounds: {
          x0: shape.x,
          y0: shape.y,
          x1: shape.x + shape.size,
          y1: shape.y + shape.size,
        },
        // Upper bound for the built-in icons (tests/frame-spec.test.ts)
        segments: FRAME_ICON_MAX_SEGMENTS,
      };
  }
}

function checkFrameSpec(spec: FrameSpec, ctx: z.RefinementCtx) {
  const issue = (message: string, path: (string | number)[] = []) =>
    ctx.addIssue({ code: "custom", message, path });
  const limits = FRAME_SPEC_LIMITS;

  const bytes = new TextEncoder().encode(JSON.stringify(spec)).length;
  if (bytes > limits.maxBytes) {
    issue(`The spec is ${bytes} bytes; the limit is ${limits.maxBytes}`);
    return;
  }

  const { width, height } = spec.artboard;
  const tolerance = Math.max(width, height) * 0.005;
  const artboard: Box = {
    x0: -tolerance,
    y0: -tolerance,
    x1: width + tolerance,
    y1: height + tolerance,
  };
  const inside = (box: Box) =>
    box.x0 >= artboard.x0 &&
    box.y0 >= artboard.y0 &&
    box.x1 <= artboard.x1 &&
    box.y1 <= artboard.y1;

  // The code: big enough, inside the artboard with its padding
  const { qr } = spec;
  const padding = frameSpecPadding(spec);
  if (qr.plate !== "none" && padding < qr.size * limits.minPadding - 1e-9) {
    issue(
      `qr.padding must be at least ${limits.minPadding * 100}% of qr.size`,
      ["qr", "padding"]
    );
  }
  if (qr.size < Math.min(width, height) * limits.minQrShare - 1e-9) {
    issue(
      `qr.size must be at least ${limits.minQrShare * 100}% of the artboard's shorter side`,
      ["qr", "size"]
    );
  }
  const zone = frameSpecQrZone(spec);
  if (
    zone.x0 < -1e-9 ||
    zone.y0 < -1e-9 ||
    zone.x1 > width + 1e-9 ||
    zone.y1 > height + 1e-9
  ) {
    issue("The code and its padding must sit inside the artboard", ["qr"]);
  }
  if ((qr.radius ?? 0) > (qr.size + 2 * padding) / 2) {
    issue("qr.radius is larger than half the plate", ["qr", "radius"]);
  }

  // Shapes: inside the artboard, within the segment budget
  let segments = 0;
  let gradientWork = 0;
  spec.shapes.forEach((shape, index) => {
    const path = ["shapes", index];
    const { bounds, segments: count } = frameSpecShapeBounds(shape);
    if (!bounds) {
      issue(
        "Path data must use only M L H V C S Q T A Z, plain numbers (up to 3 decimals) and start with M",
        [...path, "d"]
      );
      return;
    }
    if (!inside(bounds)) {
      issue("The shape extends outside the artboard", path);
    }
    if (shape.type === "rect" && shape.hole) {
      const { hole } = shape;
      if (
        hole.x < shape.x ||
        hole.y < shape.y ||
        hole.x + hole.width > shape.x + shape.width + 1e-9 ||
        hole.y + hole.height > shape.y + shape.height + 1e-9
      ) {
        issue("The hole must sit inside its rect", [...path, "hole"]);
      }
    }
    if (shape.type === "circle" && shape.hole && shape.hole >= shape.r) {
      issue("The hole must be smaller than the circle", [...path, "hole"]);
    }
    if (
      "stroke" in shape &&
      shape.stroke &&
      shape.stroke.width > Math.min(width, height) * 0.1 + 1e-9
    ) {
      issue("A stroke may be at most 10% of the artboard's shorter side", [
        ...path,
        "stroke",
        "width",
      ]);
    }
    if (qr.plate === "background" && paintsUnderPlate(shape, spec, bounds)) {
      issue(
        'With qr.plate "background", only background fills (or a ring whose hole holds the plate) may lie under the plate',
        path
      );
    }
    segments += count;
    if (typeof shape.fill === "object" && "gradient" in shape.fill) {
      gradientWork += (shape.fill.gradient.steps ?? 32) * count;
    }
  });
  if (segments > limits.maxSegments) {
    issue(
      `The shapes have ${segments} segments; the limit is ${limits.maxSegments}`,
      ["shapes"]
    );
  }
  if (gradientWork > limits.maxGradientWork) {
    issue("Gradient fills are too detailed (fewer steps or simpler shapes)", [
      "shapes",
    ]);
  }

  // Labels: clean text, inside the artboard, never over the code
  const bands: { y: number; height: number }[] = [];
  const ids = new Set<string>();
  const slots = new Set<string>();
  spec.labels.forEach((label, index) => {
    const path = ["labels", index];
    if (ids.has(label.id)) {
      issue(`Label id "${label.id}" is used twice`, [...path, "id"]);
    }
    ids.add(label.id);
    if (label.slot !== "fixed") {
      if (slots.has(label.slot)) {
        issue(`Only one label may use the ${label.slot} slot`, [
          ...path,
          "slot",
        ]);
      }
      slots.add(label.slot);
    }
    const maxLength = label.maxLength ?? limits.maxTextLength;
    if (label.text !== sanitizeFrameText(label.text, maxLength)) {
      issue(
        `Label text must be at most ${maxLength} characters, trimmed, with no control or invisible characters (see sanitizeFrameText)`,
        [...path, "text"]
      );
    }
    let box: Box;
    if (label.type === "text") {
      box = {
        x0: label.box.x,
        y0: label.box.y,
        x1: label.box.x + label.box.width,
        y1: label.box.y + label.box.height,
      };
      if (
        label.fontSize !== undefined &&
        label.fontSize > label.box.height * FRAME_SPEC_LABEL_MAX_FONT + 1e-9
      ) {
        issue("fontSize may be at most 95% of the label's row height", [
          ...path,
          "fontSize",
        ]);
      }
      // The row may reach into the padding, but never over the code, and
      // the band its capitals fill (at the largest font) stays off both
      const middle = label.box.y + label.box.height / 2;
      const reach = textLabelMaxFont(label) * FRAME_SPEC_CAP_HALF;
      const letters: Box = {
        x0: box.x0,
        x1: box.x1,
        y0: middle - reach,
        y1: middle + reach,
      };
      if (overlaps(box, frameSpecQrBox(spec)) || overlaps(letters, zone)) {
        issue("The label overlaps the code or its padding", [...path, "box"]);
      }
    } else {
      const { cx, cy, radius } = label.curve;
      const reach = label.fontSize * FRAME_FONT_SCALE_MAX * 0.6;
      box = {
        x0: cx - radius - reach,
        y0: cy - radius - reach,
        x1: cx + radius + reach,
        y1: cy + radius + reach,
      };
      const nearest = Math.hypot(
        Math.max(zone.x0 - cx, 0, cx - zone.x1),
        Math.max(zone.y0 - cy, 0, cy - zone.y1)
      );
      const farthest = Math.hypot(
        Math.max(Math.abs(zone.x0 - cx), Math.abs(zone.x1 - cx)),
        Math.max(Math.abs(zone.y0 - cy), Math.abs(zone.y1 - cy))
      );
      if (!(farthest <= radius - reach || nearest >= radius + reach)) {
        issue("The curved label crosses the code or its padding", [
          ...path,
          "curve",
        ]);
      }
    }
    if (!inside(box)) {
      issue("The label extends outside the artboard", path);
    }
    if (label.collapse) {
      const band = label.collapse;
      const end = band.y + band.height;
      if (band.y < -1e-9 || end > height + 1e-9) {
        issue("The collapse band must sit inside the artboard", [
          ...path,
          "collapse",
        ]);
      }
      if (end > zone.y0 + 1e-6 && band.y < zone.y1 - 1e-6) {
        issue("The collapse band crosses the code or its padding", [
          ...path,
          "collapse",
        ]);
      }
      for (const other of bands) {
        if (end > other.y + 1e-6 && band.y < other.y + other.height - 1e-6) {
          issue("Collapse bands may not overlap", [...path, "collapse"]);
        }
      }
      bands.push(band);
    }
  });
}

/**
 * Zod schema for a frame spec, with every limit and cross-field check
 * (FRAME_SPEC_LIMITS). Validate specs from users with this before storing
 * them; the engine validates again before drawing.
 */
export const frameSpecSchema =
  frameSpecObjectSchema.superRefine(checkFrameSpec);

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
