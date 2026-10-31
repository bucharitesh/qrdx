/** biome-ignore-all lint/style/noMagicNumbers: frame proportions */
// Layouts for the frame styles added after the original five. Each returns
// plain shapes (rects, polygons, path data) and labels, so the SVG, canvas,
// PDF and EPS outputs draw the same artwork. Colors are always opaque (tints
// are mixed, not layered with transparency) because EPS has no transparency.
import type { FrameStyle, QRFrame } from "../types";
import type {
  FrameBox,
  FrameLabel,
  FrameLayout,
  FramePath,
  FramePolygon,
  FrameRect,
} from "./frame";
import { circlePath, type Point, roundedRectPath } from "./shapes";
import { parseColor } from "./utils/parse-color";

export const SHAPED_FRAME_STYLES = [
  "banner-top-bottom",
  "speech-bubble-top",
  "chat-bubble",
  "circle",
  "polaroid",
  "phone",
  "ticket",
  "badge",
  "envelope",
  "tag",
  "menu-card",
  "sticker",
  "gradient-border",
  "focus",
] as const satisfies readonly FrameStyle[];

export type ShapedFrameStyle = (typeof SHAPED_FRAME_STYLES)[number];

export function isShapedFrameStyle(
  style: FrameStyle
): style is ShapedFrameStyle {
  return (SHAPED_FRAME_STYLES as readonly string[]).includes(style);
}

/** Default colors of "gradient-border" when `color` / `secondaryColor` are unset. */
export const GRADIENT_FRAME_DEFAULTS = { from: "#7c3aed", to: "#db2777" };

const WHITE = "#FFFFFF";

// ── Text measuring ────────────────────────────────────────────────────────

/** Rough em width of one character in a bold sans-serif. */
export function charEm(char: string): number {
  if (char === " ") {
    return 0.3;
  }
  if (/[MWmw@%]/.test(char)) {
    return 0.92;
  }
  if (/[A-Z0-9#&]/.test(char)) {
    return 0.72;
  }
  if (/[il.,:;!'|1]/.test(char)) {
    return 0.32;
  }
  return 0.6;
}

// Rough em widths for a bold sans-serif, used to fit labels without
// measuring text (measuring needs a DOM).
export function estimateTextEm(text: string): number {
  let em = 0;
  for (const char of text) {
    em += charEm(char);
  }
  return Math.max(em, 1);
}

// ── Color ─────────────────────────────────────────────────────────────────

const hex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

/**
 * Opaque mix of two colors (`amount` 0 = `from`, 1 = `to`). Frames use solid
 * tints instead of transparency, because EPS has no transparency.
 */
export function mixFrameColors(
  from: string,
  to: string,
  amount: number
): string {
  const a = parseColor(from) ?? { r: 0, g: 0, b: 0, a: 1 };
  const b = parseColor(to) ?? { r: 255, g: 255, b: 255, a: 1 };
  const t = Math.min(1, Math.max(0, amount));
  return `#${hex(a.r + (b.r - a.r) * t)}${hex(a.g + (b.g - a.g) * t)}${hex(a.b + (b.b - a.b) * t)}`;
}

// ── Shape helpers ─────────────────────────────────────────────────────────

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0
): FrameBox => ({ x, y, width, height, radius });

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
): FrameRect => ({ type: "rect", ...box(x, y, width, height, radius), fill });

const ring = (outer: FrameBox, hole: FrameBox, fill: string): FrameRect => ({
  type: "rect",
  ...outer,
  fill,
  hole,
});

const polygon = (points: Point[], fill: string): FramePolygon => ({
  type: "polygon",
  points,
  fill,
});

const path = (
  d: string,
  fill: string,
  fillRule: "nonzero" | "evenodd" = "nonzero"
): FramePath => ({ type: "path", d, fill, fillRule });

const present = (...labels: (FrameLabel | null)[]): FrameLabel[] =>
  labels.filter((label): label is FrameLabel => label !== null);

// ── Layouts ───────────────────────────────────────────────────────────────

export interface FrameStyleContext {
  /** Width of the QR code (margin included) */
  size: number;
  frame: QRFrame;
  /** Frame color (`frame.color` or black) */
  color: string;
  /** Solid page color behind the code */
  background: string;
  text: string;
  secondaryText: string;
  gap: number;
  border: number;
  band: number;
  fontScale: number;
  /** Label fitted in a row: font from the row height, shrunk to `maxWidth` */
  fitLabel: (
    text: string,
    centerX: number,
    centerY: number,
    rowHeight: number,
    maxWidth: number,
    color: string
  ) => FrameLabel | null;
}

type Layout = (ctx: FrameStyleContext) => FrameLayout;

const bannerTopBottom: Layout = (ctx) => {
  const { size, gap, border, band, color, background, frame, fitLabel } = ctx;
  const width = size + 2 * (border + gap);
  const innerWidth = width - 2 * border;
  const innerHeight = size + 2 * gap;
  const height = band + innerHeight + band;
  const labelWidth = innerWidth - 2 * gap;
  const textColor = frame.textColor || WHITE;
  return {
    width,
    height,
    qrX: border + gap,
    qrY: band + gap,
    qrSize: size,
    shapes: [
      rect(border, band, innerWidth, innerHeight, 0, background),
      ring(
        box(0, 0, width, height),
        box(border, band, innerWidth, innerHeight),
        color
      ),
    ],
    label: fitLabel(ctx.text, width / 2, band / 2, band, labelWidth, textColor),
    extraLabels: present(
      fitLabel(
        ctx.secondaryText,
        width / 2,
        band + innerHeight + band / 2,
        band,
        labelWidth,
        textColor
      )
    ),
    squareEdges: true,
    color,
  };
};

const speechBubbleTop: Layout = (ctx) => {
  const { size, gap, border, band, color, background, frame, fitLabel } = ctx;
  const width = size + 2 * (border + gap);
  const innerWidth = width - 2 * border;
  const radius = size * 0.07;
  const innerRadius = Math.max(radius - border, 0);
  const spacing = size * 0.025;
  const pointer = size * 0.08;
  const cardY = band + pointer + spacing;
  return {
    width,
    height: cardY + width,
    qrX: border + gap,
    qrY: cardY + border + gap,
    qrSize: size,
    shapes: [
      rect(0, 0, width, band, band / 2, color),
      polygon(
        [
          // Base dips into the pill so no hairline shows between them
          [width / 2 - pointer, band - pointer / 2],
          [width / 2 + pointer, band - pointer / 2],
          [width / 2, band + pointer],
        ],
        color
      ),
      rect(
        border,
        cardY + border,
        innerWidth,
        innerWidth,
        innerRadius,
        background
      ),
      ring(
        box(0, cardY, width, width, radius),
        box(border, cardY + border, innerWidth, innerWidth, innerRadius),
        color
      ),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      band / 2,
      band,
      innerWidth - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const chatBubble: Layout = (ctx) => {
  const { size, gap, border, color, background, frame, fitLabel } = ctx;
  const width = size + 2 * (border + gap);
  const innerWidth = width - 2 * border;
  const radius = size * 0.12;
  const windowHeight = size + 2 * gap;
  const row = ctx.text ? size * 0.2 : border;
  const bubbleHeight = border + windowHeight + row;
  const tail = size * 0.13;
  const top = bubbleHeight - size * 0.02;
  return {
    width,
    height: bubbleHeight + tail,
    qrX: border + gap,
    qrY: border + gap,
    qrSize: size,
    shapes: [
      rect(0, 0, width, bubbleHeight, radius, color),
      path(
        `M${width * 0.13} ${top}L${width * 0.05} ${bubbleHeight + tail}` +
          `Q${width * 0.16} ${bubbleHeight + tail * 0.45} ${width * 0.32} ${top}Z`,
        color
      ),
      rect(
        border,
        border,
        innerWidth,
        windowHeight,
        Math.max(radius - border, 0),
        background
      ),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      border + windowHeight + row / 2,
      row,
      innerWidth - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

/**
 * Letters of `text` set along a circle of `radius` around (cx, cy): over the
 * top reading clockwise, or along the bottom reading left to right, upright.
 */
function arcLabels(
  text: string,
  cx: number,
  cy: number,
  radius: number,
  fontSize: number,
  where: "top" | "bottom",
  color: string
): FrameLabel[] {
  const chars = [...text];
  const spacing = fontSize * 0.08;
  const widths = chars.map((char) => charEm(char) * fontSize);
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    spacing * Math.max(0, chars.length - 1);
  // Center the capitals on `radius`: the baseline sits half a cap height in
  // from the outside of the glyphs.
  const baseline =
    where === "top" ? radius - fontSize * 0.35 : radius + fontSize * 0.35;
  const labels: FrameLabel[] = [];
  let offset = 0;
  chars.forEach((char, index) => {
    const width = widths[index] as number;
    const along = (offset + width / 2) / baseline;
    offset += width + spacing;
    if (char.trim() === "") {
      return;
    }
    const angle =
      where === "top"
        ? -Math.PI / 2 - total / 2 / baseline + along
        : Math.PI / 2 + total / 2 / baseline - along;
    labels.push({
      text: char,
      x: cx + baseline * Math.cos(angle),
      y: cy + baseline * Math.sin(angle),
      fontSize,
      maxWidth: fontSize * 2,
      color,
      rotate: (angle * 180) / Math.PI + (where === "top" ? 90 : -90),
    });
  });
  return labels;
}

const circle: Layout = (ctx) => {
  const { size, gap, color, background, frame, fontScale } = ctx;
  // Light disc that clears the code's corners by most of a frame gap
  const inner = size * Math.SQRT1_2 + gap * 0.9;
  const thickness = size * 0.21;
  const outer = inner + thickness;
  const middle = inner + thickness / 2;
  const center = outer;
  const textColor = frame.textColor || WHITE;
  // Each label may use up to 140° of the ring
  const arc = middle * ((140 * Math.PI) / 180);
  const fontFor = (text: string) =>
    Math.min(
      thickness * 0.5 * fontScale,
      arc / (estimateTextEm(text) + 0.08 * text.length)
    );
  const top = ctx.text
    ? arcLabels(
        ctx.text,
        center,
        center,
        middle,
        fontFor(ctx.text),
        "top",
        textColor
      )
    : [];
  const bottom = ctx.secondaryText
    ? arcLabels(
        ctx.secondaryText,
        center,
        center,
        middle,
        fontFor(ctx.secondaryText),
        "bottom",
        textColor
      )
    : [];
  const dot = thickness * 0.07;
  return {
    width: 2 * outer,
    height: 2 * outer,
    qrX: center - size / 2,
    qrY: center - size / 2,
    qrSize: size,
    shapes: [
      path(circlePath(center, center, inner), background),
      path(
        circlePath(center, center, outer) + circlePath(center, center, inner),
        color,
        "evenodd"
      ),
      path(
        circlePath(center - middle, center, dot) +
          circlePath(center + middle, center, dot),
        textColor
      ),
    ],
    label: null,
    extraLabels: [...top, ...bottom],
    squareEdges: false,
    color,
  };
};

const polaroid: Layout = (ctx) => {
  const { size, gap, color, background, frame, fitLabel } = ctx;
  const side = size * 0.07;
  const photo = size + 2 * gap;
  const bottom = size * 0.3;
  const shadow = size * 0.025;
  const cardWidth = photo + 2 * side;
  const cardHeight = side + photo + bottom;
  const radius = size * 0.015;
  return {
    width: cardWidth + shadow,
    height: cardHeight + shadow,
    qrX: side + gap,
    qrY: side + gap,
    qrSize: size,
    shapes: [
      rect(
        shadow,
        shadow,
        cardWidth,
        cardHeight,
        radius,
        mixFrameColors(color, WHITE, 0.72)
      ),
      rect(0, 0, cardWidth, cardHeight, radius, color),
      rect(side, side, photo, photo, 0, background),
    ],
    label: fitLabel(
      ctx.text,
      cardWidth / 2,
      side + photo + bottom / 2,
      bottom * 0.8,
      photo - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const phone: Layout = (ctx) => {
  const { size, gap, color, background, frame, fitLabel } = ctx;
  const side = size * 0.05;
  const topBezel = size * 0.17;
  const bottomBezel = size * 0.15;
  const row = ctx.text ? size * 0.17 : 0;
  const screenWidth = size + 2 * gap;
  const screenHeight = gap + size + (ctx.text ? gap * 0.5 + row : gap);
  const width = screenWidth + 2 * side;
  const height = topBezel + screenHeight + bottomBezel;
  const speaker = size * 0.036;
  const homeBar = size * 0.03;
  return {
    width,
    height,
    qrX: side + gap,
    qrY: topBezel + gap,
    qrSize: size,
    shapes: [
      rect(0, 0, width, height, size * 0.17, color),
      rect(side, topBezel, screenWidth, screenHeight, size * 0.06, background),
      rect(
        width / 2 - size * 0.11,
        topBezel / 2 - speaker / 2,
        size * 0.22,
        speaker,
        speaker / 2,
        background
      ),
      rect(
        width / 2 - size * 0.15,
        topBezel + screenHeight + bottomBezel / 2 - homeBar / 2,
        size * 0.3,
        homeBar,
        homeBar / 2,
        background
      ),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      topBezel + gap + size + gap * 0.5 + row / 2,
      row,
      screenWidth - 2 * gap,
      frame.textColor || color
    ),
    squareEdges: false,
    color,
  };
};

const ticket: Layout = (ctx) => {
  const { size, gap, band, color, background, frame, fitLabel } = ctx;
  const side = size * 0.05;
  const windowWidth = size + 2 * gap;
  const width = windowWidth + 2 * side;
  const perforation = side + windowWidth + side * 1.2;
  const height = perforation + band;
  const notch = size * 0.055;
  const r = size * 0.04;
  const body =
    `M${r} 0H${width - r}A${r} ${r} 0 0 1 ${width} ${r}` +
    `V${perforation - notch}A${notch} ${notch} 0 0 0 ${width} ${perforation + notch}` +
    `V${height - r}A${r} ${r} 0 0 1 ${width - r} ${height}` +
    `H${r}A${r} ${r} 0 0 1 0 ${height - r}` +
    `V${perforation + notch}A${notch} ${notch} 0 0 0 0 ${perforation - notch}` +
    `V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  const dashes: string[] = [];
  const dash = size * 0.03;
  const dashGap = size * 0.022;
  const thickness = size * 0.012;
  for (
    let x = notch + dashGap;
    x + dash <= width - notch - dashGap / 2;
    x += dash + dashGap
  ) {
    dashes.push(
      roundedRectPath(x, perforation - thickness / 2, dash, thickness)
    );
  }
  return {
    width,
    height,
    qrX: side + gap,
    qrY: side + gap,
    qrSize: size,
    shapes: [
      path(body, color),
      rect(side, side, windowWidth, windowWidth, size * 0.02, background),
      path(dashes.join(""), background),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      perforation + band / 2,
      band,
      windowWidth - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const badge: Layout = (ctx) => {
  const { size, gap, border, band, color, background, frame, fitLabel } = ctx;
  const extend = size * 0.18;
  const fold = size * 0.05;
  const cardWidth = size + 2 * (border + gap);
  const radius = size * 0.06;
  const innerRadius = Math.max(radius - border, 0);
  const width = cardWidth + 2 * extend;
  const ribbonY = cardWidth - border;
  const frontX = extend * 0.5;
  const tailY = ribbonY + fold;
  const tailX = frontX + fold * 2;
  const notch = extend * 0.28;
  const tail = mixFrameColors(color, "#000000", 0.28);
  const crease = mixFrameColors(color, "#000000", 0.5);
  return {
    width,
    height: tailY + band,
    qrX: extend + border + gap,
    qrY: border + gap,
    qrSize: size,
    shapes: [
      polygon(
        [
          [0, tailY],
          [tailX, tailY],
          [tailX, tailY + band],
          [0, tailY + band],
          [notch, tailY + band / 2],
        ],
        tail
      ),
      polygon(
        [
          [width, tailY],
          [width - notch, tailY + band / 2],
          [width, tailY + band],
          [width - tailX, tailY + band],
          [width - tailX, tailY],
        ],
        tail
      ),
      polygon(
        [
          [frontX, ribbonY + band],
          [frontX + fold * 1.6, ribbonY + band + fold],
          [frontX, ribbonY + band + fold],
        ],
        crease
      ),
      polygon(
        [
          [width - frontX, ribbonY + band],
          [width - frontX, ribbonY + band + fold],
          [width - frontX - fold * 1.6, ribbonY + band + fold],
        ],
        crease
      ),
      rect(
        extend + border,
        border,
        cardWidth - 2 * border,
        cardWidth - 2 * border,
        innerRadius,
        background
      ),
      ring(
        box(extend, 0, cardWidth, cardWidth, radius),
        box(
          extend + border,
          border,
          cardWidth - 2 * border,
          cardWidth - 2 * border,
          innerRadius
        ),
        color
      ),
      rect(frontX, ribbonY, width - 2 * frontX, band, 0, color),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      ribbonY + band / 2,
      band,
      width - 2 * frontX - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const envelope: Layout = (ctx) => {
  const { size, gap, band, color, background, frame, fitLabel } = ctx;
  const side = size * 0.08;
  const letterWidth = size + 2 * gap;
  const width = letterWidth + 2 * side;
  const letterY = size * 0.05;
  const pocketY = letterY + gap + size + gap * 0.6;
  const dip = size * 0.14;
  const height = pocketY + dip + band + size * 0.02;
  const backY = letterY + size * 0.32;
  const outline = size * 0.012;
  const letterHeight = pocketY + dip - letterY;
  return {
    width,
    height,
    qrX: side + gap,
    qrY: letterY + gap,
    qrSize: size,
    shapes: [
      rect(
        0,
        backY,
        width,
        height - backY,
        0,
        mixFrameColors(color, WHITE, 0.45)
      ),
      polygon(
        [
          [0, backY],
          [width / 2, 0],
          [width, backY],
        ],
        mixFrameColors(color, WHITE, 0.25)
      ),
      rect(side, letterY, letterWidth, letterHeight, 0, background),
      ring(
        box(
          side - outline,
          letterY - outline,
          letterWidth + 2 * outline,
          letterHeight + outline
        ),
        box(side, letterY, letterWidth, letterHeight),
        color
      ),
      polygon(
        [
          [0, pocketY],
          [width / 2, pocketY + dip],
          [width, pocketY],
          [width, height],
          [0, height],
        ],
        color
      ),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      pocketY + dip + band / 2,
      band,
      letterWidth - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const tag: Layout = (ctx) => {
  const { size, gap, band, color, background, frame, fitLabel } = ctx;
  const side = size * 0.06;
  const windowWidth = size + 2 * gap;
  const width = windowWidth + 2 * side;
  const top = size * 0.24;
  const hole = size * 0.04;
  const holeY = top * 0.48;
  const chamfer = size * 0.14;
  const row = ctx.text ? band : side;
  const height = top + windowWidth + row;
  const r = size * 0.04;
  const body =
    `M${chamfer} 0H${width - chamfer}L${width} ${chamfer}` +
    `V${height - r}A${r} ${r} 0 0 1 ${width - r} ${height}` +
    `H${r}A${r} ${r} 0 0 1 0 ${height - r}V${chamfer}Z` +
    circlePath(width / 2, holeY, hole);
  return {
    width,
    height,
    qrX: side + gap,
    qrY: top + gap,
    qrSize: size,
    shapes: [
      path(body, color, "evenodd"),
      path(
        circlePath(width / 2, holeY, hole * 1.7) +
          circlePath(width / 2, holeY, hole),
        mixFrameColors(color, WHITE, 0.35),
        "evenodd"
      ),
      rect(side, top, windowWidth, windowWidth, size * 0.02, background),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      top + windowWidth + row / 2,
      row,
      windowWidth - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

const menuCard: Layout = (ctx) => {
  const { size, color, background, frame, fitLabel } = ctx;
  const pad = size * 0.13;
  const header = ctx.text ? size * 0.26 : pad;
  const footer = ctx.secondaryText ? size * 0.2 : pad;
  const width = size + 2 * pad;
  const height = header + size + footer;
  const radius = size * 0.03;
  const rule = size * 0.022;
  const inset = size * 0.045;
  const hairline = size * 0.008;
  const textColor = frame.textColor || color;
  const shapes: FrameLayout["shapes"] = [
    rect(0, 0, width, height, radius, background),
    ring(
      box(0, 0, width, height, radius),
      box(
        rule,
        rule,
        width - 2 * rule,
        height - 2 * rule,
        Math.max(radius - rule, 0)
      ),
      color
    ),
    ring(
      box(inset, inset, width - 2 * inset, height - 2 * inset),
      box(
        inset + hairline,
        inset + hairline,
        width - 2 * (inset + hairline),
        height - 2 * (inset + hairline)
      ),
      color
    ),
  ];
  if (ctx.text) {
    const y = header - size * 0.075;
    const diamond = size * 0.022;
    shapes.push(
      rect(width * 0.3, y - hairline / 2, width * 0.4, hairline, 0, color),
      polygon(
        [
          [width / 2, y - diamond],
          [width / 2 + diamond, y],
          [width / 2, y + diamond],
          [width / 2 - diamond, y],
        ],
        color
      )
    );
  }
  return {
    width,
    height,
    qrX: pad,
    qrY: header,
    qrSize: size,
    shapes,
    label: fitLabel(
      ctx.text,
      width / 2,
      size * 0.115,
      size * 0.17,
      width - 2 * pad,
      textColor
    ),
    extraLabels: present(
      fitLabel(
        ctx.secondaryText,
        width / 2,
        header + size + footer * 0.45,
        footer * 0.8,
        width - 2 * pad,
        textColor
      )
    ),
    squareEdges: false,
    color,
  };
};

const sticker: Layout = (ctx) => {
  const { size, gap, color, background, frame, fitLabel } = ctx;
  const cut = size * 0.025;
  const thick = size * 0.07;
  const shadow = size * 0.03;
  const radius = size * 0.13;
  const row = ctx.text ? size * 0.17 : 0;
  // A wider light gap than other frames: the thick dark rim sits close to
  // the finder corners otherwise
  const inset = gap * 1.25;
  const face = size + 2 * inset;
  const bodyWidth = face + 2 * thick;
  const bodyHeight = face + 2 * thick + row;
  const outerWidth = bodyWidth + 2 * cut;
  const outerHeight = bodyHeight + 2 * cut;
  return {
    width: outerWidth + shadow,
    height: outerHeight + shadow,
    qrX: cut + thick + inset,
    qrY: cut + thick + inset,
    qrSize: size,
    shapes: [
      rect(
        shadow,
        shadow,
        outerWidth,
        outerHeight,
        radius + cut,
        mixFrameColors(color, WHITE, 0.7)
      ),
      rect(0, 0, outerWidth, outerHeight, radius + cut, WHITE),
      rect(cut, cut, bodyWidth, bodyHeight, radius, color),
      rect(cut + thick, cut + thick, face, face, size * 0.04, background),
    ],
    label: fitLabel(
      ctx.text,
      cut + bodyWidth / 2,
      cut + thick + face + (thick + row) / 2,
      thick + row,
      face - 2 * gap,
      frame.textColor || WHITE
    ),
    squareEdges: false,
    color,
  };
};

/**
 * Distance from the top edge of a rounded rect (x0..x0+width, corner radius
 * r) down to its outline at `x`.
 */
function edgeInset(x: number, x0: number, width: number, r: number): number {
  const dx =
    x < x0 + r ? x0 + r - x : x > x0 + width - r ? x - (x0 + width - r) : 0;
  return r - Math.sqrt(Math.max(0, r * r - Math.min(dx, r) ** 2));
}

/**
 * A rounded ring split into thin vertical strips, each a solid color stepped
 * from `from` to `to`, so the gradient looks the same in every output.
 */
function gradientRing(
  width: number,
  height: number,
  radius: number,
  border: number,
  from: string,
  to: string,
  steps = 48
): FramePolygon[] {
  const innerRadius = Math.max(radius - border, 0);
  const innerWidth = width - 2 * border;
  const cuts = new Set<number>([border, width - border]);
  for (let i = 0; i <= steps; i++) {
    cuts.add((width * i) / steps);
  }
  const xs = [...cuts].sort((a, b) => a - b);
  // Overlap neighbours slightly so no anti-aliasing seam shows
  const overlap = width * 0.002;
  const samples = 5;
  const outerTop = (x: number) => edgeInset(x, 0, width, radius);
  const innerTop = (x: number) =>
    border + edgeInset(x, border, innerWidth, innerRadius);
  const strips: FramePolygon[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i] as number;
    const b = Math.min(
      width,
      (xs[i + 1] as number) + (i + 2 < xs.length ? overlap : 0)
    );
    const fill = mixFrameColors(from, to, (a + b) / 2 / width);
    const along = (reverse: boolean) =>
      Array.from({ length: samples }, (_, k) => {
        const t = k / (samples - 1);
        return reverse ? b + (a - b) * t : a + (b - a) * t;
      });
    const middle =
      a >= border - 1e-9 && (xs[i + 1] as number) <= width - border + 1e-9;
    if (middle) {
      strips.push(
        polygon(
          [
            ...along(false).map((x): Point => [x, outerTop(x)]),
            ...along(true).map((x): Point => [x, innerTop(x)]),
          ],
          fill
        ),
        polygon(
          [
            ...along(false).map((x): Point => [x, height - innerTop(x)]),
            ...along(true).map((x): Point => [x, height - outerTop(x)]),
          ],
          fill
        )
      );
    } else {
      strips.push(
        polygon(
          [
            ...along(false).map((x): Point => [x, outerTop(x)]),
            ...along(true).map((x): Point => [x, height - outerTop(x)]),
          ],
          fill
        )
      );
    }
  }
  return strips;
}

const gradientBorder: Layout = (ctx) => {
  const { size, gap, background, frame, fitLabel } = ctx;
  const from = frame.color || GRADIENT_FRAME_DEFAULTS.from;
  const to = frame.secondaryColor || GRADIENT_FRAME_DEFAULTS.to;
  const border = size * 0.05;
  const width = size + 2 * (border + gap);
  const row = ctx.text ? size * 0.18 : 0;
  const innerHeight = size + (ctx.text ? gap + row : 2 * gap);
  const height = innerHeight + 2 * border;
  const radius = size * 0.1;
  return {
    width,
    height,
    qrX: border + gap,
    qrY: border + gap,
    qrSize: size,
    shapes: [
      rect(
        border,
        border,
        width - 2 * border,
        innerHeight,
        radius - border,
        background
      ),
      ...gradientRing(width, height, radius, border, from, to),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      border + gap + size + row / 2,
      row,
      width - 2 * border - 2 * gap,
      frame.textColor || mixFrameColors(from, to, 0.5)
    ),
    squareEdges: false,
    color: from,
  };
};

/** Focus: four corner brackets around the code, the label underneath. */
const focus: Layout = (ctx) => {
  const { size, gap, color, background, frame, fitLabel } = ctx;
  const thick = size * 0.035;
  const arm = size * 0.2;
  const width = size + 2 * (gap + thick);
  const row = ctx.text ? size * 0.2 : 0;
  const box = width;
  const height = box + row;
  const bracket = (x: number, y: number, dx: number, dy: number): Point[] => [
    [x, y],
    [x + dx * arm, y],
    [x + dx * arm, y + dy * thick],
    [x + dx * thick, y + dy * thick],
    [x + dx * thick, y + dy * arm],
    [x, y + dy * arm],
  ];
  return {
    width,
    height,
    qrX: thick + gap,
    qrY: thick + gap,
    qrSize: size,
    shapes: [
      rect(0, 0, width, height, 0, background),
      polygon(bracket(0, 0, 1, 1), color),
      polygon(bracket(box, 0, -1, 1), color),
      polygon(bracket(box, box, -1, -1), color),
      polygon(bracket(0, box, 1, -1), color),
    ],
    label: fitLabel(
      ctx.text,
      width / 2,
      box + row * 0.4,
      row,
      width - 2 * gap,
      frame.textColor || color
    ),
    squareEdges: false,
    color,
  };
};

export const SHAPED_FRAMES: Record<ShapedFrameStyle, Layout> = {
  "banner-top-bottom": bannerTopBottom,
  "speech-bubble-top": speechBubbleTop,
  "chat-bubble": chatBubble,
  circle,
  polaroid,
  phone,
  ticket,
  badge,
  envelope,
  tag,
  "menu-card": menuCard,
  sticker,
  "gradient-border": gradientBorder,
  focus,
};
