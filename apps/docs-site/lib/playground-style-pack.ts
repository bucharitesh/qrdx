// How a design is written into the playground's `style` parameter: "1."
// followed by base64url-encoded JSON with short keys. Only the packing, with
// no validation and no dependencies, so a marketing page's own client code
// (the home hero's style picker, the studio demo) can link its look without
// shipping the validator. Anything that comes from a person's saved design
// goes through encodeStyleParam (lib/playground-style.ts) instead, which
// checks every field first; the playground's decodeStyleParam checks every
// link either way and rejects a value with anything off.

import { STYLE_PARAM_VERSION } from "@/lib/playground-links";
import type { ThemeStyles } from "@/types/theme";

/** Short key for each style field a link may carry. */
export const STYLE_KEYS = {
  bgColor: "b",
  fgColor: "f",
  eyeColor: "e",
  dotColor: "d",
  bodyPattern: "p",
  cornerEyePattern: "c",
  cornerEyeDotPattern: "o",
  level: "l",
  margin: "m",
  templateId: "t",
  frame: "r",
  showLogo: "g",
  // Engine options the editor exposes (see ENGINE_OPTION_FIELDS in
  // lib/playground-style.ts)
  eyeColors: "ec",
  moduleScale: "ms",
  autoLevel: "al",
  logoOptions: "lo",
  shape: "sh",
} as const satisfies Partial<Record<keyof ThemeStyles, string>>;

export type LinkedField = keyof typeof STYLE_KEYS;

/** The fields a `style` value can hold. */
export type LinkableStyle = Partial<Pick<ThemeStyles, LinkedField>>;

/** Key of the preset the design started from (a label and Reset base only). */
export const PRESET_KEY = "k";

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Key of the official QRdx frame (qrdx OFFICIAL_FRAMES) a custom frame
 * draws: the link names it by id instead of carrying its spec, which is
 * most of a frame's size. The frame's own colors and labels stay in `r`.
 */
export const OFFICIAL_FRAME_KEY = "of";

/**
 * A `style` value for `style`: its linkable fields under their short keys,
 * and the preset it started from. Fields a link can't carry (a logo, art,
 * content) are left out; nothing else is checked here. `officialFrame`:
 * the id of the official frame whose exact spec the frame uses (the caller
 * checks that), sent in place of the spec.
 */
export function packStyleParam(
  style: LinkableStyle,
  preset?: string,
  officialFrame?: string,
): string {
  const compact: Record<string, unknown> = {};
  for (const field of Object.keys(STYLE_KEYS) as LinkedField[]) {
    if (style[field] !== undefined) compact[STYLE_KEYS[field]] = style[field];
  }
  const frame = compact[STYLE_KEYS.frame];
  if (officialFrame && frame && typeof frame === "object") {
    const { spec: _spec, ...rest } = frame as Record<string, unknown>;
    compact[STYLE_KEYS.frame] = rest;
    compact[OFFICIAL_FRAME_KEY] = officialFrame;
  }
  if (preset) compact[PRESET_KEY] = preset;
  return `${STYLE_PARAM_VERSION}.${toBase64Url(JSON.stringify(compact))}`;
}
