// The Get code dialog's snippets: the editor's design and content as code
// for each way developers use QRdx. Pure and client-safe.
//
// Every snippet has to work against what is published today:
// - React and shadcn: npm `qrdx` 0.0.46 (NPM_QRDX below). Props and shapes
//   added to packages/qrdx since then are listed as left out until a newer
//   qrdx is on npm. Check `npm view qrdx version` before widening NPM_QRDX.
// - Image URL: GET https://api.qrdx.dev/v1/qr (app/api/v1/qr/_lib/query.ts).
// - REST API: POST https://api.qrdx.dev/v1/codes (createCodeSchema in
//   app/dashboard/codes/_lib/qr-codes.ts).
// - MCP: the design_qr tool at https://mcp.qrdx.dev/mcp
//   (app/api/mcp/design.ts, lib/qr-design/style.ts).
// - CLI: @qrdx/cli flags (packages/cli/src/commands/generate.ts), hidden
//   behind CLI_TAB_ENABLED.
//
// Never in a snippet: an uploaded logo (a data URL) or art pixels. Each
// serializer lists what its tab can't express in `omitted`, in plain English.

import { getTemplateIds } from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type ColorConfig,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  normalizeColorConfig,
} from "qrdx/types";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { type CodeLang, parseLinkUrl } from "@/lib/playground-links";
import { CONTENT_FIELDS } from "@/lib/qr-design/content";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

/** A tab of the dialog: the link ids, plus the hidden CLI tab. */
export type CodeTab = CodeLang | "cli";

/**
 * The CLI tab is built and tested but hidden: npm @qrdx/cli 0.0.4 is
 * broken. Flip this to true, and add "cli" to CODE_LANGS in
 * lib/playground-links.ts, once @qrdx/cli 0.0.5 or later is on npm (it
 * depends on qrdx 0.0.47, so that has to be published too).
 */
export const CLI_TAB_ENABLED = false;

const SHIPPED_TABS = ["react", "shadcn", "image", "api", "mcp"] as const;

/** The tabs that ship, in tab order (equal to CODE_LANGS). */
export const CODE_TABS: readonly CodeTab[] = CLI_TAB_ENABLED
  ? [...SHIPPED_TABS, "cli"]
  : SHIPPED_TABS;

export const CODE_TAB_LABELS: Record<CodeTab, string> = {
  react: "React",
  shadcn: "shadcn",
  image: "Image URL",
  api: "REST API",
  mcp: "MCP",
  cli: "CLI",
};

export interface SnippetInput {
  style: ThemeStyles;
  /** What the code holds (the editor's value); empty uses SAMPLE_VALUE */
  value: string;
  contentType: ContentType;
  /** The content form's fields for contentType, when known */
  content?: QRContentConfig;
}

export interface Snippet {
  code: string;
  /** What this tab can't express, in plain English ("Gradients") */
  omitted: string[];
}

export interface ImageSnippet extends Snippet {
  /** The image URL on its own */
  url: string;
}

export interface RestSnippet extends Snippet {
  /** Set when no request can be made for this content (code is empty) */
  unavailable?: string;
}

export const SAMPLE_VALUE = "https://example.com";
export const REACT_INSTALL = "npm install qrdx";
export const SHADCN_ITEM_URL = "https://qrdx.dev/r/qr-code.json";
export const SHADCN_INSTALL = `npx shadcn@latest add ${SHADCN_ITEM_URL}`;
export const IMAGE_API_URL = "https://api.qrdx.dev/v1/qr";
export const CODES_API_URL = "https://api.qrdx.dev/v1/codes";
export const MCP_SERVER_URL = "https://mcp.qrdx.dev/mcp";

/**
 * What npm `qrdx` 0.0.46 accepts (dist/types/*.d.ts and
 * dist/src/templates.d.ts of the published package). The React tab and the
 * shadcn registry item both run on it.
 */
export const NPM_QRDX = {
  version: "0.0.46",
  bodyPatterns: [
    "circle",
    "circle-large",
    "square",
    "diamond",
    "circle-mixed",
    "pacman",
    "rounded",
    "small-square",
    "vertical-line",
  ],
  eyePatterns: [
    "square",
    "rounded",
    "gear",
    "circle",
    "diya",
    "extra-rounded",
    "message",
    "pointy",
    "curly",
  ],
  eyeDotPatterns: [
    "square",
    "rounded",
    "circle",
    "diamond",
    "message",
    "message-reverse",
    "diya",
    "diya-reverse",
    "rounded-triangle",
    "star",
    "banner",
  ],
  templates: [
    "default",
    "Arrow",
    "StandardBox",
    "SquareBorder",
    "StrikedBox",
    "Halloween",
  ],
} as const;

/** Plain-English names for what a tab leaves out. */
export const LEFT_OUT = {
  gradients: "Gradients",
  imageGradients: "Gradients (drawn in their first color)",
  gradientMiddle: "Middle gradient colors",
  gradientStops: "Gradient stop positions",
  nonHexColors: "Colors that aren't hex",
  transparency: "Color transparency",
  frame: "The frame",
  customFrame: "The custom frame",
  frameLabelHidden: "Hiding the frame label",
  frameSecondColor: "The frame's second color",
  frameLabelSize: "The frame's label size",
  frameSecondLabel: "The frame's second label",
  logo: "The logo",
  uploadedLogo: "Your logo",
  shadcnNoLogo: "Hiding the logo (it shows the QRdx logo)",
  shadcnUploadedLogo: "Your logo (it shows the QRdx logo)",
  restLogo: "Your logo (it can be large; add customLogo yourself)",
  art: "Art (Logo QR or Image QR)",
  eyeColors: "Per-eye colors",
  moduleScale: "The dot size",
  autoLevel: "Automatic error correction for the logo",
  logoOptions: "The logo's size, position, shape and plate",
  longContent: "Content over 2,048 characters (the image API's limit)",
  privateContent:
    "Your content (image URLs reach a server, so only web addresses go in)",
} as const;

const shapeLeftOut = (part: "dot" | "eye" | "eye center", value: string) =>
  `The "${value}" ${part} shape`;
const borderLeftOut = (id: string) => `The "${id}" border`;

/** What the editor renders when a style field is unset (QRCodeSVG defaults). */
const ENGINE_DEFAULTS = {
  bgColor: "#FFFFFF",
  fgColor: "#000000",
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
  level: "Q",
  margin: 0,
} as const;

const TEMPLATE_IDS = new Set(getTemplateIds());
const MARGIN_MAX = 16;
const IMAGE_DATA_MAX_LENGTH = 2048;

const includes = (list: readonly string[], value: string) =>
  list.includes(value);

/** The value a snippet encodes: the user's content, or the sample. */
const payloadOf = (value: string) => (value.trim() ? value : SAMPLE_VALUE);

/** Unique notes in the order they were added. */
class Notes {
  private items: string[] = [];
  add(note: string) {
    if (!this.items.includes(note)) this.items.push(note);
  }
  get list() {
    return [...this.items];
  }
}

type LogoState =
  | { kind: "none" }
  | { kind: "qrdx" }
  | { kind: "url"; url: string }
  | { kind: "uploaded" };

/**
 * The logo as a snippet may carry it: none, the QRdx mark (what the editor
 * shows without an upload), a web address, or an upload (a data URL, or
 * anything else that isn't a plain https address), which never goes in.
 */
function logoOf(style: ThemeStyles): LogoState {
  if (!style.showLogo) return { kind: "none" };
  const logo = style.customLogo?.trim();
  if (!logo) return { kind: "qrdx" };
  if (/^https:\/\/[^\s"'<>]+$/i.test(logo) && logo.length <= 2048) {
    return { kind: "url", url: logo };
  }
  return { kind: "uploaded" };
}

const hasFrame = (style: ThemeStyles) =>
  Boolean(style.frame && style.frame.style !== "none");

/** The frame, for tabs that can't draw any frame. */
function noteFrame(style: ThemeStyles, notes: Notes) {
  if (!hasFrame(style)) return;
  notes.add(
    style.frame?.style === "custom" ? LEFT_OUT.customFrame : LEFT_OUT.frame,
  );
}

function noteArt(style: ThemeStyles, notes: Notes) {
  if (style.art) notes.add(LEFT_OUT.art);
}

/** Engine options newer than npm qrdx 0.0.46, the image API and MCP. */
function noteEngineOptions(style: ThemeStyles, notes: Notes) {
  const options = styleEngineOptions(style);
  if (options.eyeColors) notes.add(LEFT_OUT.eyeColors);
  if (options.moduleScale !== undefined) notes.add(LEFT_OUT.moduleScale);
  const logo = logoOf(style).kind !== "none";
  if (logo && options.autoLevel) notes.add(LEFT_OUT.autoLevel);
  if (logo && options.logoOptions) notes.add(LEFT_OUT.logoOptions);
}

const roundMargin = (margin: number | undefined) =>
  Math.min(
    MARGIN_MAX,
    Math.max(0, Math.round(margin ?? ENGINE_DEFAULTS.margin)),
  );

// ─── React and shadcn (npm qrdx 0.0.46) ──────────────────────────────────────

const PROP_INDENT = "      ";
/** Characters that need a JSX expression instead of a "string" attribute. */
const JSX_UNSAFE = /["&{}<>\\\r\n]/;

const jsxString = (name: string, value: string) =>
  JSX_UNSAFE.test(value)
    ? `${name}={${JSON.stringify(value)}}`
    : `${name}="${value}"`;

/** A color prop: `fgColor="#000"` or a gradient object literal. */
function colorProp(name: string, color: ColorConfig): string {
  const paint = normalizeColorConfig(color);
  if (paint.type === "solid") return jsxString(name, paint.color);
  const inner = `${PROP_INDENT}  `;
  const lines = [
    `${name}={{`,
    `${inner}type: "${paint.type}",`,
    `${inner}stops: [`,
    ...paint.stops.map(
      (stop) =>
        `${inner}  { color: ${JSON.stringify(stop.color)}, offset: ${stop.offset} },`,
    ),
    `${inner}],`,
  ];
  if (paint.type === "linear")
    lines.push(`${inner}angle: ${paint.angle ?? 0},`);
  lines.push(`${PROP_INDENT}}}`);
  return lines.join("\n");
}

/**
 * Color, shape, level and border props npm qrdx 0.0.46 takes, shared by
 * the React and shadcn tabs. Shapes and borders it doesn't know are left
 * out (the component then draws its default).
 */
function npmStyleProps(style: ThemeStyles, notes: Notes): string[] {
  const props: string[] = [];
  for (const key of ["bgColor", "fgColor", "eyeColor", "dotColor"] as const) {
    const color = style[key];
    if (color !== undefined) props.push(colorProp(key, color));
  }
  const shapes = [
    ["bodyPattern", style.bodyPattern, NPM_QRDX.bodyPatterns, "dot"],
    ["cornerEyePattern", style.cornerEyePattern, NPM_QRDX.eyePatterns, "eye"],
    [
      "cornerEyeDotPattern",
      style.cornerEyeDotPattern,
      NPM_QRDX.eyeDotPatterns,
      "eye center",
    ],
  ] as const;
  for (const [name, value, known, part] of shapes) {
    if (value === undefined) continue;
    if (includes(known, value)) props.push(jsxString(name, value));
    else notes.add(shapeLeftOut(part, value));
  }
  if (style.level) props.push(jsxString("level", style.level));
  const template = style.templateId;
  if (template && template !== "default") {
    if (includes(NPM_QRDX.templates, template)) {
      props.push(jsxString("templateId", template));
    } else {
      notes.add(borderLeftOut(template));
    }
  }
  return props;
}

function component(imports: string, tag: string, props: string[]): string {
  return `${imports}

export function MyQRCode() {
  return (
    <${tag}
${props.map((prop) => `${PROP_INDENT}${prop}`).join("\n")}
    />
  );
}`;
}

/** `<QRCode … />` from npm qrdx, with the props 0.0.46 has. */
export function reactSnippet(input: SnippetInput): Snippet {
  const { style } = input;
  const notes = new Notes();
  const props = [jsxString("value", payloadOf(input.value))];
  props.push(...npmStyleProps(style, notes));
  // 0.0.46 defaults to a quiet zone of 0, like the editor.
  if (style.margin) props.push(`margin={${style.margin}}`);
  noteFrame(style, notes);

  // 0.0.46 draws the QRdx logo unless told not to, so "no logo" is explicit.
  const logo = logoOf(style);
  if (logo.kind === "qrdx") props.push(jsxString("logo", DEFAULT_QR_LOGO));
  else if (logo.kind === "url") props.push(jsxString("logo", logo.url));
  else props.push("hideLogo");
  if (logo.kind === "uploaded") notes.add(LEFT_OUT.uploadedLogo);
  noteArt(style, notes);
  noteEngineOptions(style, notes);

  return {
    code: component('import { QRCode } from "qrdx";', "QRCode", props),
    omitted: notes.list,
  };
}

export interface ShadcnSnippet extends Snippet {
  install: string;
}

/**
 * The shadcn registry's `qr-code` item (registry/qrdx/qr-code.tsx) with
 * this style. It runs on npm qrdx, and has no way to hide the logo.
 */
export function shadcnSnippet(input: SnippetInput): ShadcnSnippet {
  const { style } = input;
  const notes = new Notes();
  const props = [jsxString("value", payloadOf(input.value))];
  props.push(...npmStyleProps(style, notes));
  // The item's own default is 2, so the editor's quiet zone always goes in.
  props.push(`margin={${style.margin ?? ENGINE_DEFAULTS.margin}}`);
  noteFrame(style, notes);

  const logo = logoOf(style);
  if (logo.kind === "qrdx") props.push(jsxString("logo", DEFAULT_QR_LOGO));
  else if (logo.kind === "url") props.push(jsxString("logo", logo.url));
  else if (logo.kind === "uploaded") notes.add(LEFT_OUT.shadcnUploadedLogo);
  else notes.add(LEFT_OUT.shadcnNoLogo);
  noteArt(style, notes);
  noteEngineOptions(style, notes);

  return {
    install: SHADCN_INSTALL,
    code: component(
      'import { QrCode } from "@/components/qr-code";',
      "QrCode",
      props,
    ),
    omitted: notes.list,
  };
}

// ─── Image URL (GET /v1/qr) ──────────────────────────────────────────────────

/** Colors the image API accepts (lib/qr-render.ts), with or without `#`. */
const IMAGE_HEX = /^#?(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** The image API's defaults (QR_DEFAULTS in lib/qr-render.ts). */
const IMAGE_DEFAULTS = {
  fg: "000000",
  bg: "ffffff",
  body: "square",
  eye: "square",
  dot: "square",
  level: "Q",
  margin: 4,
} as const;

/** `#RGB` → `RRGGBB`, lower case, without `#`, for comparisons. */
function hexKey(hex: string): string {
  const bare = hex.replace(/^#/, "").toLowerCase();
  return bare.length === 3 || bare.length === 4
    ? [...bare].map((char) => char + char).join("")
    : bare;
}

/** A color as an image API value (hex without `#`), or undefined. */
function imageColor(
  color: ColorConfig | undefined,
  notes: Notes,
): string | undefined {
  if (color === undefined) return undefined;
  const paint = normalizeColorConfig(color);
  const solid = paint.type === "solid" ? paint.color : paint.stops[0]?.color;
  if (paint.type !== "solid") notes.add(LEFT_OUT.imageGradients);
  if (!(solid && IMAGE_HEX.test(solid.trim()))) {
    notes.add(LEFT_OUT.nonHexColors);
    return undefined;
  }
  return solid.trim().replace(/^#/, "").toLowerCase();
}

/**
 * An image URL for this design. The image API draws solid hex colors,
 * shapes, a border template, the level and the quiet zone; no gradients,
 * logo, frame or art.
 */
export function imageSnippet(input: SnippetInput): ImageSnippet {
  const { style } = input;
  const notes = new Notes();
  // An image URL is fetched from api.qrdx.dev and sits in someone's page:
  // only a web address may go in it, never Wi-Fi passwords, contact
  // details or other form content (the sample stands in for those).
  const ownValue = input.value.trim();
  const webAddress = ownValue ? parseLinkUrl(ownValue) : null;
  if (ownValue && !webAddress) {
    notes.add(
      ownValue.length > IMAGE_DATA_MAX_LENGTH
        ? LEFT_OUT.longContent
        : LEFT_OUT.privateContent,
    );
  }
  const data = webAddress ? ownValue : SAMPLE_VALUE;
  const params = new URLSearchParams({ data });

  const fg = imageColor(style.fgColor ?? ENGINE_DEFAULTS.fgColor, notes);
  const bg = imageColor(style.bgColor ?? ENGINE_DEFAULTS.bgColor, notes);
  if (fg && hexKey(fg) !== IMAGE_DEFAULTS.fg) params.set("fg", fg);
  if (bg && hexKey(bg) !== IMAGE_DEFAULTS.bg) params.set("bg", bg);
  const fgKey = hexKey(fg ?? IMAGE_DEFAULTS.fg);
  for (const key of ["eyeColor", "dotColor"] as const) {
    const color = imageColor(style[key], notes);
    // Both default to the foreground color.
    if (color && hexKey(color) !== fgKey) params.set(key, color);
  }

  const shapes = [
    ["body", style.bodyPattern ?? ENGINE_DEFAULTS.bodyPattern, BODY_PATTERN],
    [
      "eye",
      style.cornerEyePattern ?? ENGINE_DEFAULTS.cornerEyePattern,
      cornerEyePatternSchema.options,
    ],
    [
      "dot",
      style.cornerEyeDotPattern ?? ENGINE_DEFAULTS.cornerEyeDotPattern,
      cornerEyeDotPatternSchema.options,
    ],
  ] as const;
  for (const [name, value, known] of shapes) {
    if (!includes(known, value)) {
      notes.add(
        shapeLeftOut(
          name === "body" ? "dot" : name === "eye" ? "eye" : "eye center",
          value,
        ),
      );
    } else if (value !== IMAGE_DEFAULTS[name]) {
      params.set(name, value);
    }
  }

  const level = style.level ?? ENGINE_DEFAULTS.level;
  if (level !== IMAGE_DEFAULTS.level) params.set("level", level);
  const margin = roundMargin(style.margin);
  if (margin !== IMAGE_DEFAULTS.margin) params.set("margin", String(margin));
  const template = style.templateId;
  if (template && template !== "default") {
    if (TEMPLATE_IDS.has(template)) params.set("template", template);
    else notes.add(borderLeftOut(template));
  }

  noteFrame(style, notes);
  const logo = logoOf(style);
  if (logo.kind === "uploaded") notes.add(LEFT_OUT.uploadedLogo);
  else if (logo.kind !== "none") notes.add(LEFT_OUT.logo);
  noteArt(style, notes);
  noteEngineOptions(style, notes);

  const url = `${IMAGE_API_URL}?${params.toString()}`;
  return {
    url,
    code: `<img
  src="${url}"
  width="256"
  height="256"
  alt="QR code"
/>`,
    omitted: notes.list,
  };
}

// ─── JSON (REST and MCP) ─────────────────────────────────────────────────────

const JSON_INLINE_MAX = 72;

/**
 * JSON with two-space indents, with short objects and arrays of plain
 * values on one line (`{ "color": "#000000", "offset": 0 }`).
 */
export function formatJson(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  const isArray = Array.isArray(value);
  const entries: [string | null, unknown][] = isArray
    ? value.map((item) => [null, item])
    : Object.entries(value).filter(([, item]) => item !== undefined);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return `${open}${close}`;
  const inner = `${indent}  `;
  const parts = entries.map(
    ([key, item]) =>
      `${key === null ? "" : `${JSON.stringify(key)}: `}${formatJson(item, inner)}`,
  );
  const flat = entries.every(
    ([, item]) => item === null || typeof item !== "object",
  );
  if (flat) {
    const line = isArray ? `[${parts.join(", ")}]` : `{ ${parts.join(", ")} }`;
    if (indent.length + line.length <= JSON_INLINE_MAX) return line;
  }
  return `${open}\n${parts.map((part) => inner + part).join(",\n")}\n${indent}${close}`;
}

// ─── REST API (POST /v1/codes) ───────────────────────────────────────────────

/** Shell single quotes around `text`. */
const singleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

export const REST_UNAVAILABLE =
  "The API makes dynamic codes, and those open a link. Switch the content type to URL to get a request for this design.";

/**
 * `curl` for POST /v1/codes: a dynamic code that opens the URL content,
 * with this style. The logo image and art stay out (both can be large, and
 * art is image pixels).
 */
export function restSnippet(input: SnippetInput): RestSnippet {
  if (input.contentType !== "url") {
    return { code: "", omitted: [], unavailable: REST_UNAVAILABLE };
  }
  const notes = new Notes();
  // The destination, not the value: with a dynamic link on, the value is
  // the short link, and a code can't point to another QRdx short link.
  const destination =
    (input.content?.type === "url" ? input.content.url.trim() : "") ||
    input.value.trim() ||
    SAMPLE_VALUE;

  const { customLogo, art, ...rest } = input.style;
  const style: ThemeStyles = { ...rest };
  if (customLogo && rest.showLogo) {
    // Without the image, showLogo would draw the QRdx logo instead.
    style.showLogo = false;
    notes.add(LEFT_OUT.restLogo);
  }
  if (art) notes.add(LEFT_OUT.art);

  const body = formatJson({ destinationUrl: destination, style });
  return {
    code: [
      `curl -X POST ${CODES_API_URL} \\`,
      `  -H "Authorization: Bearer $QRDX_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d ${singleQuote(body)}`,
    ].join("\n"),
    omitted: notes.list,
  };
}

// ─── MCP (design_qr) ─────────────────────────────────────────────────────────

/** design_qr takes #RRGGBB only (HEX_COLOR in lib/qr-design/style.ts). */
function mcpHex(color: string, notes: Notes): string | undefined {
  const value = color.trim();
  if (!IMAGE_HEX.test(value) || !value.startsWith("#")) {
    notes.add(LEFT_OUT.nonHexColors);
    return undefined;
  }
  const full = hexKey(value);
  if (full.length === 8 && !full.endsWith("ff")) {
    notes.add(LEFT_OUT.transparency);
  }
  return `#${full.slice(0, 6).toUpperCase()}`;
}

interface McpGradient {
  type: "linear" | "radial";
  from: string;
  to: string;
  angle?: number;
}

/** A part's solid color and two-color gradient in design_qr's vocabulary. */
function mcpPaint(
  color: ColorConfig,
  fallback: string,
  notes: Notes,
): { solid: string; gradient?: McpGradient } {
  const paint = normalizeColorConfig(color, fallback);
  if (paint.type === "solid") {
    return { solid: mcpHex(paint.color, notes) ?? fallback };
  }
  const stops = [...paint.stops].sort((a, b) => a.offset - b.offset);
  const first = stops[0];
  const last = stops.at(-1);
  const from = first && mcpHex(first.color, notes);
  const to = last && mcpHex(last.color, notes);
  if (!(first && last && from && to)) {
    notes.add(LEFT_OUT.gradients);
    return { solid: from ?? fallback };
  }
  if (stops.length > 2) notes.add(LEFT_OUT.gradientMiddle);
  if (first.offset !== 0 || last.offset !== 100) {
    notes.add(LEFT_OUT.gradientStops);
  }
  const gradient: McpGradient =
    paint.type === "linear"
      ? {
          type: "linear",
          from,
          to,
          angle: Math.round((((paint.angle ?? 0) % 360) + 360) % 360),
        }
      : { type: "radial", from, to };
  return { solid: from, gradient };
}

/** design_qr's `content`: the form's fields, or the payload as text. */
function mcpContent(input: SnippetInput): Record<string, string | boolean> {
  const value = input.value;
  if (!value.trim()) return { type: "url", url: SAMPLE_VALUE };
  if (input.contentType === "url") return { type: "url", url: value };
  const content = input.content;
  if (content && content.type === input.contentType) {
    const fields: Record<string, string | boolean> = {
      type: input.contentType,
    };
    const raw = content as unknown as Record<string, unknown>;
    for (const field of CONTENT_FIELDS[input.contentType]) {
      const fieldValue = raw[field.name];
      if (typeof fieldValue === "string" && fieldValue.trim()) {
        fields[field.name] = fieldValue;
      } else if (fieldValue === true) {
        fields[field.name] = true;
      }
    }
    if (Object.keys(fields).length > 1) return fields;
  }
  // The same payload as plain text scans the same.
  return { type: "text", text: value };
}

/**
 * Arguments for the MCP `design_qr` tool. Its vocabulary: #RRGGBB colors,
 * two-color gradients, the offered shapes, built-in frames and borders.
 * It has no logo, art or custom frames.
 */
export function mcpSnippet(input: SnippetInput): Snippet {
  const { style } = input;
  const notes = new Notes();

  const fgColor = style.fgColor ?? ENGINE_DEFAULTS.fgColor;
  const parts = [
    ["bgColor", "background", style.bgColor ?? ENGINE_DEFAULTS.bgColor],
    ["fgColor", "body", fgColor],
    ["eyeColor", "eyes", style.eyeColor ?? fgColor],
    ["dotColor", "eyeCentres", style.dotColor ?? fgColor],
  ] as const;
  const design: Record<string, unknown> = {};
  const gradients: Record<string, McpGradient> = {};
  for (const [key, part, color] of parts) {
    const fallback =
      key === "bgColor" ? ENGINE_DEFAULTS.bgColor : ENGINE_DEFAULTS.fgColor;
    const paint = mcpPaint(color, fallback, notes);
    design[key] = paint.solid;
    if (paint.gradient) gradients[part] = paint.gradient;
  }

  const shapes = [
    [
      "bodyPattern",
      style.bodyPattern ?? ENGINE_DEFAULTS.bodyPattern,
      BODY_PATTERN,
      "dot",
    ],
    [
      "cornerEyePattern",
      style.cornerEyePattern ?? ENGINE_DEFAULTS.cornerEyePattern,
      CORNER_EYE_PATTERNS,
      "eye",
    ],
    [
      "cornerEyeDotPattern",
      style.cornerEyeDotPattern ?? ENGINE_DEFAULTS.cornerEyeDotPattern,
      CORNER_EYE_DOT_PATTERNS,
      "eye center",
    ],
  ] as const;
  for (const [key, value, offered, part] of shapes) {
    // Retired shapes (curly; diamond, star, banner) aren't offered.
    if (includes(offered, value)) design[key] = value;
    else notes.add(shapeLeftOut(part, value));
  }
  if (Object.keys(gradients).length > 0) design.gradients = gradients;
  design.margin = roundMargin(style.margin);
  design.level = style.level ?? ENGINE_DEFAULTS.level;
  const template = style.templateId;
  if (template && template !== "default") {
    if (TEMPLATE_IDS.has(template)) design.templateId = template;
    else notes.add(borderLeftOut(template));
  }

  const frame = style.frame;
  if (frame && frame.style !== "none") {
    if (frame.style === "custom") {
      notes.add(LEFT_OUT.customFrame);
    } else {
      const out: Record<string, string> = { style: frame.style };
      // design_qr draws "Scan me" for an empty label.
      if (frame.text !== undefined) {
        if (frame.text.trim()) out.text = frame.text;
        else notes.add(LEFT_OUT.frameLabelHidden);
      }
      if (frame.secondaryText?.trim()) out.secondaryText = frame.secondaryText;
      for (const key of ["color", "textColor"] as const) {
        const color = frame[key];
        if (!color) continue;
        const hex = mcpHex(color, notes);
        if (hex) out[key] = hex;
      }
      if (frame.secondaryColor) notes.add(LEFT_OUT.frameSecondColor);
      if (frame.fontScale !== undefined && frame.fontScale !== 1) {
        notes.add(LEFT_OUT.frameLabelSize);
      }
      design.frame = out;
    }
  }

  if (logoOf(style).kind !== "none") notes.add(LEFT_OUT.logo);
  noteArt(style, notes);
  noteEngineOptions(style, notes);

  return {
    code: formatJson({ content: mcpContent(input), style: design }),
    omitted: notes.list,
  };
}

// ─── CLI (hidden until CLI_TAB_ENABLED) ──────────────────────────────────────

/** Arguments the shell passes through unquoted. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const shellArg = (value: string) =>
  SHELL_SAFE.test(value) ? value : singleQuote(value);

/** --fg and friends take a CSS color or a gradient as JSON. */
function cliColor(color: ColorConfig): string {
  const paint = normalizeColorConfig(color);
  return shellArg(paint.type === "solid" ? paint.color : JSON.stringify(paint));
}

/** Hex colors the CLI's --frame-color and --frame-text-color accept. */
const CLI_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `npx @qrdx/cli generate …`. Every option it can take is passed, because
 * in a terminal the CLI asks for any option left out. It still asks for a
 * border when the design has none (it has no `--template none`) and for a
 * shape it no longer offers.
 */
export function cliSnippet(input: SnippetInput): Snippet {
  const { style } = input;
  const notes = new Notes();
  const fg = style.fgColor ?? ENGINE_DEFAULTS.fgColor;

  const shapeFlags: string[] = [];
  const shapes = [
    ["--body", style.bodyPattern ?? ENGINE_DEFAULTS.bodyPattern, BODY_PATTERN],
    [
      "--eye",
      style.cornerEyePattern ?? ENGINE_DEFAULTS.cornerEyePattern,
      CORNER_EYE_PATTERNS,
    ],
    [
      "--dot",
      style.cornerEyeDotPattern ?? ENGINE_DEFAULTS.cornerEyeDotPattern,
      CORNER_EYE_DOT_PATTERNS,
    ],
  ] as const;
  for (const [flag, value, offered] of shapes) {
    if (includes(offered, value)) shapeFlags.push(`${flag} ${value}`);
    else {
      notes.add(
        shapeLeftOut(
          flag === "--body" ? "dot" : flag === "--eye" ? "eye" : "eye center",
          value,
        ),
      );
    }
  }

  const colorFlags = [
    `--fg ${cliColor(fg)}`,
    `--bg ${cliColor(style.bgColor ?? ENGINE_DEFAULTS.bgColor)}`,
    `--eye-color ${cliColor(style.eyeColor ?? fg)}`,
    `--dot-color ${cliColor(style.dotColor ?? fg)}`,
  ];

  const otherFlags = [
    `--level ${style.level ?? ENGINE_DEFAULTS.level}`,
    `--margin ${roundMargin(style.margin)}`,
  ];
  const template = style.templateId;
  if (template && template !== "default") {
    if (TEMPLATE_IDS.has(template)) otherFlags.push(`--template ${template}`);
    else notes.add(borderLeftOut(template));
  }

  const frameFlags: string[] = [];
  const frame = style.frame;
  if (frame && frame.style !== "none" && frame.style !== "custom") {
    frameFlags.push(`--frame ${frame.style}`);
    // "" hides the label, as in the editor.
    if (frame.text !== undefined) {
      frameFlags.push(`--frame-text ${shellArg(frame.text)}`);
    }
    for (const [key, flag] of [
      ["color", "--frame-color"],
      ["textColor", "--frame-text-color"],
    ] as const) {
      const color = frame[key];
      if (!color) continue;
      if (CLI_HEX.test(color)) frameFlags.push(`${flag} ${shellArg(color)}`);
      else notes.add(LEFT_OUT.nonHexColors);
    }
    if (frame.secondaryText?.trim()) notes.add(LEFT_OUT.frameSecondLabel);
    if (frame.secondaryColor) notes.add(LEFT_OUT.frameSecondColor);
    if (frame.fontScale !== undefined && frame.fontScale !== 1) {
      notes.add(LEFT_OUT.frameLabelSize);
    }
  } else {
    if (frame?.style === "custom") notes.add(LEFT_OUT.customFrame);
    frameFlags.push("--frame none");
  }

  const logo = logoOf(style);
  if (logo.kind === "qrdx") frameFlags.push(`--logo ${DEFAULT_QR_LOGO}`);
  else if (logo.kind === "url") frameFlags.push(`--logo ${shellArg(logo.url)}`);
  else frameFlags.push("--no-logo");
  if (logo.kind === "uploaded") notes.add(LEFT_OUT.uploadedLogo);
  noteArt(style, notes);
  noteEngineOptions(style, notes);

  const lines = [
    `npx @qrdx/cli generate ${shellArg(payloadOf(input.value))} -o qr.svg`,
    shapeFlags.join(" "),
    colorFlags.slice(0, 2).join(" "),
    colorFlags.slice(2).join(" "),
    otherFlags.join(" "),
    frameFlags.join(" "),
  ].filter(Boolean);
  return { code: lines.join(" \\\n  "), omitted: notes.list };
}
