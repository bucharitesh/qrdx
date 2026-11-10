import "server-only";

import type { ScanScoreResult } from "qrdx";
import { getTemplateIds } from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
} from "qrdx/types";
import { imageApiUrl } from "@/lib/agents/hosts";
import {
  type ChatQrLinks,
  chatQrLinks,
  readChatQrInput,
} from "@/lib/chat-bots/qr-reply";
import { logError } from "@/lib/log-error";
import { baseUrl } from "@/lib/metadata";
import { decodeStyleParam, encodeStyleParam } from "@/lib/playground-style";
import { runDesignLoop } from "@/lib/qr-design/repair";
import { DesignTooLongError, scoreDesign } from "@/lib/qr-design/score";
import {
  type DesignStyle,
  fromThemeStyles,
  LOGO_ICON_IDS,
  type LogoIconId,
  toThemeStyles,
} from "@/lib/qr-design/style";
import { QR_DEFAULTS } from "@/lib/qr-render";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

// How the chat bots (Slack, Telegram, Discord) style a code: a small curated
// set of looks, colors, frames and logo icons for the pickers under a reply,
// the same options typed after the content with the CLI's flag names, and
// the scan check every styled code passes before it's sent.
//
// A design travels in the reply's own links: the image API's `style` (the
// editor's playground value, which never holds a logo or content) plus
// `logoIcon`, and the editor link carries the same `style`. Restyling reads
// the content and design back from the reply's Download PNG link: there's no
// state on QRdx's side.
//
// Every styled code goes through design_qr's scan check (runDesignLoop with
// scoreDesign): repaired until it's Great, else the classic fallback, else
// the plain code. The reply says when that happened.

/**
 * The plain code: the image API's defaults, which every design is drawn on
 * (as BASE_STYLE in lib/qr-api/render.ts).
 */
export const CHAT_BASE_STYLE: ThemeStyles = {
  fgColor: QR_DEFAULTS.fg,
  bgColor: QR_DEFAULTS.bg,
  bodyPattern: QR_DEFAULTS.body,
  cornerEyePattern: QR_DEFAULTS.eye,
  cornerEyeDotPattern: QR_DEFAULTS.dot,
  level: QR_DEFAULTS.level,
  margin: QR_DEFAULTS.margin,
};
const BASE_STYLE = CHAT_BASE_STYLE;

// ── What the pickers offer ──────────────────────────────────────────────────

/**
 * Built-in looks that read well small. Each scores Great on its own and with
 * every color, frame and logo below for a typical link
 * (tests/lib/chat-bots-styles.test.ts). "plain" is the default code.
 */
const LOOK_IDS = [
  "plain",
  "classic",
  "modern",
  "royal",
  "folio",
  "caffeine",
  "retro",
  "bordeaux",
  "blossom",
] as const;
export type ChatLookId = (typeof LOOK_IDS)[number];

export interface ChatOption<Id extends string> {
  id: Id;
  label: string;
}

/** The looks, labelled as the editor labels its presets. */
export const CHAT_LOOKS: readonly ChatOption<ChatLookId>[] = LOOK_IDS.map(
  (id) => ({
    id,
    label: id === "plain" ? "Plain" : (defaultPresets[id]?.label ?? id),
  }),
);

/**
 * Foregrounds on white, every one at least 7:1 against it: the contrast
 * that still decodes when a phone sees the code small.
 */
export const CHAT_COLORS = [
  { id: "black", label: "Black", hex: "#000000" },
  { id: "blue", label: "Blue", hex: "#1E40AF" },
  { id: "green", label: "Green", hex: "#14532D" },
  { id: "red", label: "Red", hex: "#991B1B" },
  { id: "purple", label: "Purple", hex: "#6B21A8" },
  { id: "orange", label: "Orange", hex: "#9A3412" },
] as const;
export type ChatColorId = (typeof CHAT_COLORS)[number]["id"];

/** No frame, or a call-to-action frame with "Scan me" (named as the editor names them). */
export const CHAT_FRAMES: readonly ChatOption<
  "none" | "banner-bottom" | "banner-top" | "speech-bubble" | "polaroid"
>[] = [
  { id: "none", label: "No frame" },
  { id: "banner-bottom", label: "Banner" },
  { id: "banner-top", label: "Top banner" },
  { id: "speech-bubble", label: "Bubble" },
  { id: "polaroid", label: "Polaroid" },
];
export type ChatFrameId = (typeof CHAT_FRAMES)[number]["id"];

/** No logo, or one of the editor's quick icons. */
export const CHAT_LOGOS: readonly ChatOption<"none" | LogoIconId>[] = [
  { id: "none", label: "No logo" },
  { id: "link", label: "Link" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "location", label: "Location" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
];
export type ChatLogoId = (typeof CHAT_LOGOS)[number]["id"];

/** The four pickers, in the order replies show them. */
export const PICKERS = ["look", "color", "frame", "logo"] as const;
export type Picker = (typeof PICKERS)[number];

export const PICKER_LABELS: Record<Picker, string> = {
  look: "Look",
  color: "Color",
  frame: "Frame",
  logo: "Logo",
};

const PICKER_OPTIONS: Record<Picker, readonly ChatOption<string>[]> = {
  look: CHAT_LOOKS,
  color: CHAT_COLORS,
  frame: CHAT_FRAMES,
  logo: CHAT_LOGOS,
};

/** A picker's options. */
export const pickerOptions = (picker: Picker) => PICKER_OPTIONS[picker];

const isOption = (picker: Picker, value: unknown): value is string =>
  typeof value === "string" &&
  PICKER_OPTIONS[picker].some((option) => option.id === value);

// ── A design ────────────────────────────────────────────────────────────────

export interface ChatDesign {
  /** Colors, shapes, frame and border, as the editor stores them (no logo) */
  styles: ThemeStyles;
  /** A quick logo icon, drawn by the image API */
  logo: LogoIconId | null;
  /** The look it started from: the editor shows it as the preset's name */
  look: Exclude<ChatLookId, "plain"> | null;
}

/** What someone picked or typed. Every field is already checked. */
export interface ChatStyleChoice {
  look?: ChatLookId;
  fg?: string;
  bg?: string;
  eyeColor?: string;
  dotColor?: string;
  body?: ThemeStyles["bodyPattern"];
  eye?: ThemeStyles["cornerEyePattern"];
  dot?: ThemeStyles["cornerEyeDotPattern"];
  frame?: FrameStyle;
  frameText?: string;
  template?: string;
  logo?: ChatLogoId | LogoIconId;
}

const upper = (color: unknown, fallback: string) =>
  typeof color === "string" ? color.toUpperCase() : fallback;

/** The fields a plain code sets, and nothing else. */
const PLAIN_KEYS = new Set([
  "fgColor",
  "bgColor",
  "eyeColor",
  "dotColor",
  "bodyPattern",
  "cornerEyePattern",
  "cornerEyeDotPattern",
  "level",
  "margin",
  "showLogo",
]);

/** True when `styles` draw exactly the plain code (the image API's defaults). */
function isPlainStyles(styles: ThemeStyles): boolean {
  if (Object.keys(styles).some((key) => !PLAIN_KEYS.has(key))) return false;
  const fg = upper(styles.fgColor, "#000000");
  return (
    fg === "#000000" &&
    upper(styles.bgColor, "#FFFFFF") === "#FFFFFF" &&
    upper(styles.eyeColor, fg) === fg &&
    upper(styles.dotColor, fg) === fg &&
    (styles.bodyPattern ?? BASE_STYLE.bodyPattern) === BASE_STYLE.bodyPattern &&
    (styles.cornerEyePattern ?? BASE_STYLE.cornerEyePattern) ===
      BASE_STYLE.cornerEyePattern &&
    (styles.cornerEyeDotPattern ?? BASE_STYLE.cornerEyeDotPattern) ===
      BASE_STYLE.cornerEyeDotPattern &&
    (styles.level ?? BASE_STYLE.level) === BASE_STYLE.level &&
    (styles.margin ?? BASE_STYLE.margin) === BASE_STYLE.margin &&
    !styles.showLogo
  );
}

/** Null for the plain code, so its reply is exactly today's default. */
function orPlain(design: ChatDesign): ChatDesign | null {
  return design.logo || design.look || !isPlainStyles(design.styles)
    ? design
    : null;
}

/**
 * `design` (null: the plain code) with `choice` applied, in order: the look,
 * then colors, shapes, frame, border and logo. A new look keeps the frame,
 * border and logo; a new foreground carries to the eyes unless they're set
 * too (as in design_qr).
 */
export function applyChoice(
  design: ChatDesign | null,
  choice: ChatStyleChoice,
): ChatDesign | null {
  let styles: ThemeStyles = { ...BASE_STYLE, ...design?.styles };
  let look = design?.look ?? null;
  let logo = design?.logo ?? null;

  if (choice.look) {
    const { frame, templateId } = styles;
    const preset =
      choice.look === "plain" ? null : defaultPresets[choice.look]?.styles;
    styles = {
      ...BASE_STYLE,
      ...preset,
      ...(frame ? { frame } : {}),
      ...(templateId ? { templateId } : {}),
    };
    look = choice.look === "plain" ? null : choice.look;
  }
  if (choice.bg) styles.bgColor = choice.bg;
  if (choice.fg) {
    styles.fgColor = choice.fg;
    styles.eyeColor = choice.eyeColor ?? choice.fg;
    styles.dotColor = choice.dotColor ?? choice.eyeColor ?? choice.fg;
  }
  if (choice.eyeColor) styles.eyeColor = choice.eyeColor;
  if (choice.dotColor) styles.dotColor = choice.dotColor;
  if (choice.body) styles.bodyPattern = choice.body;
  if (choice.eye) styles.cornerEyePattern = choice.eye;
  if (choice.dot) styles.cornerEyeDotPattern = choice.dot;

  if (choice.frame === "none") {
    delete styles.frame;
  } else if (choice.frame || choice.frameText !== undefined) {
    // Frame text alone puts it on the current frame, or a banner (the CLI's rule).
    const current = styles.frame?.style === "custom" ? undefined : styles.frame;
    const style = choice.frame ?? current?.style ?? "banner-bottom";
    const text = choice.frameText ?? current?.text;
    styles.frame = {
      style: style as Exclude<FrameStyle, "none">,
      ...(text ? { text } : {}),
    };
  }
  if (choice.template) {
    if (choice.template === "default") delete styles.templateId;
    else styles.templateId = choice.template;
  }
  if (choice.logo) logo = choice.logo === "none" ? null : choice.logo;

  const { showLogo: _showLogo, ...rest } = styles;
  return orPlain({ styles: rest, logo, look });
}

/** A picker's option as a choice, or null when it isn't one of its options. */
export function pickerChoice(
  picker: Picker,
  value: unknown,
): ChatStyleChoice | null {
  if (!isOption(picker, value)) return null;
  switch (picker) {
    case "look":
      return { look: value as ChatLookId };
    case "color": {
      const hex = CHAT_COLORS.find((color) => color.id === value)?.hex;
      return hex ? { fg: hex, bg: "#FFFFFF" } : null;
    }
    case "frame":
      return { frame: value as FrameStyle };
    case "logo":
      return { logo: value as ChatLogoId };
  }
}

/** Which option of each picker the design shows (null: none of them). */
export function currentOptions(
  design: ChatDesign | null,
): Record<Picker, string | null> {
  const styles = design?.styles ?? {};
  const fg = upper(styles.fgColor, "#000000");
  const color =
    upper(styles.bgColor, "#FFFFFF") === "#FFFFFF" &&
    upper(styles.eyeColor, fg) === fg &&
    upper(styles.dotColor, fg) === fg
      ? (CHAT_COLORS.find((option) => option.hex === fg)?.id ?? null)
      : null;
  const frame = styles.frame?.style ?? "none";
  return {
    look: design?.look ?? (design ? null : "plain"),
    color,
    frame: isOption("frame", frame) ? frame : null,
    logo: design?.logo ?? "none",
  };
}

// ── Links ───────────────────────────────────────────────────────────────────

/** The image API and editor parameters for a design. */
function designParams(
  design: ChatDesign | null,
): { style?: string; logoIcon?: string } | undefined {
  if (!design) return undefined;
  const encoded = encodeStyleParam(design.styles, {
    preset: design.look ?? undefined,
  });
  return {
    ...(encoded ? { style: encoded.value } : {}),
    ...(design.logo ? { logoIcon: design.logo } : {}),
  };
}

/** The PNG, SVG and editor links for `data` in `design` (null: plain). */
export function chatDesignLinks(
  data: string,
  design: ChatDesign | null,
  origin: string | URL = baseUrl,
): ChatQrLinks {
  return chatQrLinks(data, origin, designParams(design));
}

/**
 * The content and design in one of the bot's own PNG or SVG links, or null
 * when it isn't one: another address, content that isn't valid, a style
 * that doesn't decode or a logo that isn't a quick icon.
 */
export function readChatQrLink(
  href: unknown,
  origin: string | URL = baseUrl,
): { data: string; design: ChatDesign | null } | null {
  if (typeof href !== "string" || href.length > 16_384) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (`${url.origin}${url.pathname}` !== imageApiUrl(origin, {})) return null;
  const params = url.searchParams;
  const data = params.get("data");
  if (data === null) return null;
  const input = readChatQrInput(data);
  if (!(input.ok && input.data === data)) return null;

  const style = params.get("style");
  const logoIcon = params.get("logoIcon");
  if (style === null && logoIcon === null) return { data, design: null };
  const design = designFromParams(style, logoIcon);
  return design ? { data, design: orPlain(design) } : null;
}

/**
 * A design from a link's `style` and `logoIcon` values, or undefined when
 * either is invalid.
 */
export function designFromParams(
  style: string | null,
  logoIcon: string | null,
): ChatDesign | undefined {
  if (logoIcon !== null && !LOGO_ICON_IDS.includes(logoIcon as LogoIconId)) {
    return undefined;
  }
  let styles: ThemeStyles = {};
  let look: ChatDesign["look"] = null;
  if (style !== null) {
    const decoded = decodeStyleParam(style);
    if (!decoded) return undefined;
    const { showLogo: _showLogo, ...rest } = decoded.styles;
    styles = rest;
    const preset = decoded.preset as ChatLookId | undefined;
    look =
      preset && preset !== "plain" && isOption("look", preset) ? preset : null;
  }
  return {
    styles,
    logo: (logoIcon as LogoIconId | null) ?? null,
    look,
  };
}

/** The design as the image API's `style` and `logoIcon` values ("" when unset). */
export function designValues(design: ChatDesign | null): {
  style: string;
  logoIcon: string;
} {
  const params = designParams(design);
  return { style: params?.style ?? "", logoIcon: params?.logoIcon ?? "" };
}

// ── The scan check ──────────────────────────────────────────────────────────

/** What the reply says when the check changed the design. */
export const STYLE_NOTES = {
  adjusted: "Adjusted slightly so it scans reliably.",
  fallback:
    "That style didn't scan reliably with this content, so it's black on white instead.",
  failed: "That style couldn't be applied just now, so it's black on white.",
} as const;

export interface CheckedDesign {
  /** The design to send (null: the plain code) */
  design: ChatDesign | null;
  note: keyof typeof STYLE_NOTES | null;
}

export type ScoreFn = (
  value: string,
  style: ThemeStyles,
) => Promise<ScanScoreResult>;

/** The design in the vocabulary design_qr's loop repairs. */
function toDesignStyle(design: ChatDesign): DesignStyle {
  const style = fromThemeStyles(
    { ...BASE_STYLE, ...design.styles },
    { showLogo: false },
  );
  // A logo needs the most error correction (the editor's advice too).
  return design.logo
    ? { ...style, logo: design.logo, level: "H" }
    : { ...style, logo: "none" };
}

/**
 * `design` once it passes design_qr's scan check for `data`: as it is when
 * it's Great, repaired when that gets it there, else design_qr's classic
 * fallback. When even that isn't Great (very long content), or the content
 * doesn't fit the design's error correction, the plain code. The plain code
 * itself isn't checked: it's the image API's default, as before.
 */
export async function checkChatDesign(
  data: string,
  design: ChatDesign | null,
  score: ScoreFn = scoreDesign,
): Promise<CheckedDesign> {
  if (!design) return { design: null, note: null };
  try {
    const result = await runDesignLoop({
      value: data,
      initial: toDesignStyle(design),
      hasLogo: false,
      score,
    });
    if (result.grade !== "great") return { design: null, note: "fallback" };
    const { showLogo: _showLogo, ...styles } = toThemeStyles(result.style);
    const logo = result.style.logo;
    const checked = orPlain({
      styles,
      logo: LOGO_ICON_IDS.includes(logo as LogoIconId)
        ? (logo as LogoIconId)
        : null,
      look: result.fellBack ? null : design.look,
    });
    const note = result.fellBack
      ? "fallback"
      : result.repairs > 0 || result.changes.length > 0
        ? "adjusted"
        : null;
    return { design: checked, note };
  } catch (error) {
    if (error instanceof DesignTooLongError) {
      return { design: null, note: "fallback" };
    }
    throw error;
  }
}

/**
 * checkChatDesign for a reply: an unexpected failure (never the content) is
 * logged and the reply falls back to the plain code, so a code still goes
 * out.
 */
export async function checkForReply(
  data: string,
  design: ChatDesign | null,
  where: string,
): Promise<CheckedDesign> {
  try {
    return await checkChatDesign(data, design);
  } catch (error) {
    // The error's name and where it was thrown: its message could quote
    // what it was drawing.
    const safe = new Error("The style check failed");
    safe.name = error instanceof Error ? error.name : "Error";
    safe.stack = `${safe.name}: ${safe.message}\n${
      error instanceof Error
        ? (error.stack ?? "").split("\n").slice(1).join("\n")
        : ""
    }`;
    logError(safe, { action: `${where}.style-check` });
    return { design: null, note: "failed" };
  }
}

// ── Typed options ───────────────────────────────────────────────────────────

/** The options people can type after the content, as the CLI names them. */
export const CHAT_FLAGS = [
  "look",
  "fg",
  "bg",
  "eye-color",
  "dot-color",
  "body",
  "eye",
  "dot",
  "frame",
  "frame-text",
  "template",
  "logo",
] as const;
type ChatFlag = (typeof CHAT_FLAGS)[number];

/** Other names people reach for. */
const FLAG_ALIASES: Record<string, ChatFlag> = { color: "fg" };

/** Border templates by lower-case id ("default" is no border). */
const TEMPLATES = new Map(
  getTemplateIds().map((id) => [id.toLowerCase(), id] as const),
);

/**
 * Where the options start: the first `--word` after a space. Phones turn
 * "--" into an em or en dash, so "—look" counts too. A `--` inside a link
 * (`https://x.dev/a--b`) or before a space doesn't.
 */
const FLAGS_START = /(^|\s)(?:--|[—–])(?=[a-z])/i;
const FLAG = /^(?:--|[—–])([a-z][a-z-]*)$/i;
/** Quoted values (straight or curly quotes), or a bare word. */
const TOKEN = /"([^"]*)"|“([^”]*)”|'([^']*)'|‘([^’]*)’|(\S+)/g;

const list = (values: readonly string[]) => values.join(", ");
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const OPTIONS_TEXT = `Options: ${CHAT_FLAGS.map((flag) => `--${flag}`).join(", ")}.`;

function readColor(flag: string, raw: string): string | { error: string } {
  const named = CHAT_COLORS.find((color) => color.id === raw.toLowerCase());
  if (named) return named.hex;
  const hex = HEX.exec(raw)?.[1];
  if (!hex) {
    return {
      error: `--${flag} takes a hex color like 0051ff, or one of: ${list(CHAT_COLORS.map((color) => color.id))}.`,
    };
  }
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex;
  return `#${full.toUpperCase()}`;
}

function oneOf<T extends string>(
  flag: string,
  raw: string,
  values: readonly T[],
  noun: string,
): T | { error: string } {
  const found = values.find(
    (value) => value.toLowerCase() === raw.toLowerCase(),
  );
  return (
    found ?? {
      error: `There's no ${noun} "${raw.slice(0, 40)}". --${flag} takes one of: ${list(values)}.`,
    }
  );
}

class FlagError extends Error {}

/** The value, or a FlagError with what's wrong with it. */
function valid<T>(value: T | { error: string }): T {
  if (value && typeof value === "object" && "error" in value) {
    throw new FlagError(value.error);
  }
  return value as T;
}

/** One option's value checked into `choice`. Throws FlagError. */
function setFlag(choice: ChatStyleChoice, flag: ChatFlag, raw: string) {
  switch (flag) {
    case "look": {
      const typed = raw.toLowerCase().replace(/\s+/g, "");
      choice.look =
        CHAT_LOOKS.find(
          (look) => look.label.toLowerCase().replace(/\s+/g, "") === typed,
        )?.id ??
        valid(
          oneOf(
            flag,
            raw,
            CHAT_LOOKS.map((look) => look.id),
            "look",
          ),
        );
      return;
    }
    case "fg":
      choice.fg = valid(readColor(flag, raw));
      return;
    case "bg":
      choice.bg = valid(readColor(flag, raw));
      return;
    case "eye-color":
      choice.eyeColor = valid(readColor(flag, raw));
      return;
    case "dot-color":
      choice.dotColor = valid(readColor(flag, raw));
      return;
    case "body":
      choice.body = valid(oneOf(flag, raw, BODY_PATTERN, "dot shape"));
      return;
    case "eye":
      choice.eye = valid(oneOf(flag, raw, CORNER_EYE_PATTERNS, "eye shape"));
      return;
    case "dot":
      choice.dot = valid(
        oneOf(flag, raw, CORNER_EYE_DOT_PATTERNS, "eye center shape"),
      );
      return;
    case "frame":
      choice.frame = valid(oneOf(flag, raw, FRAME_STYLES, "frame"));
      return;
    case "frame-text":
      if (raw.length > FRAME_TEXT_MAX_LENGTH) {
        throw new FlagError(
          `--frame-text can be up to ${FRAME_TEXT_MAX_LENGTH} characters.`,
        );
      }
      choice.frameText = raw;
      return;
    case "template": {
      const id = TEMPLATES.get(raw.toLowerCase());
      if (!id) {
        throw new FlagError(
          `There's no border "${raw.slice(0, 40)}". --template takes one of: ${list([...TEMPLATES.values()])}.`,
        );
      }
      choice.template = id;
      return;
    }
    case "logo":
      choice.logo = valid(
        oneOf(flag, raw, ["none", ...LOGO_ICON_IDS] as const, "logo icon"),
      );
      return;
  }
}

export type ChatStyleFlags =
  | { ok: true; content: string; choice: ChatStyleChoice | null }
  | { ok: false; message: string };

/**
 * Splits what someone typed into the content (everything before the first
 * `--option`) and the options after it, checked. `--frame-text "Scan me"`
 * takes quotes; without them an option's value runs to the next option.
 */
export function readChatStyleFlags(raw: string): ChatStyleFlags {
  const start = FLAGS_START.exec(raw);
  if (!start) return { ok: true, content: raw, choice: null };
  const content = raw.slice(0, start.index);
  const rest = raw.slice(start.index + start[1].length);

  const flags: { name: string; parts: string[] }[] = [];
  for (const match of rest.matchAll(TOKEN)) {
    const bare = match[5];
    const flag = bare ? FLAG.exec(bare) : null;
    if (flag) {
      flags.push({ name: (flag[1] as string).toLowerCase(), parts: [] });
      continue;
    }
    const value =
      match[1] ?? match[2] ?? match[3] ?? match[4] ?? (bare as string);
    flags.at(-1)?.parts.push(value);
  }

  const choice: ChatStyleChoice = {};
  for (const { name, parts } of flags) {
    const flag =
      FLAG_ALIASES[name] ??
      (CHAT_FLAGS as readonly string[]).find((known) => known === name);
    if (!flag) {
      return {
        ok: false,
        message: `There's no option --${name.slice(0, 30)}. ${OPTIONS_TEXT}`,
      };
    }
    const value = parts.join(" ").trim();
    if (!value) {
      return { ok: false, message: `--${flag} needs a value.` };
    }
    try {
      setFlag(choice, flag as ChatFlag, value);
    } catch (error) {
      if (error instanceof FlagError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }
  return { ok: true, content, choice };
}

export type ChatQrAsk =
  | { ok: true; data: string; url: string | null; design: ChatDesign | null }
  | { ok: false; reason: "empty" | "too_long" }
  | { ok: false; reason: "options"; message: string };

/**
 * What someone typed, as content and an unchecked design: readChatStyleFlags
 * then readChatQrInput. Pass the design through checkChatDesign before
 * sending it.
 */
export function readChatQrAsk(raw: string): ChatQrAsk {
  const flags = readChatStyleFlags(raw);
  if (!flags.ok)
    return { ok: false, reason: "options", message: flags.message };
  const input = readChatQrInput(flags.content);
  if (!input.ok) return input;
  return {
    ...input,
    design: flags.choice ? applyChoice(null, flags.choice) : null,
  };
}

/** Content taken as it is, options and all (a message someone else wrote). */
export function readPlainChatQrAsk(raw: string): ChatQrAsk {
  const input = readChatQrInput(raw);
  return input.ok ? { ...input, design: null } : input;
}
