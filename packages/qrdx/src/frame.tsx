/** @jsxImportSource ./jsx */
/** biome-ignore-all lint/style/noMagicNumbers: frame proportions */
import type { ColorConfig } from "../types";
import { DEFAULT_FRAME_TEXT, FRAME_TEXT_MAX_LENGTH } from "../types/constants";
import type { AnyQRFrame } from "../types/frame-spec";
import { CUSTOM_FRAME_STYLE } from "../types/frame-spec-rules";
import { getCustomFrameLayout, getFrameSpecGapRatio } from "./frame-spec";
import { frameSpecOf, getBuiltInFrameLayout } from "./frames/builtin";
import { cloneElement, type QRNode } from "./jsx/runtime";
import { compact, roundTo } from "./utils/fmt";

/** System font stack for frame labels, so rendering never fetches a font. */
export const FRAME_FONT_FAMILY =
  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

/**
 * Light gap the classic frames keep between the code and the frame, as a
 * share of the code width. Kept for compatibility: each frame's own gap is
 * its spec's plate padding (getFrameGapRatio).
 */
export const FRAME_GAP_RATIO = 0.08;

export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * An outline along a shape's edge (centered on it, mitered corners), drawn
 * after its fill. `fill` may be "none" for an outline alone.
 */
export interface FrameStroke {
  stroke?: string;
  strokeWidth?: number;
}

export interface FrameRect extends FrameBox, FrameStroke {
  type: "rect";
  fill: string;
  /** Area cut out of the rect (where the QR code shows through) */
  hole?: FrameBox;
}

export interface FramePolygon extends FrameStroke {
  type: "polygon";
  points: [number, number][];
  fill: string;
}

/** Any outline, as SVG path data in artwork coordinates. */
export interface FramePath extends FrameStroke {
  type: "path";
  d: string;
  fill: string;
  /** "evenodd" turns inner subpaths into holes */
  fillRule?: "nonzero" | "evenodd";
}

export type FrameShape = FrameRect | FramePolygon | FramePath;

export interface FrameLabel {
  text: string;
  /** Horizontal center of the label (its left or right end with `align`) */
  x: number;
  /** Alphabetic baseline of the label */
  y: number;
  fontSize: number;
  /** Width the label must fit in */
  maxWidth: number;
  color: string;
  /** Clockwise rotation in degrees around (x, y), for text set on a curve */
  rotate?: number;
  /** Which end of the text `x` is (default "middle") */
  align?: "start" | "middle" | "end";
  /** CSS font weight (default 700); PDF and EPS draw 600+ as bold */
  fontWeight?: number;
  /**
   * The frame text this label draws: "text", "secondaryText", or a custom
   * spec's label id. Every letter of curved text carries its label's field.
   * Editors find a label by it (see `frameLabelMarkers`).
   */
  field?: string;
}

/** Attribute that marks frame labels in SVG drawn with `frameLabelMarkers`. */
export const FRAME_LABEL_ATTRIBUTE = "data-qrdx-frame-label";

export interface FrameLayout {
  /** Full artwork width (frame included) */
  width: number;
  /** Full artwork height (frame included) */
  height: number;
  /** Where the QR code (with its own margin) sits inside the artwork */
  qrX: number;
  qrY: number;
  qrSize: number;
  /** Shapes painted behind the QR code, in order */
  shapes: FrameShape[];
  label: FrameLabel | null;
  /** Further labels (a second line, or the letters of curved text) */
  extraLabels?: FrameLabel[];
  /** True when the frame fills its whole bounding box (no rounded corners) */
  squareEdges: boolean;
  /** Frame color, for print bleed */
  color: string;
}

/**
 * True when `frame` draws something. A "custom" frame counts even when its
 * spec is invalid: drawing it then throws a FrameSpecError instead of
 * leaving the frame out silently.
 */
export function isFrameActive(
  frame: AnyQRFrame | null | undefined
): frame is AnyQRFrame {
  return Boolean(frame?.style && frame.style !== "none");
}

/**
 * Light gap the frame keeps around the code, as a share of the code width:
 * the plate padding of the spec it draws (a built-in style's or its own).
 */
export function getFrameGapRatio(frame: AnyQRFrame): number {
  const spec = frameSpecOf(frame);
  return spec ? getFrameSpecGapRatio(spec) : FRAME_GAP_RATIO;
}

/** The label a frame renders: trimmed and capped at 24 characters. */
export function getFrameText(frame: AnyQRFrame): string {
  return (frame.text ?? DEFAULT_FRAME_TEXT)
    .trim()
    .slice(0, FRAME_TEXT_MAX_LENGTH);
}

/** The second label (no default), trimmed and capped at 24 characters. */
export function getFrameSecondaryText(frame: AnyQRFrame): string {
  return (frame.secondaryText ?? "").trim().slice(0, FRAME_TEXT_MAX_LENGTH);
}

/**
 * Computes where the frame shapes, labels and QR code go for a code of
 * `size` pixels. The QR code keeps its full size; the frame is added around
 * it. Every frame is drawn from a frame spec: a "custom" frame's own (throws
 * a FrameSpecError when it is invalid), or the built-in style's
 * (src/frames/builtin).
 */
export function getFrameLayout(
  size: number,
  frame: AnyQRFrame,
  bgColor?: ColorConfig
): FrameLayout {
  if (frame.style === CUSTOM_FRAME_STYLE) {
    return getCustomFrameLayout(size, frame, bgColor);
  }
  return getBuiltInFrameLayout(size, frame, bgColor);
}

/**
 * Output dimensions for a code of `size` pixels with `frame` applied
 * (`size × size` when there is no frame).
 */
export function getFrameDimensions(
  size: number,
  frame?: AnyQRFrame | null
): { width: number; height: number } {
  if (!isFrameActive(frame)) {
    return { width: size, height: size };
  }
  const { width, height } = getFrameLayout(size, frame);
  return { width, height };
}

// Frame boxes, labels and the code's offset snap to 0.01 px
const round = (value: number) => roundTo(value, 2);

function boxPath({ x, y, width, height, radius }: FrameBox): string {
  const r = round(Math.min(radius, width / 2, height / 2));
  const [x0, y0, w, h] = [round(x), round(y), round(width), round(height)];
  if (r <= 0) {
    return compact`M${x0} ${y0}h${w}v${h}h${-w}z`;
  }
  return (
    compact`M${x0 + r} ${y0}h${round(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}` +
    compact`v${round(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
    compact`h${round(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    compact`v${round(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

/** SVG attributes of a shape's outline, if it has one. */
function strokeProps(shape: FrameStroke) {
  return shape.stroke && shape.strokeWidth
    ? { stroke: shape.stroke, strokeWidth: round(shape.strokeWidth) }
    : {};
}

function renderShape(shape: FrameShape, key: number) {
  if (shape.type === "rect" && shape.hole) {
    return (
      <path
        d={boxPath(shape) + boxPath(shape.hole)}
        fill={shape.fill}
        fillRule="evenodd"
        key={key}
        {...strokeProps(shape)}
      />
    );
  }
  if (shape.type === "polygon") {
    return (
      <polygon
        fill={shape.fill}
        key={key}
        points={shape.points
          .map(([x, y]) => `${round(x)},${round(y)}`)
          .join(" ")}
        {...strokeProps(shape)}
      />
    );
  }
  if (shape.type === "path") {
    return (
      <path
        d={shape.d}
        fill={shape.fill}
        key={key}
        {...(shape.fillRule === "evenodd" && { fillRule: "evenodd" })}
        {...strokeProps(shape)}
      />
    );
  }
  return (
    <rect
      {...strokeProps(shape)}
      fill={shape.fill}
      height={round(shape.height)}
      key={key}
      width={round(shape.width)}
      x={round(shape.x)}
      y={round(shape.y)}
      {...(shape.radius > 0 && {
        rx: round(shape.radius),
        ry: round(shape.radius),
      })}
    />
  );
}

/** A layout's shapes as SVG elements, in paint order (the frame's artwork). */
export function frameShapeElements(layout: FrameLayout): QRNode[] {
  return layout.shapes.map((shape, index) => renderShape(shape, index));
}

/**
 * Wraps a rendered QR `<svg>` (sized `size × size`) in a frame. The QR element
 * is nested as-is at its offset, so its modules are untouched.
 */
export function wrapWithFrame(
  qrElement: QRNode,
  options: {
    size: number;
    frame: AnyQRFrame;
    bgColor?: ColorConfig;
    /** Attributes for the outer <svg> (React's names: className, style…) */
    svgProps?: Record<string, unknown>;
    /** Mark each label with FRAME_LABEL_ATTRIBUTE (its `field`), for editors */
    markLabels?: boolean;
  }
): QRNode {
  const { size, frame, bgColor, svgProps, markLabels } = options;
  const layout = getFrameLayout(size, frame, bgColor);
  const labels = frameLabels(layout);
  const width = round(layout.width);
  const height = round(layout.height);

  return (
    <svg
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <g data-qrdx-frame={frame.style}>
        {layout.shapes.map((shape, index) => renderShape(shape, index))}
      </g>
      {cloneElement(qrElement, {
        x: round(layout.qrX),
        y: round(layout.qrY),
        width: size,
        height: size,
      })}
      {labels.map((label, index) => (
        <text
          data-max-width={round(label.maxWidth)}
          fill={label.color}
          fontFamily={FRAME_FONT_FAMILY}
          fontSize={round(label.fontSize)}
          fontWeight={label.fontWeight ?? 700}
          key={index}
          textAnchor={label.align ?? "middle"}
          x={round(label.x)}
          y={round(label.y)}
          {...(label.rotate && {
            transform: `rotate(${round(label.rotate)} ${round(label.x)} ${round(label.y)})`,
          })}
          {...(markLabels &&
            label.field && { [FRAME_LABEL_ATTRIBUTE]: label.field })}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

/** Every label of a layout: the main one first, then the extra ones. */
export function frameLabels(layout: FrameLayout): FrameLabel[] {
  return [
    ...(layout.label ? [layout.label] : []),
    ...(layout.extraLabels ?? []),
  ];
}

/** Paints the frame shapes and label on a 2D canvas (QR code not included). */
export function drawFrameOnCanvas(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout
) {
  const traceBox = ({ x, y, width, height, radius }: FrameBox) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const strokeShape = (shape: FrameShape, path?: Path2D) => {
    if (!(shape.stroke && shape.strokeWidth)) {
      return;
    }
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 4;
    if (path) {
      ctx.stroke(path);
    } else {
      ctx.stroke();
    }
  };

  for (const shape of layout.shapes) {
    const filled = !(shape.fill === "transparent" || shape.fill === "none");
    if (!(filled || shape.stroke)) {
      continue;
    }
    ctx.fillStyle = shape.fill;
    if (shape.type === "path") {
      if (typeof Path2D !== "undefined") {
        const path = new Path2D(shape.d);
        if (filled) {
          ctx.fill(path, shape.fillRule ?? "nonzero");
        }
        strokeShape(shape, path);
      }
      continue;
    }
    ctx.beginPath();
    if (shape.type === "polygon") {
      shape.points.forEach(([x, y], index) => {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      if (filled) {
        ctx.fill();
      }
    } else {
      traceBox(shape);
      if (shape.hole) {
        traceBox(shape.hole);
      }
      if (filled) {
        ctx.fill("evenodd");
      }
    }
    strokeShape(shape);
  }

  for (const label of frameLabels(layout)) {
    ctx.fillStyle = label.color;
    ctx.font = `${label.fontWeight ?? 700} ${label.fontSize}px ${FRAME_FONT_FAMILY}`;
    ctx.textAlign =
      label.align === "start"
        ? "left"
        : label.align === "end"
          ? "right"
          : "center";
    ctx.textBaseline = "alphabetic";
    if (label.rotate) {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate((label.rotate * Math.PI) / 180);
      ctx.fillText(label.text, 0, 0, label.maxWidth);
      ctx.restore();
    } else {
      ctx.fillText(label.text, label.x, label.y, label.maxWidth);
    }
  }
}
