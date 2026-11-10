// The Get code dialog's snippets: the editor's design and content as code
// for each way developers use QRdx. Pure and client-safe.
//
// Every snippet has to work against what is published today:
// - React and shadcn: npm `qrdx` 0.0.46 (NPM_QRDX below). Props and shapes
//   added to packages/qrdx since then are listed as left out until a newer
//   qrdx is on npm. Check `npm view qrdx version` before widening NPM_QRDX.
// - Image URL: GET https://api.qrdx.dev/v1/qr (app/api/v1/qr/_lib/query.ts):
//   flat parameters where they say it, and `style` (lib/qr-api/style.ts) for
//   gradients, other colors and frames with more than a label.
// - REST API: POST https://api.qrdx.dev/v1/codes (createCodeSchema in
//   app/dashboard/codes/_lib/qr-codes.ts, logo fields in
//   app/api/v1/codes/_lib/style.ts).
// - MCP: the design_qr tool at https://mcp.qrdx.dev/mcp
//   (app/api/mcp/design.ts, lib/qr-design/style.ts).
// - CLI: @qrdx/cli flags (packages/cli/src/commands/generate.ts), shown
//   while CLI_TAB_ENABLED is on.
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
  type LinearGradient,
  normalizeColorConfig,
  type RadialGradient,
} from "qrdx/types";
import { presetLogoIcon } from "@/lib/community/public-style";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import {
  hasImageFills,
  hasSilhouette,
  withoutImageFills,
} from "@/lib/paint/image-fills";
import { type CodeLang, parseLinkUrl } from "@/lib/playground-links";
import { GRADIENT_STOPS_MAX, isSafeColor } from "@/lib/qr-api/style";
import { CONTENT_FIELDS } from "@/lib/qr-design/content";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { LogoIconId } from "@/lib/qr-design/style";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

/** A tab of the dialog: the link ids (the CLI tab included). */
export type CodeTab = CodeLang | "cli";

/**
 * The CLI tab ships now that @qrdx/cli 0.0.5 (with qrdx 0.0.47) is on npm;
 * npm @qrdx/cli 0.0.4 was broken. To hide it again, set this to false and
 * take "cli" out of CODE_LANGS in lib/playground-links.ts.
 */
export const CLI_TAB_ENABLED = true;

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
  imageGradients: `Gradients with more than ${GRADIENT_STOPS_MAX} colors (drawn in their first color)`,
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
  restLogo:
    "Your logo (upload it in Dashboard → Files and send its id as logoFileId)",
  qrdxLogo: "The QRdx logo (the API doesn't draw it)",
  imageUploadedLogo:
    "Your logo (the image API draws an uploaded logo only for requests with your API key, by logoFileId, so a public image URL can't carry it)",
  mcpUploadedLogo:
    "Your logo (upload it in Dashboard → Files and pass its id as logo_file_id, with your API key on the connection)",
  art: "Art (Logo QR or Image QR)",
  eyeColors: "Per-eye colors",
  moduleScale: "The dot size",
  autoLevel: "Automatic error correction for the logo",
  logoOptions: "The logo's size, position, shape and plate",
  shape: "The code shape",
  silhouette:
    "Your code shape (traced from your picture, it stays with your design)",
  apiArt:
    "Art (Logo QR or Image QR: it's built from your picture in the browser, and the API doesn't build art)",
  unsafeColors: "Colors the API doesn't take",
  customFrameTooLarge: "The custom frame (too large for an image URL)",
  eyeGradients: "Gradients on single eyes (drawn in their first color)",
  angularGradients: "Angular gradients (drawn in their first color)",
  imageFills:
    "Image fills (an uploaded picture never goes in a snippet; drawn in their underlay color)",
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
  if (hasSilhouette(style)) notes.add(LEFT_OUT.silhouette);
  else if (options.shape) notes.add(LEFT_OUT.shape);
}

/** A traced silhouette, for the API tabs: it never leaves the editor. */
function noteSilhouette(style: ThemeStyles, notes: Notes) {
  if (hasSilhouette(style)) notes.add(LEFT_OUT.silhouette);
}

/** Art, for the API tabs: they can't draw it, and say why. */
function noteApiArt(style: ThemeStyles, notes: Notes) {
  if (style.art) notes.add(LEFT_OUT.apiArt);
}

/** The editor's quick logo icon the style shows, by id. */
function logoIconOf(style: ThemeStyles): LogoIconId | null {
  return style.showLogo ? presetLogoIcon(style.customLogo) : null;
}

/**
 * Engine options for the API tabs (per-eye colors, dot size, auto error
 * correction, the circle shape and, with a logo the tab draws, its layout).
 * `color` turns each eye color into what the tab takes, or undefined.
 */
function apiEngineOptions(
  style: ThemeStyles,
  drawsLogo: boolean,
  color: (value: ColorConfig) => ColorConfig | undefined,
): Record<string, unknown> {
  const options = styleEngineOptions(style);
  const out: Record<string, unknown> = {};
  if (options.eyeColors) {
    const eyes: Record<string, Record<string, ColorConfig>> = {};
    for (const [position, eye] of Object.entries(options.eyeColors)) {
      const parts: Record<string, ColorConfig> = {};
      for (const part of ["outer", "inner"] as const) {
        const value = eye?.[part];
        const converted = value === undefined ? undefined : color(value);
        if (converted !== undefined) parts[part] = converted;
      }
      if (Object.keys(parts).length > 0) eyes[position] = parts;
    }
    if (Object.keys(eyes).length > 0) out.eyeColors = eyes;
  }
  if (options.moduleScale !== undefined) out.moduleScale = options.moduleScale;
  // Named shapes only: a traced silhouette stays with the design
  if (typeof options.shape === "string") out.shape = options.shape;
  if (drawsLogo && options.autoLevel) out.autoLevel = true;
  if (drawsLogo && options.logoOptions) {
    const { plate, ...layout } = options.logoOptions;
    out.logoOptions = {
      ...layout,
      ...(plate && isSafeColor(plate.trim()) ? { plate: plate.trim() } : {}),
    };
  }
  return out;
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

/** A paint the published packages, the image API and MCP take. */
type PublishedPaint =
  | { type: "solid"; color: string }
  | LinearGradient
  | RadialGradient;

/**
 * `color` as the published packages, the image API and MCP take it: they
 * have no angular gradient yet (drawn in its first color), and an image
 * fill is an upload a snippet never carries (drawn in its underlay, or
 * `fallback`). Both are noted.
 */
function publishedNormalized(
  color: ColorConfig,
  notes: Notes,
  fallback = "#000000",
): PublishedPaint {
  const paint = normalizeColorConfig(color, fallback);
  if (paint.type === "angular") {
    notes.add(LEFT_OUT.angularGradients);
    return { type: "solid", color: paint.stops[0]?.color ?? fallback };
  }
  if (paint.type === "image") {
    notes.add(LEFT_OUT.imageFills);
    return { type: "solid", color: paint.underlay ?? fallback };
  }
  return paint;
}

/** `style` without image fills (noted): a snippet never carries a picture. */
function snippetStyle(style: ThemeStyles, notes: Notes): ThemeStyles {
  if (hasImageFills(style)) notes.add(LEFT_OUT.imageFills);
  noteSilhouette(style, notes);
  return withoutImageFills(style);
}

/** A color prop: `fgColor="#000"` or a gradient object literal. */
function colorProp(name: string, paint: PublishedPaint): string {
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
    if (color !== undefined) {
      props.push(colorProp(key, publishedNormalized(color, notes)));
    }
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

/** Longest `style` value (STYLE_QUERY_MAX_LENGTH in app/api/v1/qr/_lib/query.ts). */
const IMAGE_STYLE_MAX_LENGTH = 8192;

/**
 * A color for the image API: a flat hex value when it is one, else for
 * `style` (gradients up to GRADIENT_STOPS_MAX stops, rgb()/hsl(), names).
 * Undefined when the API can't take it.
 */
function imagePaint(
  color: ColorConfig | undefined,
  notes: Notes,
): { flat: string } | { style: ColorConfig } | undefined {
  if (color === undefined) return undefined;
  const paint = publishedNormalized(color, notes);
  const solid = (value: string) => {
    const trimmed = value.trim();
    if (IMAGE_HEX.test(trimmed)) {
      return { flat: trimmed.replace(/^#/, "").toLowerCase() };
    }
    if (isSafeColor(trimmed)) return { style: trimmed };
    notes.add(LEFT_OUT.unsafeColors);
    return undefined;
  };
  if (paint.type === "solid") return solid(paint.color);
  const stops = paint.stops.map((stop) => ({
    color: stop.color.trim(),
    offset: stop.offset,
  }));
  if (
    stops.length > GRADIENT_STOPS_MAX ||
    !stops.every((stop) => isSafeColor(stop.color))
  ) {
    notes.add(LEFT_OUT.imageGradients);
    return stops[0] ? solid(stops[0].color) : undefined;
  }
  return {
    style:
      paint.type === "linear"
        ? {
            type: "linear",
            angle: Math.round((((paint.angle ?? 0) % 360) + 360) % 360),
            stops,
          }
        : { type: "radial", stops },
  };
}

/** A frame color the API takes, or undefined (noted). */
function frameColor(color: string | undefined, notes: Notes) {
  if (!color) return undefined;
  if (isSafeColor(color.trim())) return color.trim();
  notes.add(LEFT_OUT.unsafeColors);
  return undefined;
}

/**
 * An image URL for this design. Flat parameters carry what they can (hex
 * colors, shapes, the level, the quiet zone, the border, a frame with its
 * label, a quick logo icon); `style` carries gradients, other colors and a
 * frame with more than a label, custom frames included.
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
  const styleParam: Record<string, unknown> = {};

  const fg = imagePaint(style.fgColor ?? ENGINE_DEFAULTS.fgColor, notes);
  const bg = imagePaint(style.bgColor ?? ENGINE_DEFAULTS.bgColor, notes);
  if (fg && "flat" in fg) {
    if (hexKey(fg.flat) !== IMAGE_DEFAULTS.fg) params.set("fg", fg.flat);
  } else if (fg) styleParam.fgColor = fg.style;
  if (bg && "flat" in bg) {
    if (hexKey(bg.flat) !== IMAGE_DEFAULTS.bg) params.set("bg", bg.flat);
  } else if (bg) styleParam.bgColor = bg.style;
  const fgKey = fg && "flat" in fg ? hexKey(fg.flat) : null;
  for (const key of ["eyeColor", "dotColor"] as const) {
    const color = imagePaint(style[key], notes);
    if (!color) continue;
    // Both default to the foreground color.
    if ("flat" in color) {
      if (hexKey(color.flat) !== fgKey) params.set(key, color.flat);
    } else {
      styleParam[key] = color.style;
    }
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

  const frame = style.frame;
  if (frame && frame.style !== "none") {
    const extras =
      frame.style === "custom" ||
      frame.color ||
      frame.textColor ||
      frame.secondaryColor ||
      frame.secondaryText ||
      frame.fontScale !== undefined;
    if (!extras) {
      params.set("frame", frame.style);
      if (frame.text !== undefined) params.set("frameText", frame.text);
    } else {
      const { color, textColor, secondaryColor, ...rest } = frame;
      const colors = Object.entries({ color, textColor, secondaryColor })
        .map(([key, value]) => [key, frameColor(value, notes)] as const)
        .filter(([, value]) => value);
      styleParam.frame = { ...rest, ...Object.fromEntries(colors) };
    }
  }

  const icon = logoIconOf(style);
  const logo = logoOf(style);
  if (icon) params.set("logoIcon", icon);
  else if (logo.kind === "qrdx") notes.add(LEFT_OUT.qrdxLogo);
  else if (logo.kind !== "none") notes.add(LEFT_OUT.imageUploadedLogo);
  noteApiArt(style, notes);
  noteSilhouette(style, notes);
  Object.assign(
    styleParam,
    apiEngineOptions(style, Boolean(icon), (color) => {
      const paint = imagePaint(color, notes);
      return paint && "flat" in paint ? `#${paint.flat}` : paint?.style;
    }),
  );

  if (Object.keys(styleParam).length > 0) {
    let json = JSON.stringify(styleParam);
    if (json.length > IMAGE_STYLE_MAX_LENGTH && styleParam.frame) {
      delete styleParam.frame;
      notes.add(
        frame?.style === "custom"
          ? LEFT_OUT.customFrameTooLarge
          : LEFT_OUT.frame,
      );
      json = JSON.stringify(styleParam);
    }
    if (Object.keys(styleParam).length > 0) params.set("style", json);
  }

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

/** The id in a link to one of QRdx's uploaded files (/api/files/<id>). */
function uploadedFileId(logo: string | undefined): string | null {
  const match = /^https:\/\/[^/\s]+\/api\/files\/([a-z0-9]{20,40})$/.exec(
    logo?.trim() ?? "",
  );
  return match?.[1] ?? null;
}

/**
 * `curl` for POST /v1/codes: a dynamic code that opens the URL content,
 * with this style. A quick logo icon goes as logoIcon and an uploaded
 * file's link as logoFileId; other logo images and art stay out (both can
 * be large, and art is image pixels).
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

  const { customLogo, art, ...rest } = snippetStyle(input.style, notes);
  const style: ThemeStyles & { logoIcon?: LogoIconId; logoFileId?: string } = {
    ...rest,
  };
  const icon = logoIconOf(input.style);
  const fileId = rest.showLogo ? uploadedFileId(customLogo) : null;
  if (icon) style.logoIcon = icon;
  else if (fileId) style.logoFileId = fileId;
  else if (customLogo && rest.showLogo) {
    // Without the image, showLogo would draw the QRdx logo instead.
    style.showLogo = false;
    notes.add(LEFT_OUT.restLogo);
  }
  if (art) notes.add(LEFT_OUT.apiArt);

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
  const paint = publishedNormalized(color, notes, fallback);
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
 * two-color gradients, the offered shapes, built-in and custom frames,
 * borders and the quick logo icons. An uploaded logo goes by
 * logo_file_id with an API key, and art isn't drawn.
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
    const out: Record<string, unknown> = { style: frame.style };
    // A custom frame is drawn from its spec (checked by design_qr).
    if (frame.style === "custom") out.spec = frame.spec;
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

  const icon = logoIconOf(style);
  const logo = logoOf(style);
  if (icon) design.logo = icon;
  else if (logo.kind === "qrdx") notes.add(LEFT_OUT.qrdxLogo);
  else if (logo.kind !== "none") notes.add(LEFT_OUT.mcpUploadedLogo);
  noteApiArt(style, notes);
  noteSilhouette(style, notes);
  Object.assign(
    design,
    apiEngineOptions(style, Boolean(icon), (color) => {
      const paint = publishedNormalized(color, notes);
      if (paint.type !== "solid") notes.add(LEFT_OUT.eyeGradients);
      const solid =
        paint.type === "solid" ? paint.color : paint.stops[0]?.color;
      return solid ? mcpHex(solid, notes) : undefined;
    }),
  );

  return {
    code: formatJson({ content: mcpContent(input), style: design }),
    omitted: notes.list,
  };
}

// ─── CLI (shown while CLI_TAB_ENABLED) ───────────────────────────────────────

/** Arguments the shell passes through unquoted. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const shellArg = (value: string) =>
  SHELL_SAFE.test(value) ? value : singleQuote(value);

/** --fg and friends take a CSS color or a gradient as JSON. */
function cliColor(color: ColorConfig, notes: Notes): string {
  const paint = publishedNormalized(color, notes);
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
    `--fg ${cliColor(fg, notes)}`,
    `--bg ${cliColor(style.bgColor ?? ENGINE_DEFAULTS.bgColor, notes)}`,
    `--eye-color ${cliColor(style.eyeColor ?? fg, notes)}`,
    `--dot-color ${cliColor(style.dotColor ?? fg, notes)}`,
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
