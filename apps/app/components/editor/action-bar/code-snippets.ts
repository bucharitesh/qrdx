// The Get code dialog's snippets: the editor's design and content as code
// for each way developers use QRdx. Pure and client-safe.
//
// Every snippet has to work against what is published today:
// - The Frameworks tab (React, Vue, Angular, Preact, Solid, the <qrdx-code>
//   web component and vanilla JS): npm `qrdx` QRDX_NPM_VERSION, whose
//   entries all draw with the same core as the editor's preview, so each
//   snippet draws the design exactly, bar what `omitted` lists. Check
//   `npm view qrdx version` before raising QRDX_NPM_VERSION.
// - shadcn: the registry item's own props (registry/qrdx/qr-code.tsx). It
//   installs the current npm `qrdx` and passes them to its QRCode as given.
// - Image URL: GET https://api.qrdx.dev/v1/qr (app/api/v1/qr/_lib/query.ts):
//   flat parameters where they say it, and `style` (lib/qr-api/style.ts) for
//   gradients, other colors and frames with more than a label.
// - REST API: POST https://api.qrdx.dev/v1/codes (createCodeSchema in
//   app/(app)/dashboard/codes/_lib/qr-codes.ts, logo fields in
//   app/api/v1/codes/_lib/style.ts).
// - MCP: the design_qr tool at https://mcp.qrdx.dev/mcp
//   (app/api/mcp/design.ts, lib/qr-design/style.ts).
// - CLI: @qrdx/cli flags (packages/cli/src/commands/generate.ts), shown
//   while CLI_TAB_ENABLED is on.
//
// Never in a snippet: an uploaded logo (a data URL) or art pixels. Each
// serializer lists what its tab can't express in `omitted`, in plain English.

import { API_BASE_URL, MCP_ENDPOINT, SHADCN_REGISTRY_URL } from "@repo/config";
import {
  DEFAULT_SIZE,
  getTemplate,
  getTemplateIds,
  type QRCodeProps,
  resolveQRCodeProps,
} from "qrdx";
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
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

/**
 * The Frameworks tab's picker, in menu order: each is a link id too
 * (open=code&lang=react).
 */
export const FRAMEWORKS = [
  "react",
  "vue",
  "angular",
  "preact",
  "solid",
  "web-component",
  "vanilla",
  "shadcn",
] as const satisfies readonly CodeLang[];

export type Framework = (typeof FRAMEWORKS)[number];

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  react: "React",
  vue: "Vue",
  angular: "Angular",
  preact: "Preact",
  solid: "SolidJS",
  "web-component": "Web component",
  vanilla: "Vanilla JS",
  shadcn: "shadcn/ui",
};

/** A tab of the dialog: Frameworks, then one tab per service. */
export type CodeTab = "frameworks" | "image" | "api" | "mcp" | "cli";

/**
 * The CLI tab ships now that @qrdx/cli 0.0.5 (with qrdx 0.0.47) is on npm;
 * npm @qrdx/cli 0.0.4 was broken. To hide it again, set this to false and
 * take "cli" out of CODE_LANGS in lib/playground-links.ts.
 */
export const CLI_TAB_ENABLED = true;

const SHIPPED_TABS = ["frameworks", "image", "api", "mcp"] as const;

/** The tabs that ship, in tab order. */
export const CODE_TABS: readonly CodeTab[] = CLI_TAB_ENABLED
  ? [...SHIPPED_TABS, "cli"]
  : SHIPPED_TABS;

/** The service tabs' labels (the Frameworks tab's is translated). */
export const CODE_TAB_LABELS: Record<Exclude<CodeTab, "frameworks">, string> = {
  image: "Image URL",
  api: "REST API",
  mcp: "MCP",
  cli: "CLI",
};

/**
 * Everything a link can open (open=code&lang=…), equal to CODE_LANGS: the
 * frameworks, then the service tabs.
 */
export const CODE_TARGETS: readonly CodeLang[] = [
  ...FRAMEWORKS,
  ...CODE_TABS.filter(
    (tab): tab is Exclude<CodeTab, "frameworks"> => tab !== "frameworks",
  ),
];

/** The tab and, on the Frameworks tab, the framework a link opens. */
export function codeTargetTab(target: CodeLang): {
  tab: CodeTab;
  framework?: Framework;
} {
  if ((FRAMEWORKS as readonly string[]).includes(target)) {
    return { tab: "frameworks", framework: target as Framework };
  }
  return { tab: target as Exclude<CodeTab, "frameworks"> };
}

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

/**
 * The npm `qrdx` the Frameworks tab's snippets are written for (every
 * framework entry, the web component and vanilla JS ship in it). Its
 * components draw with the editor's own engine, so what they draw is the
 * design. The CDN links pin it.
 */
export const QRDX_NPM_VERSION = "0.0.54";
export const QRDX_INSTALL = "npm install qrdx";
const QRDX_CDN = `https://cdn.jsdelivr.net/npm/qrdx@${QRDX_NPM_VERSION}/dist`;
/** qrdx/vanilla as one ES module, for pages without a bundler. */
export const VANILLA_CDN_URL = `${QRDX_CDN}/vanilla.browser.mjs`;
/** Registers <qrdx-code>, for pages without a bundler. */
export const ELEMENT_CDN_URL = `${QRDX_CDN}/element-define.browser.mjs`;
export const SHADCN_ITEM_URL = `${SHADCN_REGISTRY_URL}/qr-code.json`;
export const SHADCN_INSTALL = `npx shadcn@latest add ${SHADCN_ITEM_URL}`;
export const IMAGE_API_URL = `${API_BASE_URL}/qr`;
export const CODES_API_URL = `${API_BASE_URL}/codes`;
export const MCP_SERVER_URL = MCP_ENDPOINT;

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
const borderLeftOut = (id: string) =>
  `The "${getTemplate(id)?.name ?? id}" frame`;

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

/** The quick logo icon or brand logo the style shows, as a logoIcon. */
function logoIconOf(style: ThemeStyles): string | null {
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

// ─── shadcn (the registry item on npm qrdx) ──────────────────────────────────

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

/**
 * The color, shape, level and border props the shadcn item takes. It hands
 * them to qrdx's QRCode as they are, so every color (gradients included)
 * and shape the editor draws goes in; image fills, which are uploads, don't.
 */
function shadcnStyleProps(style: ThemeStyles, notes: Notes): string[] {
  const clean = snippetStyle(style, notes);
  const props: string[] = [];
  for (const key of [
    "bgColor",
    "fgColor",
    "eyeColor",
    "dotColor",
    "bodyPattern",
    "cornerEyePattern",
    "cornerEyeDotPattern",
    "level",
    // "default" is a template too: it insets the code a little.
    "templateId",
  ] as const) {
    const value = clean[key];
    if (value !== undefined && value !== "") props.push(jsxProp(key, value));
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

export interface ShadcnSnippet extends Snippet {
  install: string;
}

/**
 * The shadcn registry's `qr-code` item (registry/qrdx/qr-code.tsx) with
 * this style: its props, which don't include frames or the engine options.
 */
export function shadcnSnippet(input: SnippetInput): ShadcnSnippet {
  const { style } = input;
  const notes = new Notes();
  const props = [jsxString("value", payloadOf(input.value))];
  props.push(...shadcnStyleProps(style, notes));
  // The item's own default is 2, so the editor's quiet zone always goes in.
  props.push(`margin={${style.margin ?? ENGINE_DEFAULTS.margin}}`);
  noteFrame(style, notes);

  const logo = logoOf(style);
  if (logo.kind === "qrdx") props.push(jsxString("logo", DEFAULT_QR_LOGO));
  else if (logo.kind === "url") props.push(jsxString("logo", logo.url));
  // Without `logo` the item draws none, as the editor does with the logo off.
  else if (logo.kind === "uploaded") notes.add(LEFT_OUT.uploadedLogo);
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
  const style: ThemeStyles & { logoIcon?: string; logoFileId?: string } = {
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

// ─── Frameworks (npm qrdx QRDX_NPM_VERSION) ──────────────────────────────────

/** A prop value as a snippet writes it. */
type LibraryValue = string | number | boolean | object;

/**
 * The design as `<QRCode>` props for npm qrdx QRDX_NPM_VERSION, in snippet
 * order: what the editor's preview passes (qr-preview-panel.tsx), with
 * unset fields left to the same defaults. Its React, Vue, Angular, Preact
 * and Solid components take these props as they are; the web component
 * and createQRCode take them resolved (resolveQRCodeProps).
 */
function libraryProps(
  input: SnippetInput,
  notes: Notes,
): Record<string, LibraryValue> {
  // Image fills and a traced silhouette are uploads: noted, never carried.
  const style = snippetStyle(input.style, notes);
  const engine = styleEngineOptions(style);
  const props: Record<string, LibraryValue> = {
    value: payloadOf(input.value),
  };
  for (const key of ["fgColor", "bgColor", "eyeColor", "dotColor"] as const) {
    const color = style[key];
    if (color !== undefined) props[key] = color;
  }
  if (engine.eyeColors) props.eyeColors = engine.eyeColors;
  for (const key of [
    "bodyPattern",
    "cornerEyePattern",
    "cornerEyeDotPattern",
  ] as const) {
    const shape = style[key];
    if (shape !== undefined) props[key] = shape;
  }
  if (engine.moduleScale !== undefined) props.moduleScale = engine.moduleScale;
  if (typeof engine.shape === "string") props.shape = engine.shape;
  if (style.level) props.level = style.level;
  // The default quiet zone is 0, as in the editor.
  if (style.margin) props.margin = style.margin;
  // "default" is a template too: it insets the code a little.
  if (style.templateId) props.templateId = style.templateId;
  if (style.frame && hasFrame(style)) props.frame = style.frame;

  // No logo unless one is passed (qrdx 0.0.47 and later).
  const logo = logoOf(style);
  if (logo.kind === "qrdx" || logo.kind === "url") {
    props.logo = logo.kind === "qrdx" ? DEFAULT_QR_LOGO : logo.url;
    if (engine.logoOptions) props.logoOptions = engine.logoOptions;
    if (engine.autoLevel) props.autoLevel = true;
  } else if (logo.kind === "uploaded") {
    notes.add(LEFT_OUT.uploadedLogo);
  }
  noteArt(style, notes);
  return props;
}

const JS_KEY = /^[A-Za-z_$][\w$]*$/;
/** Biome's line width: a short object or array stays on one line within it. */
const JS_LINE_WIDTH = 80;

/**
 * A JavaScript literal for `value`, formatted as Biome would: two-space
 * indents, trailing commas, bare keys, and objects and arrays of plain
 * values on one line when they fit (`{ color: "#000000", offset: 0 }`).
 * `column` is where the literal starts on its line, and `tail` how many
 * characters follow it there (`;`, `}}`).
 */
export function formatJs(
  value: unknown,
  indent = "",
  column = indent.length,
  tail = 1,
): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  const isArray = Array.isArray(value);
  const entries: [string | null, unknown][] = isArray
    ? value.map((item) => [null, item])
    : Object.entries(value).filter(([, item]) => item !== undefined);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return `${open}${close}`;
  const inner = `${indent}  `;
  const parts = entries.map(([key, item]) => {
    const name =
      key === null ? "" : `${JS_KEY.test(key) ? key : JSON.stringify(key)}: `;
    return `${name}${formatJs(item, inner, inner.length + name.length)}`;
  });
  const flat = entries.every(
    ([, item]) => item === null || typeof item !== "object",
  );
  if (flat) {
    const line = isArray ? `[${parts.join(", ")}]` : `{ ${parts.join(", ")} }`;
    if (column + line.length + tail <= JS_LINE_WIDTH) return line;
  }
  return `${open}\n${parts.map((part) => `${inner}${part},`).join("\n")}\n${indent}${close}`;
}

/** A JSX prop: a string attribute, a bare flag or an expression. */
function jsxProp(name: string, value: LibraryValue): string {
  if (value === true) return name;
  if (typeof value === "string") return jsxString(name, value);
  const column = PROP_INDENT.length + name.length + 2;
  return `${name}={${formatJs(value, PROP_INDENT, column, 2)}}`;
}

/** The JSX components and the entry each one comes from. */
const JSX_ENTRIES = {
  react: "qrdx",
  preact: "qrdx/preact",
  solid: "qrdx/solid",
} as const;

/**
 * `<QRCode … />` for React, Preact or Solid: the three take the same props
 * and draw the same markup.
 */
export function jsxSnippet(
  input: SnippetInput,
  framework: keyof typeof JSX_ENTRIES = "react",
): Snippet {
  const notes = new Notes();
  const props = Object.entries(libraryProps(input, notes)).map(
    ([name, value]) => jsxProp(name, value),
  );
  return {
    code: component(
      `import { QRCode } from "${JSX_ENTRIES[framework]}";`,
      "QRCode",
      props,
    ),
    omitted: notes.list,
  };
}

/** `<QRCode … />` from npm qrdx. */
export const reactSnippet = (input: SnippetInput): Snippet =>
  jsxSnippet(input, "react");

/** `QRCode` from qrdx/preact (no preact/compat). */
export const preactSnippet = (input: SnippetInput): Snippet =>
  jsxSnippet(input, "preact");

/** `QRCode` from qrdx/solid. */
export const solidSnippet = (input: SnippetInput): Snippet =>
  jsxSnippet(input, "solid");

/** camelCase → kebab-case, as Vue templates and the element's attributes write props. */
const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

/**
 * Strings that read the same as a plain attribute in a Vue or Angular
 * template: no quote, entity, tag, line break, Angular interpolation or
 * template-literal syntax, and no surrounding space.
 */
const PLAIN_ATTRIBUTE =
  /^(?!\s)(?!.*\s$)(?!.*\{\{)(?!.*\}\})(?!.*\$\{)[^"&<>`\\\r\n\t]*$/;

/** A typed constant for a prop the template binds. */
function propConstant(
  declaration: string,
  name: string,
  value: LibraryValue,
  indent = "",
): { line: string; typed: boolean } {
  const typed = typeof value === "object";
  const start = `${indent}${declaration}${name}${typed ? `: QRCodeProps["${name}"]` : ""} = `;
  return {
    line: `${start}${formatJs(value, indent, start.length)};`,
    typed,
  };
}

/**
 * A Vue single-file component with `QRCode` from qrdx/vue: plain strings
 * as attributes (kebab-case), numbers and flags as bindings and objects as
 * typed constants in `<script setup>`.
 */
export function vueSnippet(input: SnippetInput): Snippet {
  const notes = new Notes();
  const attributes: string[] = [];
  const constants: string[] = [];
  let typed = false;
  for (const [name, value] of Object.entries(libraryProps(input, notes))) {
    const attribute = kebab(name);
    if (value === true) attributes.push(attribute);
    else if (typeof value === "number") {
      attributes.push(`:${attribute}="${value}"`);
    } else if (typeof value === "string" && PLAIN_ATTRIBUTE.test(value)) {
      attributes.push(`${attribute}="${value}"`);
    } else {
      const constant = propConstant("const ", name, value);
      typed ||= constant.typed;
      constants.push(constant.line);
      attributes.push(`:${attribute}="${name}"`);
    }
  }
  const script = [
    `import { QRCode${typed ? ", type QRCodeProps" : ""} } from "qrdx/vue";`,
    ...constants.map((line) => `\n${line}`),
  ].join("\n");
  return {
    code: `<script setup lang="ts">
${script}
</script>

<template>
  <QRCode
${attributes.map((attribute) => `    ${attribute}`).join("\n")}
  />
</template>`,
    omitted: notes.list,
  };
}

/**
 * A standalone Angular component that uses `<qrdx-qr-code>` from
 * qrdx/angular: plain strings as attributes, numbers and flags as input
 * bindings, and objects as typed fields of the component.
 */
export function angularSnippet(input: SnippetInput): Snippet {
  const notes = new Notes();
  const attributes: string[] = [];
  const fields: string[] = [];
  let typed = false;
  for (const [name, value] of Object.entries(libraryProps(input, notes))) {
    if (value === true || typeof value === "number") {
      attributes.push(`[${name}]="${value}"`);
    } else if (typeof value === "string" && PLAIN_ATTRIBUTE.test(value)) {
      attributes.push(`${name}="${value}"`);
    } else {
      const field = propConstant("protected readonly ", name, value, "  ");
      typed ||= field.typed;
      fields.push(field.line);
      attributes.push(`[${name}]="${name}"`);
    }
  }
  const body = fields.length > 0 ? ` {\n${fields.join("\n\n")}\n}` : " {}";
  return {
    code: `import { Component } from "@angular/core";
import { QRCode${typed ? ", type QRCodeProps" : ""} } from "qrdx/angular";

@Component({
  selector: "app-my-qr-code",
  imports: [QRCode],
  template: \`
    <qrdx-qr-code
${attributes.map((attribute) => `      ${attribute}`).join("\n")}
    />
  \`,
})
export class MyQRCode${body}`,
    omitted: notes.list,
  };
}

/**
 * The design as `QRSVGOptions` (what createQRCode and <qrdx-code> take):
 * the props as they are, or, with a logo, the logo laid out by
 * resolveQRCodeProps into `imageSettings` for the default size.
 */
function svgOptions(props: Record<string, LibraryValue>): {
  options: Record<string, LibraryValue>;
  logo: boolean;
} {
  if (props.logo === undefined) return { options: props, logo: false };
  const { logo: _logo, logoOptions: _logoOptions, ...rest } = props;
  const resolved = resolveQRCodeProps(props as unknown as QRCodeProps);
  const options: Record<string, LibraryValue> = {
    value: rest.value as string,
    size: resolved.size ?? DEFAULT_SIZE,
    ...rest,
  };
  if (resolved.imageSettings) options.imageSettings = resolved.imageSettings;
  return { options, logo: true };
}

export interface VanillaSnippet extends Snippet {
  /** The same API as one ES module, for a page without a bundler */
  cdnUrl: string;
}

/**
 * `createQRCode` from qrdx/vanilla, drawing into `#qr`. With a logo the
 * props go through resolveQRCodeProps, which lays the logo out as
 * `<QRCode>` does.
 */
export function vanillaSnippet(input: SnippetInput): VanillaSnippet {
  const notes = new Notes();
  const props = libraryProps(input, notes);
  const logo = props.logo !== undefined;
  const call = logo
    ? 'createQRCode("#qr", resolveQRCodeProps('
    : 'createQRCode("#qr", ';
  const end = logo ? "));" : ");";
  const imports = logo ? "createQRCode, resolveQRCodeProps" : "createQRCode";
  const comment = logo
    ? `// Draws the code into <div id="qr"></div>. resolveQRCodeProps lays the
// logo out as <QRCode> does.`
    : `// Draws the code into <div id="qr"></div>`;
  return {
    code: `import { ${imports} } from "qrdx/vanilla";

${comment}
${call}${formatJs(props, "", call.length, end.length)}${end}`,
    omitted: notes.list,
    cdnUrl: VANILLA_CDN_URL,
  };
}

/** <qrdx-code>'s attributes (qrdx/element), by option, with their kind. */
const ELEMENT_ATTRIBUTES: Record<string, "string" | "number" | "boolean"> = {
  value: "string",
  size: "number",
  level: "string",
  fgColor: "string",
  bgColor: "string",
  eyeColor: "string",
  dotColor: "string",
  bodyPattern: "string",
  cornerEyePattern: "string",
  cornerEyeDotPattern: "string",
  margin: "number",
  templateId: "string",
  moduleScale: "number",
  autoLevel: "boolean",
  shape: "string",
};

/** Characters an attribute in double quotes escapes. */
const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * HTML for a page without a bundler: the CDN script that registers
 * `<qrdx-code>`, and the element with the design. Simple options are
 * attributes (kebab-case); gradients, the frame, per-eye colors and the
 * laid-out logo go in the `props` attribute as JSON, so no script is
 * needed. Text with line breaks goes there too, where JSON keeps them.
 */
export function webComponentSnippet(input: SnippetInput): Snippet {
  const notes = new Notes();
  const { options, logo } = svgOptions(libraryProps(input, notes));
  const attributes: string[] = [];
  const rest: Record<string, LibraryValue> = {};
  for (const [name, value] of Object.entries(options)) {
    const kind = ELEMENT_ATTRIBUTES[name];
    if (kind === "boolean" && value === true) {
      attributes.push(kebab(name));
    } else if (kind === "number" && typeof value === "number") {
      attributes.push(`${kebab(name)}="${value}"`);
    } else if (
      kind === "string" &&
      typeof value === "string" &&
      !/[\r\n\t]/.test(value)
    ) {
      attributes.push(`${kebab(name)}="${escapeAttribute(value)}"`);
    } else {
      rest[name] = value;
    }
  }
  if (Object.keys(rest).length > 0) {
    // JSON in single quotes: & and ' are the characters it can't hold.
    const json = formatJson(rest, "  ")
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&#39;");
    attributes.push(`props='${json}'`);
  }
  const note = logo
    ? `\n<!-- The logo in props is laid out for size="${options.size}": change them together -->`
    : "";
  return {
    code: `<script
  type="module"
  src="${ELEMENT_CDN_URL}"
></script>
${note}
<qrdx-code
${attributes.map((attribute) => `  ${attribute}`).join("\n")}
></qrdx-code>`,
    omitted: notes.list,
  };
}

/** Every framework's snippet, by picker entry. */
export function frameworkSnippet(
  framework: Exclude<Framework, "shadcn">,
  input: SnippetInput,
): Snippet {
  switch (framework) {
    case "react":
    case "preact":
    case "solid":
      return jsxSnippet(input, framework);
    case "vue":
      return vueSnippet(input);
    case "angular":
      return angularSnippet(input);
    case "web-component":
      return webComponentSnippet(input);
    case "vanilla":
      return vanillaSnippet(input);
    default:
      return framework satisfies never;
  }
}
