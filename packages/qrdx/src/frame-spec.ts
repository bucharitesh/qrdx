/** biome-ignore-all lint/style/noMagicNumbers: frame geometry */
// Draws a frame spec (types/frame-spec.ts): validates it, scales it to the
// code's size and compiles every shape and label into a FrameLayout, which
// SVG, canvas, PDF and EPS all draw with the same code. Every frame is a
// spec: custom frames carry theirs, and the built-in styles are specs too
// (src/frames/builtin). Path data is re-written from the numbers it was
// read as, never passed through.
import type { ColorConfig } from "../types/color";
import { FRAME_FONT_SCALE_MAX, FRAME_FONT_SCALE_MIN } from "../types/constants";
import type { QRFrame } from "../types/frame";
import type {
  FrameSpec,
  FrameSpecColor,
  FrameSpecLabel,
  FrameSpecPaint,
  FrameSpecShape,
  QRCustomFrame,
} from "../types/frame-spec";
import { frameSpecIssueText, parseFrameSpec } from "../types/frame-spec-parse";
import {
  FRAME_SPEC_DEFAULT_FONT,
  FRAME_SPEC_LABEL_MAX_FONT,
  FRAME_SPEC_LIMITS,
  frameSpecPadding,
  frameSpecShapeBounds,
  sanitizeFrameText,
} from "../types/frame-spec-rules";
import { DEFAULT_BGCOLOR } from "./constants";
import type { FrameLabel, FrameLayout, FrameShape } from "./frame";
import { FRAME_ICON_BOX, getFrameIconPath } from "./frame-icons";
import { arcLabels, estimateTextEm, mixFrameColors } from "./frame-text";
import { circlePath } from "./shapes";
import { getSolidColor } from "./utils/color";
import { fmt } from "./utils/fmt";
import { parseColor } from "./utils/parse-color";
import {
  type PathCommand,
  tokenizePathData,
  writePathData,
} from "./utils/path-data";
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
 * Validates `spec` as `frameSpecSchema` does (every limit applies, the same
 * problems reported, without loading zod) and returns the parsed copy.
 * Throws a `FrameSpecError` listing the problems.
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
  const result = parseFrameSpec(spec);
  if (!result.success) {
    throw new FrameSpecError(result.issues.map(frameSpecIssueText));
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

/** The options a frame spec reads: its labels' text, colors and size. */
export type FrameSpecOptions = Pick<
  QRFrame,
  | "text"
  | "secondaryText"
  | "color"
  | "textColor"
  | "secondaryColor"
  | "fontScale"
>;

const isOpaque = (color: string) => {
  const parsed = parseColor(color);
  return Boolean(parsed && parsed.a >= 1);
};

/**
 * What `background` means in a spec: the code's background as a solid
 * color. The plate under the code is opaque, so artwork never shows through
 * the quiet zone: a see-through background becomes white, unless the spec
 * sets `qr.plate: "background"` (nothing of its own lies under the code),
 * which keeps it see-through as the code draws it.
 */
function specBackground(
  spec: FrameSpec,
  bgColor: ColorConfig | undefined
): { color: string; plate: boolean } {
  const background = getSolidColor(bgColor, DEFAULT_BGCOLOR);
  if (spec.qr.plate === "none") {
    // No plate: the code's own background and margin are its light space
    return { color: background, plate: false };
  }
  if (isOpaque(background)) {
    return { color: background, plate: true };
  }
  return spec.qr.plate === "background"
    ? { color: background, plate: false }
    : { color: DEFAULT_BGCOLOR, plate: true };
}

/** The frame, text and accent colors a spec paints with for `frame`. */
export function getFrameSpecColors(
  spec: FrameSpec,
  frame: FrameSpecOptions,
  background: string = DEFAULT_BGCOLOR
): { frame: string; text: string; accent: string } {
  const frameColor = frame.color || spec.colors.frame;
  const accent = frame.secondaryColor || spec.colors.accent || frameColor;
  const base = (ref: string): string =>
    ref === "frame"
      ? frameColor
      : ref === "accent"
        ? accent
        : ref === "background"
          ? background
          : ref;
  const fallback = spec.colors.text;
  const text =
    frame.textColor ||
    (fallback === undefined
      ? frameColor
      : typeof fallback === "string"
        ? fallback
        : mixFrameColors(
            base(fallback.mix[0]),
            base(fallback.mix[1]),
            fallback.amount
          ));
  return { frame: frameColor, text, accent };
}

function colorResolver(
  frame: FrameSpecOptions,
  spec: FrameSpec,
  background: string
): Resolve {
  const colors = getFrameSpecColors(spec, frame, background);
  const base = (ref: string): string => {
    switch (ref) {
      case "frame":
        return colors.frame;
      case "text":
        return colors.text;
      case "accent":
        return colors.accent;
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
  const stroke =
    "stroke" in shape && shape.stroke
      ? {
          stroke: resolve(shape.stroke.color),
          strokeWidth: shape.stroke.width * k,
        }
      : undefined;
  if (typeof shape.fill === "object" && "gradient" in shape.fill) {
    const steps = gradientSteps(outline, shape.fill.gradient, resolve);
    // The outline goes over the steps, drawn once along the whole shape
    return stroke
      ? [...steps, { ...outline, fill: "none", ...stroke } as FrameShape]
      : steps;
  }
  return [{ ...outline, fill: resolve(shape.fill), ...stroke } as FrameShape];
}

// ── Labels ─────────────────────────────────────────────────────────────────

function labelText(label: FrameSpecLabel, frame: FrameSpecOptions): string {
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
  text: string,
  fontScale: number,
  k: number,
  resolve: Resolve,
  field: string
): FrameLabel[] {
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
      color,
      field
    ).map((letter) => ({ ...letter, ...weight }));
  }
  const x = label.box.x * k;
  const y = label.box.y * k;
  const width = label.box.width * k;
  const height = label.box.height * k;
  if (!(height > 0)) {
    return [];
  }
  const base =
    (label.fontSize ?? label.box.height * FRAME_SPEC_DEFAULT_FONT) * k;
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
      field,
    },
  ];
}

// ── Collapsing labels ──────────────────────────────────────────────────────

interface Band {
  y: number;
  height: number;
}

/** Path commands made absolute (so each y can move on its own). */
function absoluteCommands(commands: PathCommand[]): PathCommand[] {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  return commands.map(({ command, values }) => {
    const upper = command.toUpperCase();
    const relative = command !== upper;
    switch (upper) {
      case "Z":
        x = startX;
        y = startY;
        return { command: "Z", values: [] };
      case "H":
        x = (relative ? x : 0) + (values[0] as number);
        return { command: "H", values: [x] };
      case "V":
        y = (relative ? y : 0) + (values[0] as number);
        return { command: "V", values: [y] };
      case "A": {
        x = (relative ? x : 0) + (values[5] as number);
        y = (relative ? y : 0) + (values[6] as number);
        return { command: "A", values: [...values.slice(0, 5), x, y] };
      }
      default: {
        const out = values.map((value, i) =>
          relative ? value + (i % 2 === 0 ? x : y) : value
        );
        x = out.at(-2) as number;
        y = out.at(-1) as number;
        if (upper === "M") {
          startX = x;
          startY = y;
        }
        return { command: upper, values: out };
      }
    }
  });
}

function collapsePath(d: string, mapY: (y: number) => number): string {
  const commands = tokenizePathData(d);
  if (!commands) {
    return d;
  }
  return writePathData(
    absoluteCommands(commands).map(({ command, values }) => {
      if (command === "V") {
        return { command, values: [mapY(values[0] as number)] };
      }
      if (command === "H" || command === "Z") {
        return { command, values };
      }
      if (command === "A") {
        return {
          command,
          values: [...values.slice(0, 6), mapY(values[6] as number)],
        };
      }
      return {
        command,
        values: values.map((value, i) => (i % 2 === 1 ? mapY(value) : value)),
      };
    })
  );
}

function collapseShape(
  shape: FrameSpecShape,
  mapY: (y: number) => number
): FrameSpecShape {
  const span = (y: number, height: number) => {
    const top = mapY(y);
    return { y: top, height: mapY(y + height) - top };
  };
  switch (shape.type) {
    case "rect":
      return {
        ...shape,
        ...span(shape.y, shape.height),
        ...(shape.hole && {
          hole: { ...shape.hole, ...span(shape.hole.y, shape.hole.height) },
        }),
      };
    case "circle":
    case "ellipse":
      return { ...shape, cy: mapY(shape.cy) };
    case "polygon":
      return {
        ...shape,
        points: shape.points.map(([x, y]): [number, number] => [x, mapY(y)]),
      };
    case "path":
      return { ...shape, d: collapsePath(shape.d, mapY) };
    case "line":
      return { ...shape, y1: mapY(shape.y1), y2: mapY(shape.y2) };
    default:
      return { ...shape, y: mapY(shape.y) };
  }
}

/**
 * The spec with `bands` cut out: rows below a band move up by its height,
 * shapes wholly inside a band are left out and the artboard gets shorter.
 */
function collapseSpec(spec: FrameSpec, bands: Band[]): FrameSpec {
  if (bands.length === 0) {
    return spec;
  }
  const mapY = (y: number) => {
    let out = y;
    for (const band of bands) {
      out -= Math.min(Math.max(y - band.y, 0), band.height);
    }
    return out;
  };
  const inBand = (y0: number, y1: number) =>
    bands.some(
      (band) => y0 >= band.y - 1e-6 && y1 <= band.y + band.height + 1e-6
    );
  return {
    ...spec,
    artboard: { ...spec.artboard, height: mapY(spec.artboard.height) },
    qr: { ...spec.qr, y: mapY(spec.qr.y) },
    shapes: spec.shapes
      .filter((shape) => {
        const { bounds } = frameSpecShapeBounds(shape);
        return !(bounds && inBand(bounds.y0, bounds.y1));
      })
      .map((shape) => collapseShape(shape, mapY)),
    labels: spec.labels.map((label) => {
      if (label.type === "curved") {
        return {
          ...label,
          curve: { ...label.curve, cy: mapY(label.curve.cy) },
        };
      }
      const top = mapY(label.box.y);
      return {
        ...label,
        box: {
          ...label.box,
          y: top,
          height: mapY(label.box.y + label.box.height) - top,
        },
      };
    }),
  };
}

// ── Layout ─────────────────────────────────────────────────────────────────

/** What a frame's primary and secondary labels edit (FrameLabel.field). */
export type FrameSlotFields = Partial<Record<"primary" | "secondary", string>>;

/**
 * Layout of a valid `spec` (see resolveFrameSpec) for a code of `size`
 * pixels: the spec scaled so its QR box is `size` wide, colors resolved
 * from the frame options (then the spec's defaults), labels filled from
 * `text` / `secondaryText`, and the bands of empty labels cut out. Each
 * label's field is its id, or `slotFields` for the primary and secondary
 * slots.
 */
export function frameSpecLayout(
  size: number,
  valid: FrameSpec,
  frame: FrameSpecOptions,
  bgColor?: ColorConfig,
  slotFields: FrameSlotFields = {}
): FrameLayout {
  const texts = new Map(
    valid.labels.map((label) => [label.id, labelText(label, frame)])
  );
  const spec = collapseSpec(
    valid,
    valid.labels.flatMap((label) =>
      label.collapse && !texts.get(label.id) ? [label.collapse] : []
    )
  );
  const k = size / spec.qr.size;
  const background = specBackground(spec, bgColor);
  const resolve = colorResolver(frame, spec, background.color);

  const shapes = spec.shapes.flatMap((shape) =>
    compileShape(shape, k, resolve)
  );
  // The plate: last behind the code, so nothing shows in its quiet zone
  if (background.plate) {
    const padding = frameSpecPadding(spec) * k;
    shapes.push({
      type: "rect",
      x: spec.qr.x * k - padding,
      y: spec.qr.y * k - padding,
      width: size + 2 * padding,
      height: size + 2 * padding,
      radius: (spec.qr.radius ?? 0) * k,
      fill: background.color,
    });
  }

  const fontScale = clampFontScale(frame.fontScale);
  const labels = spec.labels.flatMap((label) => {
    const text = texts.get(label.id);
    if (!text) {
      return [];
    }
    const field =
      (label.slot === "fixed" ? undefined : slotFields[label.slot]) ?? label.id;
    return compileLabel(label, text, fontScale, k, resolve, field);
  });
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

/**
 * Layout of a custom frame for a code of `size` pixels (see
 * frameSpecLayout). Throws a `FrameSpecError` when the spec is invalid.
 */
export function getCustomFrameLayout(
  size: number,
  frame: QRCustomFrame,
  bgColor?: ColorConfig
): FrameLayout {
  return frameSpecLayout(size, resolveFrameSpec(frame.spec), frame, bgColor);
}
