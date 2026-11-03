/** biome-ignore-all lint/style/noMagicNumbers: frame geometry */
// Draws a frame spec (types/frame-spec.ts): validates it, scales it to the
// code's size and compiles every shape and label into the same FrameLayout
// the built-in frames produce, so SVG, canvas, PDF and EPS draw it with the
// existing code and stay identical. Path data is re-written from the
// numbers it was read as, never passed through.
import type { ColorConfig } from "../types/color";
import { FRAME_FONT_SCALE_MAX, FRAME_FONT_SCALE_MIN } from "../types/frame";
import {
  FRAME_SPEC_LABEL_MAX_FONT,
  FRAME_SPEC_LIMITS,
  type FrameSpec,
  type FrameSpecColor,
  type FrameSpecLabel,
  type FrameSpecPaint,
  type FrameSpecShape,
  frameSpecPadding,
  frameSpecSchema,
  type QRCustomFrame,
  sanitizeFrameText,
} from "../types/frame-spec";
import { DEFAULT_BGCOLOR } from "./constants";
import type { FrameLabel, FrameLayout, FrameShape } from "./frame";
import { FRAME_ICON_BOX, getFrameIconPath } from "./frame-icons";
import { arcLabels, estimateTextEm, mixFrameColors } from "./frame-styles";
import { circlePath } from "./shapes";
import { getSolidColor } from "./utils/color";
import { fmt } from "./utils/fmt";
import { parseColor } from "./utils/parse-color";
import { tokenizePathData, writePathData } from "./utils/path-data";
import {
  clipPolygon,
  flattenSegments,
  type Point,
  polygonsToPath,
} from "./utils/polygon-clip";
import {
  parsePathData,
  rectSegments,
  type Segment,
} from "./utils/svg-geometry";

/** Thrown when a custom frame's spec doesn't validate. */
export class FrameSpecError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid frame spec: ${issues.slice(0, 5).join("; ")}`);
    this.name = "FrameSpecError";
    this.issues = issues;
  }
}

// Specs are validated once per object: treat a spec as immutable once drawn.
const validated = new WeakMap<object, FrameSpec>();

/**
 * Validates `spec` with `frameSpecSchema` (every limit applies) and returns
 * the parsed copy. Throws a `FrameSpecError` listing the problems.
 */
export function resolveFrameSpec(spec: unknown): FrameSpec {
  if (spec && typeof spec === "object") {
    const cached = validated.get(spec);
    if (cached) {
      return cached;
    }
  }
  if (spec === undefined || spec === null) {
    throw new FrameSpecError(['A "custom" frame needs a spec']);
  }
  const result = frameSpecSchema.safeParse(spec);
  if (!result.success) {
    throw new FrameSpecError(
      result.error.issues.map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message
      )
    );
  }
  if (typeof spec === "object") {
    validated.set(spec, result.data);
  }
  return result.data;
}

/** Light gap around the code as a share of its width (the plate's padding). */
export function getFrameSpecGapRatio(spec: unknown): number {
  const valid = resolveFrameSpec(spec);
  return frameSpecPadding(valid) / valid.qr.size;
}

type Resolve = (color: FrameSpecColor) => string;

/**
 * The plate under the code is always opaque: the code's background, or
 * white when that is transparent, so artwork never shows through the quiet
 * zone. `background` in a spec means the same color.
 */
function opaqueBackground(bgColor: ColorConfig | undefined): string {
  const background = getSolidColor(bgColor, DEFAULT_BGCOLOR);
  const parsed = parseColor(background);
  return parsed && parsed.a >= 1 ? background : DEFAULT_BGCOLOR;
}

function colorResolver(
  frame: QRCustomFrame,
  spec: FrameSpec,
  background: string
): Resolve {
  const frameColor = frame.color || spec.colors.frame;
  const text = frame.textColor || spec.colors.text || frameColor;
  const accent = frame.secondaryColor || spec.colors.accent || frameColor;
  const base = (ref: string): string => {
    switch (ref) {
      case "frame":
        return frameColor;
      case "text":
        return text;
      case "accent":
        return accent;
      case "background":
        return background;
      default:
        return ref;
    }
  };
  return (color) =>
    typeof color === "string"
      ? base(color)
      : mixFrameColors(base(color.mix[0]), base(color.mix[1]), color.amount);
}

// ── Shapes ─────────────────────────────────────────────────────────────────

/** A compiled shape before its paint is applied. */
type Outline =
  | Omit<Extract<FrameShape, { type: "rect" }>, "fill">
  | Omit<Extract<FrameShape, { type: "polygon" }>, "fill">
  | Omit<Extract<FrameShape, { type: "path" }>, "fill">;

function scaledPath(d: string, scale: number, dx = 0, dy = 0): string {
  const commands = tokenizePathData(d);
  // Validated by the schema (paths) or built in (icons)
  return commands ? writePathData(commands, scale, dx, dy) : "";
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx + rx)} ${fmt(cy)}` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx - rx)} ${fmt(cy)}Z`
  );
}

function linePath(
  shape: Extract<FrameSpecShape, { type: "line" }>,
  k: number
): Outline {
  const [x1, y1, x2, y2] = [
    shape.x1 * k,
    shape.y1 * k,
    shape.x2 * k,
    shape.y2 * k,
  ];
  const length = Math.hypot(x2 - x1, y2 - y1);
  const half = (shape.width * k) / 2;
  const ux = length > 0 ? (x2 - x1) / length : 1;
  const uy = length > 0 ? (y2 - y1) / length : 0;
  // Normal, to the right of the direction of travel
  const nx = -uy * half;
  const ny = ux * half;
  const piece = (from: number, to: number) => {
    const a: Point = [x1 + ux * from, y1 + uy * from];
    const b: Point = [x1 + ux * to, y1 + uy * to];
    if (shape.cap === "round" && to - from > 2 * half) {
      const a2: Point = [a[0] + ux * half, a[1] + uy * half];
      const b2: Point = [b[0] - ux * half, b[1] - uy * half];
      return (
        `M${fmt(a2[0] - nx)} ${fmt(a2[1] - ny)}L${fmt(b2[0] - nx)} ${fmt(b2[1] - ny)}` +
        `A${fmt(half)} ${fmt(half)} 0 0 1 ${fmt(b2[0] + nx)} ${fmt(b2[1] + ny)}` +
        `L${fmt(a2[0] + nx)} ${fmt(a2[1] + ny)}` +
        `A${fmt(half)} ${fmt(half)} 0 0 1 ${fmt(a2[0] - nx)} ${fmt(a2[1] - ny)}Z`
      );
    }
    return (
      `M${fmt(a[0] - nx)} ${fmt(a[1] - ny)}L${fmt(b[0] - nx)} ${fmt(b[1] - ny)}` +
      `L${fmt(b[0] + nx)} ${fmt(b[1] + ny)}L${fmt(a[0] + nx)} ${fmt(a[1] + ny)}Z`
    );
  };
  if (!shape.dash) {
    return { type: "path", d: piece(0, length), fillRule: "nonzero" };
  }
  // Whole dashes only, from the start; a remainder shorter than a dash is
  // left empty.
  const on = shape.dash[0] * k;
  const period = on + shape.dash[1] * k;
  const parts: string[] = [];
  for (let from = 0; from + on <= length + 1e-6; from += period) {
    parts.push(piece(from, from + on));
  }
  return { type: "path", d: parts.join(""), fillRule: "nonzero" };
}

function outlineOf(shape: FrameSpecShape, k: number): Outline {
  switch (shape.type) {
    case "rect":
      return {
        type: "rect",
        x: shape.x * k,
        y: shape.y * k,
        width: shape.width * k,
        height: shape.height * k,
        radius: (shape.radius ?? 0) * k,
        ...(shape.hole && {
          hole: {
            x: shape.hole.x * k,
            y: shape.hole.y * k,
            width: shape.hole.width * k,
            height: shape.hole.height * k,
            radius: (shape.hole.radius ?? 0) * k,
          },
        }),
      };
    case "circle":
      return {
        type: "path",
        d:
          circlePath(shape.cx * k, shape.cy * k, shape.r * k) +
          (shape.hole
            ? circlePath(shape.cx * k, shape.cy * k, shape.hole * k)
            : ""),
        fillRule: shape.hole ? "evenodd" : "nonzero",
      };
    case "ellipse":
      return {
        type: "path",
        d: ellipsePath(shape.cx * k, shape.cy * k, shape.rx * k, shape.ry * k),
        fillRule: "nonzero",
      };
    case "polygon":
      return {
        type: "polygon",
        points: shape.points.map(([x, y]): Point => [x * k, y * k]),
      };
    case "path":
      return {
        type: "path",
        d: scaledPath(shape.d, k),
        fillRule: shape.fillRule ?? "nonzero",
      };
    case "line":
      return linePath(shape, k);
    default: {
      const icon = getFrameIconPath(shape.icon);
      return {
        type: "path",
        d: scaledPath(
          icon.d,
          (shape.size * k) / FRAME_ICON_BOX,
          shape.x * k,
          shape.y * k
        ),
        fillRule: icon.fillRule,
      };
    }
  }
}

function outlineSegments(outline: Outline): Segment[] {
  if (outline.type === "rect") {
    const { x, y, width, height, radius, hole } = outline;
    return [
      ...rectSegments(x, y, width, height, radius, radius),
      ...(hole
        ? rectSegments(
            hole.x,
            hole.y,
            hole.width,
            hole.height,
            hole.radius,
            hole.radius
          )
        : []),
    ];
  }
  if (outline.type === "polygon") {
    return [
      ...outline.points.map(
        ([x, y], index): Segment =>
          index === 0 ? { op: "M", x, y } : { op: "L", x, y }
      ),
      { op: "Z" },
    ];
  }
  return parsePathData(outline.d);
}

/**
 * A gradient as solid color steps: the outline is cut into strips across
 * the gradient's direction, each filled with the color at its middle.
 */
function gradientSteps(
  outline: Outline,
  gradient: Extract<FrameSpecPaint, { gradient: unknown }>["gradient"],
  resolve: Resolve
): FrameShape[] {
  const segments = outlineSegments(outline);
  const polygons = flattenSegments(segments, 0.2);
  const fillRule =
    outline.type === "rect"
      ? outline.hole
        ? "evenodd"
        : "nonzero"
      : outline.type === "path"
        ? (outline.fillRule ?? "nonzero")
        : "nonzero";
  const vertical = gradient.direction === "vertical";
  const along = (p: Point) => (vertical ? p[1] : p[0]);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const point of polygon) {
      min = Math.min(min, along(point));
      max = Math.max(max, along(point));
    }
  }
  if (!(max > min)) {
    return [];
  }
  const steps = gradient.steps ?? 32;
  const from = resolve(gradient.from);
  const to = resolve(gradient.to);
  const span = max - min;
  // Neighbours overlap slightly so no anti-aliasing seam shows
  const overlap = span * 0.002;
  const shapes: FrameShape[] = [];
  for (let i = 0; i < steps; i++) {
    const a = min + (span * i) / steps;
    const b = Math.min(
      max,
      min + (span * (i + 1)) / steps + (i + 1 < steps ? overlap : 0)
    );
    const box = vertical
      ? {
          x0: Number.NEGATIVE_INFINITY,
          x1: Number.POSITIVE_INFINITY,
          y0: a,
          y1: b,
        }
      : {
          x0: a,
          x1: b,
          y0: Number.NEGATIVE_INFINITY,
          y1: Number.POSITIVE_INFINITY,
        };
    const pieces = polygons
      .map((polygon) => clipPolygon(polygon, box))
      .filter((polygon) => polygon.length > 2);
    if (pieces.length === 0) {
      continue;
    }
    shapes.push({
      type: "path",
      d: polygonsToPath(pieces),
      fill: mixFrameColors(from, to, (i + 0.5) / steps),
      fillRule,
    });
  }
  return shapes;
}

function compileShape(
  shape: FrameSpecShape,
  k: number,
  resolve: Resolve
): FrameShape[] {
  const outline = outlineOf(shape, k);
  if (typeof shape.fill === "object" && "gradient" in shape.fill) {
    return gradientSteps(outline, shape.fill.gradient, resolve);
  }
  return [{ ...outline, fill: resolve(shape.fill) } as FrameShape];
}

// ── Labels ─────────────────────────────────────────────────────────────────

function labelText(label: FrameSpecLabel, frame: QRCustomFrame): string {
  const maxLength = Math.min(
    label.maxLength ?? FRAME_SPEC_LIMITS.maxTextLength,
    FRAME_SPEC_LIMITS.maxTextLength
  );
  const source =
    label.slot === "primary"
      ? (frame.text ?? label.text)
      : label.slot === "secondary"
        ? (frame.secondaryText ?? label.text)
        : label.text;
  return sanitizeFrameText(source, maxLength);
}

function clampFontScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) {
    return 1;
  }
  return Math.min(FRAME_FONT_SCALE_MAX, Math.max(FRAME_FONT_SCALE_MIN, scale));
}

function compileLabel(
  label: FrameSpecLabel,
  frame: QRCustomFrame,
  k: number,
  resolve: Resolve
): FrameLabel[] {
  const text = labelText(label, frame);
  if (!text) {
    return [];
  }
  const fontScale = clampFontScale(frame.fontScale);
  const color = resolve(label.color);
  const weight = label.weight === "regular" ? { fontWeight: 400 } : {};
  if (label.type === "curved") {
    const { cx, cy, radius, side, spread = 140 } = label.curve;
    const arc = radius * k * ((spread * Math.PI) / 180);
    const fontSize = Math.min(
      label.fontSize * k * fontScale,
      arc / (estimateTextEm(text) + 0.08 * text.length)
    );
    return arcLabels(
      text,
      cx * k,
      cy * k,
      radius * k,
      fontSize,
      side,
      color
    ).map((letter) => ({ ...letter, ...weight }));
  }
  const x = label.box.x * k;
  const y = label.box.y * k;
  const width = label.box.width * k;
  const height = label.box.height * k;
  const base = (label.fontSize ?? label.box.height * 0.52) * k;
  // At most 95% of the row, so the glyphs stay inside it
  const fontSize = Math.min(
    base * fontScale,
    height * FRAME_SPEC_LABEL_MAX_FONT,
    width / estimateTextEm(text)
  );
  const align = label.align ?? "middle";
  return [
    {
      text,
      x: align === "start" ? x : align === "end" ? x + width : x + width / 2,
      // Cap height of a sans-serif is ~0.7em, so this centers capitals.
      y: y + height / 2 + fontSize * 0.35,
      fontSize,
      maxWidth: width,
      color,
      ...(align !== "middle" && { align }),
      ...weight,
    },
  ];
}

// ── Layout ─────────────────────────────────────────────────────────────────

/**
 * Layout of a custom frame for a code of `size` pixels: the spec scaled so
 * its QR box is `size` wide, colors resolved from the frame options (then
 * the spec's defaults), labels filled from `text` / `secondaryText`.
 * Throws a `FrameSpecError` when the spec is invalid.
 */
export function getCustomFrameLayout(
  size: number,
  frame: QRCustomFrame,
  bgColor?: ColorConfig
): FrameLayout {
  const spec = resolveFrameSpec(frame.spec);
  const k = size / spec.qr.size;
  const background = opaqueBackground(bgColor);
  const resolve = colorResolver(frame, spec, background);

  const shapes = spec.shapes.flatMap((shape) =>
    compileShape(shape, k, resolve)
  );
  // The plate: last behind the code, so nothing shows in its quiet zone
  const padding = frameSpecPadding(spec) * k;
  shapes.push({
    type: "rect",
    x: spec.qr.x * k - padding,
    y: spec.qr.y * k - padding,
    width: size + 2 * padding,
    height: size + 2 * padding,
    radius: (spec.qr.radius ?? 0) * k,
    fill: background,
  });

  const labels = spec.labels.flatMap((label) =>
    compileLabel(label, frame, k, resolve)
  );
  const first = labels[0];
  const main = first && first.rotate === undefined ? first : null;
  const bleed = spec.bleed ?? "none";

  return {
    width: spec.artboard.width * k,
    height: spec.artboard.height * k,
    qrX: spec.qr.x * k,
    qrY: spec.qr.y * k,
    qrSize: size,
    shapes,
    label: main,
    extraLabels: main ? labels.slice(1) : labels,
    squareEdges: bleed !== "none",
    color: resolve(bleed === "none" ? "frame" : bleed),
  };
}
