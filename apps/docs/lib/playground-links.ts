// Links into the playground: one writer (playgroundHref) and one reader
// (parsePlaygroundParams). Pure and client-safe, so marketing pages can build
// links without loading the editor.
//
// Only harmless state goes in a link. The one piece of content allowed is a
// web address (`url`, http or https only, never with a user name or
// password), and playgroundHref puts it after the `#`, which browsers never
// send to a server. Wi-Fi passwords, contact details, payment details and
// any other form content never go in a link. A design travels as `style`
// (lib/playground-style.ts), which never carries a logo or art.
//
// /playground stays static: page.tsx never reads searchParams. The editor
// reads these after mount (lib/hooks/use-playground-params.ts), applies them
// once and removes the one-shot ones from the address bar.

import {
  type DistanceUnit,
  MIN_MODULE_MM,
  PRINT_SIZE_LIMITS,
  SCAN_DISTANCE_PER_MODULE,
  toMillimeters,
} from "@/lib/print-size";
import { CONTENT_TYPES_METADATA, type ContentType } from "@/types/qr-content";

export const PLAYGROUND_PATH = "/playground";

/**
 * The editor panel's tabs, as stored in `?tab=`. "settings" is legacy (Design
 * at Logo). "art" is the Art tab (see the Art tab block at the end).
 */
export const CONTROL_TABS = [
  "content",
  "customisations",
  "settings",
  "ai",
  "art",
] as const;
export type ControlTab = (typeof CONTROL_TABS)[number];

/** Friendlier names a link may use for a tab. */
export const TAB_ALIASES = {
  design: "customisations",
  generate: "ai",
} as const satisfies Record<string, ControlTab>;
export type TabAlias = keyof typeof TAB_ALIASES;

/**
 * Design sections a link can open (?section=), in the Design tab's order.
 * Each one has an anchor (components/editor/control-sections/design-controls.tsx);
 * a new Design section adds its id here. The old `section=art` opens the Art
 * tab instead (the Art tab block below).
 */
export const DESIGN_SECTIONS = [
  "colors",
  "dots",
  "eyes",
  "logo",
  "frame",
  "padding",
  "error-correction",
] as const;
export type DesignSection = (typeof DESIGN_SECTIONS)[number];

/**
 * Surfaces a link can open, each one that exists today: the download dialog,
 * its Print-ready tab, Get code, the photo check and the community sheet.
 */
export const OPEN_TARGETS = [
  "download",
  "print",
  "code",
  "photo-check",
  "community",
] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

/**
 * Get code dialog tabs a link can open (open=code&lang=…): only tabs that
 * ship. The CLI tab waits for a working @qrdx/cli on npm (CLI_TAB_ENABLED in
 * components/editor/action-bar/code-snippets.ts); add "cli" here with it.
 */
export const CODE_LANGS = ["react", "shadcn", "image", "api", "mcp"] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

export type PrintUnit = keyof typeof PRINT_SIZE_LIMITS;
export interface PrintWidth {
  size: number;
  unit: PrintUnit;
}

/**
 * A scan distance for the Print-ready tab (printDistance=1m, 30cm, 3ft):
 * the tab sizes the code from it, since only it knows the code's modules.
 */
export interface PrintDistance {
  value: number;
  unit: DistanceUnit;
}

/** The fewest modules a code can have across: version 1 with no quiet zone. */
const FEWEST_MODULES = 21;
/** Nearest distance the Print tab gives: the 0.4 mm minimum module (100 mm). */
export const PRINT_DISTANCE_MIN_MM = MIN_MODULE_MM * SCAN_DISTANCE_PER_MODULE;
/** Farthest: the largest width over the fewest modules (about 23.8 m). */
export const PRINT_DISTANCE_MAX_MM =
  (PRINT_SIZE_LIMITS.mm.max / FEWEST_MODULES) * SCAN_DISTANCE_PER_MODULE;

/** Longest `url` a link may carry. */
export const MAX_LINK_URL_LENGTH = 2048;

/** Version prefix of a `style` value (lib/playground-style.ts). */
export const STYLE_PARAM_VERSION = "1";
/** Longest `style` value accepted, in characters (about 4 KB). */
export const MAX_STYLE_PARAM_LENGTH = 4096;

/** Parameters applied once and then removed from the address bar. */
export const ONE_SHOT_PARAMS = [
  "section",
  "type",
  "url",
  "preset",
  "style",
  "open",
  "print",
  "printDistance",
  "lang",
  // The Art tab
  "art",
  "artStyle",
] as const;

export interface PlaygroundParams {
  tab?: ControlTab;
  section?: DesignSection;
  type?: ContentType;
  url?: string;
  preset?: string;
  /** The raw `style` value, checked for shape and size only; decode it with decodeStyleParam. */
  style?: string;
  open?: OpenTarget;
  print?: PrintWidth;
  /** With open=print: size the code to scan from this distance (wins over `print`). */
  printDistance?: PrintDistance;
  lang?: CodeLang;
  /** The Art tab's mode (comes with tab=art) */
  art?: ArtLinkMode;
  /** With art=ai: an AI art style preset id (shape only; the editor checks it exists) */
  artStyle?: string;
}

export interface PlaygroundLinkOptions {
  /** A saved or community theme: /playground/<themeId> */
  themeId?: string;
  tab?: ControlTab | TabAlias;
  section?: DesignSection;
  type?: ContentType;
  /** http(s) only; anything else is left out of the link. */
  url?: string;
  /** A built-in preset id */
  preset?: string;
  /** From encodeStyleParam */
  style?: string;
  open?: OpenTarget;
  print?: PrintWidth;
  /** Implies open=print; wins over `print`. */
  printDistance?: PrintDistance;
  lang?: CodeLang;
  /** Implies tab=art. */
  art?: ArtLinkMode;
  /** With art=ai only: an AI art style preset id. Never a prompt. */
  artStyle?: string;
}

const CONTENT_TYPE_IDS = new Set<string>(
  CONTENT_TYPES_METADATA.map((meta) => meta.type),
);
const PRESET_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const STYLE_VALUE = new RegExp(`^${STYLE_PARAM_VERSION}\\.[A-Za-z0-9_-]+$`);
const PRINT_VALUE = /^(\d{1,4}(?:\.\d{1,2})?)(mm|in)$/;
const PRINT_DISTANCE_VALUE = /^(\d{1,5}(?:\.\d{1,3})?)(cm|m|in|ft)$/;

const isOneOf = <T extends string>(
  list: readonly T[],
  value: unknown,
): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** A tab name or alias as the panel's tab, or null when unknown. */
export function resolveControlTab(
  raw: string | null | undefined,
): ControlTab | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (isOneOf(CONTROL_TABS, value)) return value;
  if (value in TAB_ALIASES) return TAB_ALIASES[value as TabAlias];
  return null;
}

/**
 * A web address safe to put in a link and to encode: http or https, at most
 * MAX_LINK_URL_LENGTH characters, with a host and without a user name or
 * password. Returns the normalized address, or null.
 */
export function parseLinkUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LINK_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href.length > MAX_LINK_URL_LENGTH ? null : url.href;
}

/** `40mm`, `1.5in`: a Print-ready width within the dialog's limits, or null. */
export function parsePrintWidth(
  raw: string | null | undefined,
): PrintWidth | null {
  const match = raw?.trim().toLowerCase().match(PRINT_VALUE);
  if (!match) return null;
  const size = Number(match[1]);
  const unit = match[2] as PrintUnit;
  const { min, max } = PRINT_SIZE_LIMITS[unit];
  return Number.isFinite(size) && size >= min && size <= max
    ? { size, unit }
    : null;
}

export function formatPrintWidth({ size, unit }: PrintWidth): string {
  return `${size}${unit}`;
}

/**
 * `1m`, `30cm`, `3ft`, `36in`: a scan distance within what the Print-ready
 * tab can produce (PRINT_DISTANCE_MIN_MM to PRINT_DISTANCE_MAX_MM), or null.
 */
export function parsePrintDistance(
  raw: string | null | undefined,
): PrintDistance | null {
  const match = raw?.trim().toLowerCase().match(PRINT_DISTANCE_VALUE);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2] as DistanceUnit;
  const mm = toMillimeters(value, unit);
  // A hair of tolerance, so the bounds themselves round-trip.
  return Number.isFinite(mm) &&
    mm >= PRINT_DISTANCE_MIN_MM - 1e-6 &&
    mm <= PRINT_DISTANCE_MAX_MM + 1e-6
    ? { value, unit }
    : null;
}

export function formatPrintDistance({ value, unit }: PrintDistance): string {
  return `${value}${unit}`;
}

/** A `style` value with the right prefix, characters and size, or null. */
export function parseStyleValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length > MAX_STYLE_PARAM_LENGTH) return null;
  return STYLE_VALUE.test(value) ? value : null;
}

/** A built-in preset id's shape (existence is checked by the editor). */
export function parsePresetId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  // Shuffled themes are composed from blocks that change between releases.
  if (value.startsWith("shuffle")) return null;
  return PRESET_ID.test(value) ? value : null;
}

/**
 * Parameters from a playground address. `search` is location.search; `hash`
 * (location.hash) may carry the same names after the `#`, and wins when both
 * do. Invalid values are left out.
 */
export function parsePlaygroundParams(
  search: string | URLSearchParams,
  hash = "",
): PlaygroundParams {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (name: string) => fragment.get(name) ?? query.get(name);

  const params: PlaygroundParams = {};

  const tab = resolveControlTab(get("tab"));
  if (tab) params.tab = tab;

  const section = get("section")?.trim().toLowerCase();
  if (isOneOf(DESIGN_SECTIONS, section)) params.section = section;
  parseArtParams(get, section, params);

  const url = parseLinkUrl(get("url"));
  const type = get("type")?.trim().toLowerCase();
  if (type && CONTENT_TYPE_IDS.has(type)) params.type = type as ContentType;
  // A web address only goes with the URL type.
  if (url && (!params.type || params.type === "url")) {
    params.url = url;
    params.type = "url";
  }

  const preset = parsePresetId(get("preset"));
  if (preset) params.preset = preset;

  const style = parseStyleValue(get("style"));
  if (style) params.style = style;

  const print = parsePrintWidth(get("print"));
  const open = get("open")?.trim().toLowerCase();
  if (isOneOf(OPEN_TARGETS, open)) params.open = open;
  // A width alone means the Print-ready tab.
  if (print && (!params.open || params.open === "print")) {
    params.print = print;
    params.open = "print";
  }
  // A distance only with open=print, and it wins over a width.
  const printDistance = parsePrintDistance(get("printDistance"));
  if (printDistance && params.open === "print") {
    params.printDistance = printDistance;
    delete params.print;
  }

  const lang = get("lang")?.trim().toLowerCase();
  if (isOneOf(CODE_LANGS, lang) && params.open === "code") params.lang = lang;

  return params;
}

/** True when `params` holds anything the editor applies once. */
export function hasOneShotParams(params: PlaygroundParams): boolean {
  return ONE_SHOT_PARAMS.some((name) => params[name] !== undefined);
}

/**
 * The address without the one-shot parameters (query and `#`), keeping the
 * others (campaign tags, `season`). `tab` is rewritten to `tab` when given,
 * or removed when null.
 */
export function stripOneShotParams(
  href: string,
  tab?: ControlTab | null,
): string {
  const url = new URL(href);
  for (const name of ONE_SHOT_PARAMS) url.searchParams.delete(name);
  if (tab === null) url.searchParams.delete("tab");
  else if (tab) url.searchParams.set("tab", tab);

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const looksLikeParams = url.hash.includes("=");
  if (looksLikeParams) {
    for (const name of [...ONE_SHOT_PARAMS, "tab"]) fragment.delete(name);
    const rest = fragment.toString();
    url.hash = rest ? `#${rest}` : "";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * A link into the playground. Invalid values are dropped, so a link never
 * carries more than the rules above allow. The web address goes after the
 * `#` (never sent to a server); everything else goes in the query.
 */
export function playgroundHref(options: PlaygroundLinkOptions = {}): string {
  const path = options.themeId
    ? `${PLAYGROUND_PATH}/${encodeURIComponent(options.themeId)}`
    : PLAYGROUND_PATH;
  const query = new URLSearchParams();

  if (options.tab && resolveControlTab(options.tab))
    query.set("tab", options.tab);
  if (isOneOf(DESIGN_SECTIONS, options.section)) {
    query.set("section", options.section);
  }
  appendArtParams(query, options);

  const url = parseLinkUrl(options.url);
  if (options.type && CONTENT_TYPE_IDS.has(options.type)) {
    if (!(url && options.type === "url")) query.set("type", options.type);
  }
  // A preset or style only applies without a theme path.
  if (!options.themeId) {
    const preset = parsePresetId(options.preset);
    if (preset) query.set("preset", preset);
    const style = parseStyleValue(options.style);
    if (style) query.set("style", style);
  }
  const print = options.print
    ? parsePrintWidth(formatPrintWidth(options.print))
    : null;
  const printDistance = options.printDistance
    ? parsePrintDistance(formatPrintDistance(options.printDistance))
    : null;
  if (printDistance) {
    query.set("open", "print");
    query.set("printDistance", formatPrintDistance(printDistance));
  } else if (print) {
    query.set("open", "print");
    query.set("print", formatPrintWidth(print));
  } else if (isOneOf(OPEN_TARGETS, options.open)) {
    query.set("open", options.open);
    if (options.open === "code" && isOneOf(CODE_LANGS, options.lang)) {
      query.set("lang", options.lang);
    }
  }

  const search = query.toString();
  const fragment =
    url && (!options.type || options.type === "url")
      ? `#${new URLSearchParams({ url }).toString()}`
      : "";
  return `${path}${search ? `?${search}` : ""}${fragment}`;
}

/**
 * Where a hand-off came from, for analytics without values: the `ref`
 * campaign tag, else "direct", "external" or the first path segment of a
 * same-site referrer ("qr-code-generator", "tools", "home").
 */
export function handoffSource(
  referrer: string,
  origin: string,
  ref?: string | null,
): string {
  const tag = ref?.trim().toLowerCase();
  if (tag && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(tag)) return tag;
  if (!referrer) return "direct";
  try {
    const from = new URL(referrer);
    if (from.origin !== origin) return "external";
    const segment = from.pathname.split("/")[1] ?? "";
    return /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(segment)
      ? segment.toLowerCase()
      : "home";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Hand-off sources (hub phase 5). handoffSource reads a link's `ref` tag
// first. A link from a page whose address says nothing about where it came
// from (the 404 page) names itself with one, and so do the plugins
// (plugins/{figma,canva,raycast}/src/playground-link.ts). A name, never a
// value from the page.

/** A `ref` tag handoffSource accepts. */
const HANDOFF_REF = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** `href` (a playgroundHref link) with a `ref` tag in its query, before any `#`. */
export function withHandoffRef(href: string, ref: string): string {
  if (!HANDOFF_REF.test(ref)) return href;
  const hashAt = href.indexOf("#");
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  return `${base}${base.includes("?") ? "&" : "?"}ref=${ref}${hash}`;
}

// ── The Art tab (hub phase 3) ───────────────────────────────────────────────
// ?tab=art opens it. `art` picks a mode and brings tab=art with it (a link
// naming another tab drops it); `artStyle` picks an AI art style preset and
// only goes with art=ai. The prompt never comes from a link: a preset fills it
// in from components/sections/ai-art/presets.ts. The old `section=art` (the
// Design tab's Art section before the tab) opens the Art tab.

/** Art modes a link can pick. `image` is Image QR (the halftone mode). */
export const ART_LINK_MODES = ["logo", "image", "ai"] as const;
export type ArtLinkMode = (typeof ART_LINK_MODES)[number];

const ART_STYLE_ID = /^[a-z][a-z0-9-]{0,47}$/;

/** An AI art preset id's shape (existence is checked by the editor). */
export function parseArtStyleId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return ART_STYLE_ID.test(value) ? value : null;
}

/** Tabs the old `section=art` may come with: none, or the old Design ones. */
const LEGACY_ART_SECTION_TABS = new Set<ControlTab | undefined>([
  undefined,
  "customisations",
  "settings",
]);

function parseArtParams(
  get: (name: string) => string | null,
  section: string | undefined,
  params: PlaygroundParams,
): void {
  if (section === "art" && LEGACY_ART_SECTION_TABS.has(params.tab)) {
    params.tab = "art";
  }
  const art = get("art")?.trim().toLowerCase();
  if (!isOneOf(ART_LINK_MODES, art)) return;
  if (params.tab !== undefined && params.tab !== "art") return;
  params.art = art;
  params.tab = "art";
  const style = parseArtStyleId(get("artStyle"));
  if (style && art === "ai") params.artStyle = style;
}

function appendArtParams(
  query: URLSearchParams,
  options: PlaygroundLinkOptions,
): void {
  if (!isOneOf(ART_LINK_MODES, options.art)) return;
  if (options.tab && resolveControlTab(options.tab) !== "art") return;
  query.set("tab", "art");
  query.set("art", options.art);
  const style = parseArtStyleId(options.artStyle);
  if (style && options.art === "ai") query.set("artStyle", style);
}
