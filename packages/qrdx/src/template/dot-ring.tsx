/** @jsxImportSource ../jsx */
// A round code: the code in a disc of decorative dots, inside a dark ring
// with a line of text set along it. Which dots a code gets comes from a hash
// of its content, so every link has a ring of its own and the same link
// always gets the same one (dot-ring-layout.ts).
import type { TemplateDefinition } from "../../types";
import { FRAME_FONT_FAMILY } from "../frame";
import { getSolidColor } from "../utils/color";
import { roundTo } from "../utils/fmt";
import {
  BACKGROUND_RADIUS,
  CENTER,
  CODE_OFFSET,
  DEFAULT_FONT_SIZE,
  DEFAULT_LETTER_SPACING,
  DEFAULT_TEXT,
  dotRingDots,
  dotRingText,
  dotsClearOfCode,
  RING_INNER_RADIUS,
  RING_PATH,
  VIEW,
} from "./dot-ring-layout";

/** Custom props of the dot ring template (`customProps`). */
export interface DotRingProps {
  /**
   * Text set along the ring. Defaults to "Scan the QR code" four times
   * round; `""` leaves the ring empty. Text too long for the ring gets
   * tighter letter spacing, then a smaller font (down to half of
   * `fontSize`'s default), then is cut after the last whole word that fits;
   * it never runs into its own start.
   */
  customText?: string;
  /**
   * "repeat" fills the ring: the phrase is repeated as many times as fit,
   * with the spacing evened out so the copies close the ring with the same
   * gap as between them. Give the phrase once ("Read the docs *"); text
   * that already repeats a phrase ("A * A * A *") is read as that phrase.
   * Default "none": the text is set once, centered over the top (or along
   * the bottom).
   */
  textFill?: "none" | "repeat";
  /** "top" (default): centered over the top, reading clockwise. "bottom": centered along the bottom, reading left to right. */
  textPosition?: "top" | "bottom";
  /** Turns the text around the center, in degrees clockwise (default 0). */
  textRotation?: number;
  /** Text color (default white). */
  textColor?: string;
  /** CSS font family of the text (default: the system sans-serif stack frames use). */
  fontFamily?: string;
  /** Font weight (default 900). */
  fontWeight?: number | string;
  /**
   * Font size in the template's 593-unit drawing, where the code is 300
   * across (default 32). Long text may be drawn smaller (see `customText`).
   */
  fontSize?: number;
  /**
   * Extra space between letters, in the same units (default 3.5). Long text
   * and `textFill: "repeat"` adjust it to fit the ring.
   */
  fontLetterSpacing?: number;
  /** Color of the ring (default: the code's `fgColor`). */
  outerCircleColor?: string;
  /** Width of a stroke along both edges of the ring (default 0: none). */
  strokeWidth?: number;
  /** Color of that stroke (default black). */
  strokeColor?: string;
  /** Stroke width along the ring's outer edge only (default `strokeWidth`). */
  outerStrokeWidth?: number;
  /** Stroke color along the outer edge (default `strokeColor`). */
  outerStrokeColor?: string;
  /** Stroke width along the ring's inner edge only (default `strokeWidth`). */
  innerStrokeWidth?: number;
  /** Stroke color along the inner edge (default `strokeColor`). */
  innerStrokeColor?: string;
}

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const DotRing: TemplateDefinition<DotRingProps> = {
  id: "DotRing",
  name: "Dot Ring",
  description:
    "A round code in a ring of dots of its own for every link, with text along the ring",
  wrapper: (children, props, templateConfig) => {
    const fg = getSolidColor(props?.fgColor, "#000000");
    const bg = getSolidColor(props?.bgColor, "#ffffff");
    const moduleSize = templateConfig?.pixelSize ?? 9;
    const dotRadius = roundTo(moduleSize / 2);
    const dots = dotsClearOfCode(
      dotRingDots(templateConfig?.url ?? ""),
      moduleSize
    );

    const requestedSize = finite(props?.fontSize, DEFAULT_FONT_SIZE);
    const fontSize = requestedSize > 0 ? requestedSize : DEFAULT_FONT_SIZE;
    const text =
      typeof props?.customText === "string" ? props.customText : DEFAULT_TEXT;
    const ring = dotRingText(text, {
      fontSize,
      letterSpacing: finite(props?.fontLetterSpacing, DEFAULT_LETTER_SPACING),
      position: props?.textPosition === "bottom" ? "bottom" : "top",
      rotation: finite(props?.textRotation, 0),
      fill: props?.textFill === "repeat" ? "repeat" : "none",
    });
    const textColor = props?.textColor || "#ffffff";
    const fontFamily = props?.fontFamily || FRAME_FONT_FAMILY;
    const fontWeight = props?.fontWeight ?? 900;

    const strokeWidth = finite(props?.strokeWidth, 0);
    const strokeColor = props?.strokeColor || "#000000";
    const edges = [
      {
        radius: CENTER,
        width: finite(props?.outerStrokeWidth, strokeWidth),
        color: props?.outerStrokeColor || strokeColor,
      },
      {
        radius: RING_INNER_RADIUS,
        width: finite(props?.innerStrokeWidth, strokeWidth),
        color: props?.innerStrokeColor || strokeColor,
      },
    ].filter((edge) => edge.width > 0);

    return (
      <svg
        height={VIEW}
        id="svgQrWrapper"
        style={{
          width: "100%",
          height: "100%",
        }}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={VIEW}
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <circle cx={CENTER} cy={CENTER} fill={bg} r={BACKGROUND_RADIUS} />
        <g fill={fg}>
          {dots.map((dot, index) => (
            <circle cx={dot.cx} cy={dot.cy} key={index} r={dotRadius} />
          ))}
        </g>
        <path d={RING_PATH} fill={props?.outerCircleColor || fg} />
        {edges.map((edge, index) => (
          <circle
            cx={CENTER}
            cy={CENTER}
            fill="none"
            key={index}
            r={edge.radius}
            stroke={edge.color}
            strokeWidth={edge.width}
          />
        ))}
        {/* One letter per <text>: read one by one they'd make no sense to a
            screen reader, so they're hidden from it */}
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: an SVG <g> can't take focus */}
        <g aria-hidden="true">
          {ring.letters.map((letter, index) => (
            <text
              fill={textColor}
              fontFamily={fontFamily}
              fontSize={ring.fontSize}
              fontWeight={fontWeight}
              key={index}
              textAnchor="middle"
              transform={`rotate(${letter.rotate} ${letter.x} ${letter.y})`}
              x={letter.x}
              y={letter.y}
            >
              {letter.char}
            </text>
          ))}
        </g>
        <g transform={`translate(${CODE_OFFSET} ${CODE_OFFSET})`}>{children}</g>
      </svg>
    );
  },
};
