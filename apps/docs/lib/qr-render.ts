import "server-only";

import { ImageResponse } from "next/og";
import { getAllTemplates, getTemplateIds, QRCodeSVG } from "qrdx";
import {
  BODY_PATTERN,
  type BodyPattern,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  errorLevelSchema,
} from "qrdx/types";
import { createElement, Fragment, isValidElement, type ReactNode } from "react";
import { z } from "zod";
import { baseUrl } from "@/lib/metadata";

// Server-side QR rendering shared by the public image API (/api/v1/qr) and the
// MCP server (/api/mcp). Output is deterministic: the same options always give
// the same SVG string and PNG bytes.

export const QR_DATA_MAX_LENGTH = 2048;
export const QR_SIZE_MIN = 64;
export const QR_SIZE_MAX = 2048;
export const QR_MARGIN_MAX = 16;

export const QR_DEFAULTS = {
  size: 512,
  fg: "#000000",
  bg: "#ffffff",
  body: "square",
  eye: "square",
  dot: "square",
  level: "Q",
  margin: 4,
} as const satisfies {
  size: number;
  fg: string;
  bg: string;
  body: BodyPattern;
  eye: CornerEyePattern;
  dot: CornerEyeDotPattern;
  level: z.infer<typeof errorLevelSchema>;
  margin: number;
};

export const QR_TEMPLATE_IDS = getTemplateIds() as [string, ...string[]];

const HEX_COLOR = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const hexColor = z
  .string()
  .regex(
    HEX_COLOR,
    "Must be a hex color such as 155dfc (in URLs leave out the # or encode it as %23)",
  );

/** Render options, validated. Shared by the image API and the MCP tools. */
export const qrOptionsSchema = z.object({
  data: z
    .string()
    .min(1, "Required: the text or URL to encode")
    .max(QR_DATA_MAX_LENGTH, `Must be at most ${QR_DATA_MAX_LENGTH} characters`)
    .describe("Text or URL to encode"),
  size: z
    .number()
    .int()
    .min(QR_SIZE_MIN)
    .max(QR_SIZE_MAX)
    .default(QR_DEFAULTS.size)
    .describe(`Width and height in pixels (${QR_SIZE_MIN}-${QR_SIZE_MAX})`),
  fg: hexColor
    .default(QR_DEFAULTS.fg)
    .describe("Foreground (module) color as hex"),
  bg: hexColor.default(QR_DEFAULTS.bg).describe("Background color as hex"),
  eyeColor: hexColor
    .optional()
    .describe("Color of the three corner eyes (defaults to fg)"),
  dotColor: hexColor
    .optional()
    .describe("Color of the dot inside each corner eye (defaults to fg)"),
  body: z
    .enum(BODY_PATTERN)
    .default(QR_DEFAULTS.body)
    .describe("Shape of the data modules"),
  eye: z
    .enum(CORNER_EYE_PATTERNS)
    .default(QR_DEFAULTS.eye)
    .describe("Shape of the corner eye frames"),
  dot: z
    .enum(CORNER_EYE_DOT_PATTERNS)
    .default(QR_DEFAULTS.dot)
    .describe("Shape of the dot inside each corner eye"),
  level: z
    .enum(errorLevelSchema.options)
    .default(QR_DEFAULTS.level)
    .describe("Error correction level: L 7%, M 15%, Q 25%, H 30%"),
  margin: z
    .number()
    .int()
    .min(0)
    .max(QR_MARGIN_MAX)
    .default(QR_DEFAULTS.margin)
    .describe("Quiet zone around the code, in modules"),
  template: z
    .enum(QR_TEMPLATE_IDS)
    .optional()
    .describe("Decorative frame template"),
});

export type QrOptions = z.output<typeof qrOptionsSchema>;

export const qrImageFormats = ["svg", "png"] as const;
export type QrImageFormat = (typeof qrImageFormats)[number];

/** Thrown when the data does not fit in a QR code at the chosen level. */
export class QrDataTooLongError extends Error {
  constructor(level: string) {
    super(
      `Data is too long for a QR code at error correction level ${level}. Shorten it or use a lower level (L holds the most).`,
    );
    this.name = "QrDataTooLongError";
  }
}

const BODY_DESCRIPTIONS: Partial<Record<BodyPattern, string>> = {
  circle: "Round dots with small gaps",
  "circle-large": "Larger round dots that touch their neighbours",
  square: "Classic square modules",
  diamond: "Squares rotated 45 degrees",
  "circle-mixed": "Round dots in three alternating sizes",
  pacman: "Pill shapes with one rounded end, alternating direction",
  rounded: "Squares with rounded corners",
  "small-square": "Smaller squares with gaps",
  "vertical-line": "Vertical bar segments",
};

const EYE_DESCRIPTIONS: Partial<Record<CornerEyePattern, string>> = {
  square: "Square frame",
  rounded: "Square frame with rounded corners",
  gear: "Decorative gear-like frame",
  circle: "Circular frame",
  diya: "Leaf-shaped frame with two rounded corners",
  "extra-rounded": "Square frame with very round corners",
  message: "Speech-bubble frame",
  pointy: "Frame with one pointed corner",
  curly: "Curly ornamental frame",
};

const DOT_DESCRIPTIONS: Partial<Record<CornerEyeDotPattern, string>> = {
  square: "Square dot",
  rounded: "Square dot with rounded corners",
  circle: "Round dot",
  diamond: "Diamond dot",
  message: "Speech-bubble dot",
  "message-reverse": "Mirrored speech-bubble dot",
  diya: "Leaf-shaped dot",
  "diya-reverse": "Mirrored leaf-shaped dot",
  "rounded-triangle": "Rounded triangle dot",
  star: "Star dot",
  banner: "Banner dot",
};

/** Patterns, templates and limits, for the MCP `list_qr_styles` tool. */
export function getQrStyleCatalog() {
  return {
    body: BODY_PATTERN.map((id) => ({
      id,
      description: BODY_DESCRIPTIONS[id] ?? id,
    })),
    eye: CORNER_EYE_PATTERNS.map((id) => ({
      id,
      description: EYE_DESCRIPTIONS[id] ?? id,
    })),
    dot: CORNER_EYE_DOT_PATTERNS.map((id) => ({
      id,
      description: DOT_DESCRIPTIONS[id] ?? id,
    })),
    templates: getAllTemplates().map(({ id, name, description }) => ({
      id,
      name,
      description: description ?? name,
    })),
    levels: [
      { id: "L", recovery: "~7%" },
      { id: "M", recovery: "~15%" },
      { id: "Q", recovery: "~25%" },
      { id: "H", recovery: "~30%" },
    ],
    defaults: QR_DEFAULTS,
    limits: {
      dataMaxLength: QR_DATA_MAX_LENGTH,
      sizeMin: QR_SIZE_MIN,
      sizeMax: QR_SIZE_MAX,
      marginMax: QR_MARGIN_MAX,
    },
  };
}

function toHex(color: string): string {
  const lower = color.toLowerCase();
  return lower.startsWith("#") ? lower : `#${lower}`;
}

function toQrProps(options: QrOptions) {
  return {
    value: options.data,
    size: options.size,
    level: options.level,
    fgColor: toHex(options.fg),
    bgColor: toHex(options.bg),
    eyeColor: options.eyeColor ? toHex(options.eyeColor) : undefined,
    dotColor: options.dotColor ? toHex(options.dotColor) : undefined,
    bodyPattern: options.body,
    cornerEyePattern: options.eye,
    cornerEyeDotPattern: options.dot,
    margin: options.margin,
    templateId: options.template,
  };
}

/** Renders the QR code to an SVG document string. */
export function renderQrSvg(options: QrOptions): string {
  try {
    return serializeNode(createElement(QRCodeSVG, toQrProps(options)));
  } catch (error) {
    if (error instanceof RangeError && error.message === "Data too long") {
      throw new QrDataTooLongError(options.level);
    }
    throw error;
  }
}

/** Renders the QR code to PNG bytes (rasterized from the same SVG). */
export async function renderQrPng(options: QrOptions): Promise<ArrayBuffer> {
  const svg = renderQrSvg(options);
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: "100%", height: "100%" } },
      createElement("img", {
        alt: "",
        height: options.size,
        src,
        width: options.size,
      }),
    ),
    { width: options.size, height: options.size },
  );
  return image.arrayBuffer();
}

/** Public image API URL for these options; defaults are left out. */
export function buildQrImageUrl(
  options: QrOptions,
  format: QrImageFormat = "svg",
): string {
  const url = new URL("/api/v1/qr", baseUrl);
  url.searchParams.set("data", options.data);
  if (format !== "svg") url.searchParams.set("format", format);

  const entries: [string, string | number | undefined, unknown][] = [
    ["size", options.size, QR_DEFAULTS.size],
    ["fg", toHex(options.fg).slice(1), QR_DEFAULTS.fg.slice(1)],
    ["bg", toHex(options.bg).slice(1), QR_DEFAULTS.bg.slice(1)],
    ["eyeColor", options.eyeColor && toHex(options.eyeColor).slice(1), null],
    ["dotColor", options.dotColor && toHex(options.dotColor).slice(1), null],
    ["body", options.body, QR_DEFAULTS.body],
    ["eye", options.eye, QR_DEFAULTS.eye],
    ["dot", options.dot, QR_DEFAULTS.dot],
    ["level", options.level, QR_DEFAULTS.level],
    ["margin", options.margin, QR_DEFAULTS.margin],
    ["template", options.template, null],
  ];
  for (const [key, value, fallback] of entries) {
    if (value !== undefined && value !== fallback) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ── React element tree → SVG markup ────────────────────────────────────────
// A small static serializer for the library's SVG output. It avoids
// react-dom/server, which is not available to route handlers in the React
// Server Components layer. Attribute aliases follow react-dom's SVG mapping.

const ATTRIBUTE_ALIASES: Record<string, string> = {
  className: "class",
  alignmentBaseline: "alignment-baseline",
  baselineShift: "baseline-shift",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontStyle: "font-style",
  fontWeight: "font-weight",
  imageRendering: "image-rendering",
  letterSpacing: "letter-spacing",
  lightingColor: "lighting-color",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  paintOrder: "paint-order",
  pointerEvents: "pointer-events",
  shapeRendering: "shape-rendering",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  textRendering: "text-rendering",
  transformOrigin: "transform-origin",
  vectorEffect: "vector-effect",
  wordSpacing: "word-spacing",
  writingMode: "writing-mode",
  xlinkHref: "xlink:href",
  xmlLang: "xml:lang",
  xmlSpace: "xml:space",
  xmlnsXlink: "xmlns:xlink",
};

const UNITLESS_STYLES = new Set([
  "fillOpacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "lineHeight",
  "opacity",
  "order",
  "stopOpacity",
  "strokeMiterlimit",
  "strokeOpacity",
  "zIndex",
]);

const SKIPPED_PROPS = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "ref",
  "suppressHydrationWarning",
]);

const MEMO_TYPE = Symbol.for("react.memo");
const FORWARD_REF_TYPE = Symbol.for("react.forward_ref");

type ElementProps = Record<string, unknown> & {
  children?: ReactNode;
  dangerouslySetInnerHTML?: { __html?: string };
};

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function serializeStyle(style: Record<string, unknown>): string {
  const declarations: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "boolean") continue;
    const name = key.startsWith("--")
      ? key
      : key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    const css =
      typeof value === "number" && value !== 0 && !UNITLESS_STYLES.has(key)
        ? `${value}px`
        : String(value);
    declarations.push(`${name}:${css}`);
  }
  return declarations.join(";");
}

function serializeAttributes(props: ElementProps): string {
  let attributes = "";
  for (const [key, value] of Object.entries(props)) {
    if (SKIPPED_PROPS.has(key) || value === null || value === undefined) {
      continue;
    }
    if (typeof value === "function" || typeof value === "symbol") continue;

    if (key === "style") {
      const css =
        typeof value === "object"
          ? serializeStyle(value as Record<string, unknown>)
          : String(value);
      if (css) attributes += ` style="${escapeAttribute(css)}"`;
      continue;
    }

    const name = ATTRIBUTE_ALIASES[key] ?? key;
    if (typeof value === "boolean") {
      if (name.startsWith("aria-") || name.startsWith("data-")) {
        attributes += ` ${name}="${value}"`;
      }
      continue;
    }
    attributes += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  return attributes;
}

function serializeNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string") return escapeText(node);
  if (typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(serializeNode).join("");
  if (!isValidElement(node)) {
    throw new TypeError("Unsupported node in QR SVG output");
  }

  const props = node.props as ElementProps;
  const type = node.type as unknown;

  if (type === Fragment) return serializeNode(props.children);

  if (typeof type === "function") {
    if (
      (type as { prototype?: { isReactComponent?: unknown } }).prototype
        ?.isReactComponent
    ) {
      throw new TypeError("Class components are not supported");
    }
    return serializeNode((type as (p: ElementProps) => ReactNode)(props));
  }

  if (typeof type === "object" && type !== null) {
    const exotic = type as {
      $$typeof?: symbol;
      type?: unknown;
      render?: (p: ElementProps, ref: null) => ReactNode;
    };
    if (exotic.$$typeof === MEMO_TYPE) {
      return serializeNode(
        createElement(exotic.type as (p: ElementProps) => ReactNode, props),
      );
    }
    if (exotic.$$typeof === FORWARD_REF_TYPE && exotic.render) {
      return serializeNode(exotic.render(props, null));
    }
  }

  if (typeof type !== "string") {
    throw new TypeError("Unsupported element type in QR SVG output");
  }

  const attributes = serializeAttributes(props);
  const inner =
    props.dangerouslySetInnerHTML?.__html ?? serializeNode(props.children);
  return inner
    ? `<${type}${attributes}>${inner}</${type}>`
    : `<${type}${attributes}/>`;
}
