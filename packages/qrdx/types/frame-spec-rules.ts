/** biome-ignore-all lint/style/noMagicNumbers: spec limits */
// The rules of a frame spec that don't need zod: its limits, the text a
// label may show, its geometry and the checks across fields. The engine
// validates and draws specs with these and frame-spec-parse.ts, so drawing
// a frame never loads zod; frame-spec.ts builds frameSpecSchema (zod) on
// the same rules and re-exports them.

import { countPathSegments, tokenizePathData } from "../src/utils/path-data";
import { clipPolygon, segmentsBounds } from "../src/utils/polygon-clip";
import { parsePathData } from "../src/utils/svg-geometry";
import { FRAME_FONT_SCALE_MAX, FRAME_TEXT_MAX_LENGTH } from "./constants";
import type { FrameSpec, FrameSpecLabel, FrameSpecShape } from "./frame-spec";

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

/** True when `value` has at most FRAME_SPEC_LIMITS.maxDecimals decimals. */
export const hasPrecision = (value: number) =>
  Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;

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

/**
 * The checks across fields that a frame spec's structure can't express:
 * size, placement, overlaps and budgets. Reports each problem through
 * `issue`; both frameSpecSchema (zod) and the engine's own parser
 * (frame-spec-parse.ts) run it on a structurally valid spec.
 */
export function checkFrameSpec(
  spec: FrameSpec,
  issue: (message: string, path?: (string | number)[]) => void
): void {
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
