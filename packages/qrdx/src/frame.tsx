/** biome-ignore-all lint/style/noMagicNumbers: frame proportions */
import type { ReactElement, SVGProps } from "react";
import React from "react";
import type { ColorConfig, QRFrame } from "../types";
import { DEFAULT_FRAME_TEXT, FRAME_TEXT_MAX_LENGTH } from "../types/frame";
import { DEFAULT_BGCOLOR } from "./constants";
import { getSolidColor } from "./utils/color";

/** System font stack for frame labels, so rendering never fetches a font. */
export const FRAME_FONT_FAMILY =
  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

/** Light gap between the code and the frame, as a share of the code width */
export const FRAME_GAP_RATIO = 0.08;

const DEFAULT_FRAME_COLOR = "#000000";
const DEFAULT_BANNER_TEXT_COLOR = "#FFFFFF";

export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface FrameRect extends FrameBox {
  type: "rect";
  fill: string;
  /** Area cut out of the rect (where the QR code shows through) */
  hole?: FrameBox;
}

export interface FramePolygon {
  type: "polygon";
  points: [number, number][];
  fill: string;
}

export type FrameShape = FrameRect | FramePolygon;

export interface FrameLabel {
  text: string;
  /** Horizontal center of the label */
  x: number;
  /** Alphabetic baseline of the label */
  y: number;
  fontSize: number;
  /** Width the label must fit in */
  maxWidth: number;
  color: string;
}

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
  /** True when the frame fills its whole bounding box (no rounded corners) */
  squareEdges: boolean;
  /** Frame color, for print bleed */
  color: string;
}

/** True when `frame` draws something. */
export function isFrameActive(
  frame: QRFrame | null | undefined
): frame is QRFrame {
  return Boolean(frame?.style && frame.style !== "none");
}

/** The label a frame renders: trimmed and capped at 24 characters. */
export function getFrameText(frame: QRFrame): string {
  return (frame.text ?? DEFAULT_FRAME_TEXT)
    .trim()
    .slice(0, FRAME_TEXT_MAX_LENGTH);
}

// Rough em widths for a bold sans-serif, used to fit the label without
// measuring text (measuring needs a DOM).
function estimateTextEm(text: string): number {
  let em = 0;
  for (const char of text) {
    if (char === " ") {
      em += 0.3;
    } else if (/[MWmw@%]/.test(char)) {
      em += 0.92;
    } else if (/[A-Z0-9#&]/.test(char)) {
      em += 0.72;
    } else if (/[il.,:;!'|1]/.test(char)) {
      em += 0.32;
    } else {
      em += 0.6;
    }
  }
  return Math.max(em, 1);
}

function makeLabel(
  text: string,
  centerX: number,
  centerY: number,
  rowHeight: number,
  maxWidth: number,
  color: string
): FrameLabel | null {
  if (!text) {
    return null;
  }
  const fontSize = Math.min(rowHeight * 0.52, maxWidth / estimateTextEm(text));
  return {
    text,
    x: centerX,
    // Cap height of a sans-serif is ~0.7em, so this centers capitals.
    y: centerY + fontSize * 0.35,
    fontSize,
    maxWidth,
    color,
  };
}

/**
 * Computes where the frame shapes, label and QR code go for a code of `size`
 * pixels. The QR code keeps its full size; the frame is added around it.
 */
export function getFrameLayout(
  size: number,
  frame: QRFrame,
  bgColor?: ColorConfig
): FrameLayout {
  const color = frame.color || DEFAULT_FRAME_COLOR;
  const background = getSolidColor(bgColor, DEFAULT_BGCOLOR);
  const text = getFrameText(frame);

  const gap = size * FRAME_GAP_RATIO;
  const border = size * 0.04;
  const band = size * 0.22;
  const width = size + 2 * (border + gap);
  const innerWidth = width - 2 * border;
  const labelWidth = innerWidth - 2 * gap;
  const qrX = border + gap;

  switch (frame.style) {
    case "banner-top": {
      const innerHeight = size + 2 * gap;
      return {
        width,
        height: band + innerHeight + border,
        qrX,
        qrY: band + gap,
        qrSize: size,
        shapes: [
          rect(border, band, innerWidth, innerHeight, 0, background),
          ring(
            box(0, 0, width, band + innerHeight + border, 0),
            box(border, band, innerWidth, innerHeight, 0),
            color
          ),
        ],
        label: makeLabel(
          text,
          width / 2,
          band / 2,
          band,
          labelWidth,
          frame.textColor || DEFAULT_BANNER_TEXT_COLOR
        ),
        squareEdges: true,
        color,
      };
    }

    case "border":
    case "rounded-border": {
      const rowHeight = text ? size * 0.18 : 0;
      const innerHeight = size + (text ? gap + rowHeight : 2 * gap);
      const height = innerHeight + 2 * border;
      const radius = frame.style === "rounded-border" ? size * 0.1 : 0;
      const innerRadius = Math.max(radius - border, 0);
      return {
        width,
        height,
        qrX,
        qrY: border + gap,
        qrSize: size,
        shapes: [
          rect(
            border,
            border,
            innerWidth,
            innerHeight,
            innerRadius,
            background
          ),
          ring(
            box(0, 0, width, height, radius),
            box(border, border, innerWidth, innerHeight, innerRadius),
            color
          ),
        ],
        label: makeLabel(
          text,
          width / 2,
          border + gap + size + rowHeight / 2,
          rowHeight,
          labelWidth,
          frame.textColor || color
        ),
        squareEdges: radius === 0,
        color,
      };
    }

    case "speech-bubble": {
      const radius = size * 0.07;
      const innerRadius = Math.max(radius - border, 0);
      const spacing = size * 0.025;
      const pointer = size * 0.08;
      const bubbleY = width + spacing + pointer;
      return {
        width,
        height: bubbleY + band,
        qrX,
        qrY: border + gap,
        qrSize: size,
        shapes: [
          rect(border, border, innerWidth, innerWidth, innerRadius, background),
          ring(
            box(0, 0, width, width, radius),
            box(border, border, innerWidth, innerWidth, innerRadius),
            color
          ),
          {
            type: "polygon",
            points: [
              // Base dips into the bubble so no hairline shows between them
              [width / 2 - pointer, bubbleY + pointer / 2],
              [width / 2, width + spacing],
              [width / 2 + pointer, bubbleY + pointer / 2],
            ],
            fill: color,
          },
          rect(0, bubbleY, width, band, band / 2, color),
        ],
        label: makeLabel(
          text,
          width / 2,
          bubbleY + band / 2,
          band,
          labelWidth,
          frame.textColor || DEFAULT_BANNER_TEXT_COLOR
        ),
        squareEdges: false,
        color,
      };
    }

    default: {
      // banner-bottom
      const innerHeight = size + 2 * gap;
      return {
        width,
        height: border + innerHeight + band,
        qrX,
        qrY: border + gap,
        qrSize: size,
        shapes: [
          rect(border, border, innerWidth, innerHeight, 0, background),
          ring(
            box(0, 0, width, border + innerHeight + band, 0),
            box(border, border, innerWidth, innerHeight, 0),
            color
          ),
        ],
        label: makeLabel(
          text,
          width / 2,
          border + innerHeight + band / 2,
          band,
          labelWidth,
          frame.textColor || DEFAULT_BANNER_TEXT_COLOR
        ),
        squareEdges: true,
        color,
      };
    }
  }
}

function box(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): FrameBox {
  return { x, y, width, height, radius };
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
): FrameRect {
  return { type: "rect", ...box(x, y, width, height, radius), fill };
}

function ring(outer: FrameBox, hole: FrameBox, fill: string): FrameRect {
  return { type: "rect", ...outer, fill, hole };
}

/**
 * Output dimensions for a code of `size` pixels with `frame` applied
 * (`size × size` when there is no frame).
 */
export function getFrameDimensions(
  size: number,
  frame?: QRFrame | null
): { width: number; height: number } {
  if (!isFrameActive(frame)) {
    return { width: size, height: size };
  }
  const { width, height } = getFrameLayout(size, frame);
  return { width, height };
}

const round = (value: number) => Math.round(value * 100) / 100;

function boxPath({ x, y, width, height, radius }: FrameBox): string {
  const r = round(Math.min(radius, width / 2, height / 2));
  const [x0, y0, w, h] = [round(x), round(y), round(width), round(height)];
  if (r <= 0) {
    return `M${x0} ${y0}h${w}v${h}h${-w}z`;
  }
  return (
    `M${x0 + r} ${y0}h${round(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}` +
    `v${round(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${round(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${round(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

function renderShape(shape: FrameShape, key: number) {
  if (shape.type === "rect" && shape.hole) {
    return (
      <path
        d={boxPath(shape) + boxPath(shape.hole)}
        fill={shape.fill}
        fillRule="evenodd"
        key={key}
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
      />
    );
  }
  return (
    <rect
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

/**
 * Wraps a rendered QR `<svg>` (sized `size × size`) in a frame. The QR element
 * is nested as-is at its offset, so its modules are untouched.
 */
export function wrapWithFrame(
  qrElement: ReactElement<SVGProps<SVGSVGElement>>,
  options: {
    size: number;
    frame: QRFrame;
    bgColor?: ColorConfig;
    svgProps?: SVGProps<SVGSVGElement>;
  }
): ReactElement {
  const { size, frame, bgColor, svgProps } = options;
  const layout = getFrameLayout(size, frame, bgColor);
  const { label } = layout;
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
      {React.cloneElement(qrElement, {
        x: round(layout.qrX),
        y: round(layout.qrY),
        width: size,
        height: size,
      })}
      {label && (
        <text
          data-max-width={round(label.maxWidth)}
          fill={label.color}
          fontFamily={FRAME_FONT_FAMILY}
          fontSize={round(label.fontSize)}
          fontWeight={700}
          textAnchor="middle"
          x={round(label.x)}
          y={round(label.y)}
        >
          {label.text}
        </text>
      )}
    </svg>
  );
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

  for (const shape of layout.shapes) {
    if (shape.fill === "transparent" || shape.fill === "none") {
      continue;
    }
    ctx.fillStyle = shape.fill;
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
      ctx.fill();
    } else {
      traceBox(shape);
      if (shape.hole) {
        traceBox(shape.hole);
      }
      ctx.fill("evenodd");
    }
  }

  const { label } = layout;
  if (label) {
    ctx.fillStyle = label.color;
    ctx.font = `700 ${label.fontSize}px ${FRAME_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label.text, label.x, label.y, label.maxWidth);
  }
}
