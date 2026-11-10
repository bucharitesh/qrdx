import "server-only";

import { imageApiUrl } from "@/lib/agents/hosts";
import { baseUrl } from "@/lib/metadata";
import { parseLinkUrl, playgroundHref } from "@/lib/playground-links";
import {
  QR_DATA_MAX_LENGTH,
  QR_DEFAULTS,
  QrDataTooLongError,
  renderQrSvg,
} from "@/lib/qr-render";

// What the chat bots (Slack, Discord, Telegram) share: reading what someone
// typed into the content of a QR code, and the links a reply offers. Each bot
// turns its own message format into plain text first (Slack's <url|label>
// links and &amp; escapes, mentions, Discord's <url> embeds) and builds its
// own message layout from ChatQrLinks.
//
// The image is the keyless image API (/v1/qr), so a reply is a URL the chat
// service fetches itself: nothing is uploaded or stored.

/** Width and height of the PNG a reply shows, in pixels. */
export const CHAT_QR_PNG_SIZE = 1024;

/** Longest content shown in a caption or alt text before it's cut short. */
const CAPTION_MAX = 120;

export type ChatQrInput =
  | {
      ok: true;
      /** The exact content the QR code encodes. */
      data: string;
      /** The web address, when the content is one (http or https). */
      url: string | null;
    }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * Reads what someone typed into QR code content. Trims surrounding space,
 * keeps line breaks inside it (a text code may have several lines), and
 * checks it fits in a QR code at the image API's default error correction,
 * so a bot never posts an image that would fail to render.
 */
export function readChatQrInput(raw: string): ChatQrInput {
  const data = raw.trim();
  if (!data) return { ok: false, reason: "empty" };
  if (data.length > QR_DATA_MAX_LENGTH)
    return { ok: false, reason: "too_long" };
  if (!fitsInQrCode(data)) return { ok: false, reason: "too_long" };
  return { ok: true, data, url: webAddress(data) };
}

export interface ChatQrLinks {
  /** PNG, CHAT_QR_PNG_SIZE wide: what chat services can show inline. */
  png: string;
  /** SVG at the default size, for print and design tools. */
  svg: string;
  /**
   * The editor. A web address is carried after the `#` (playgroundHref);
   * any other content never goes in a link, so text opens an empty editor.
   */
  editor: string;
}

/** The image and editor links for one piece of content. */
export function chatQrLinks(
  data: string,
  origin: string | URL = baseUrl,
): ChatQrLinks {
  const url = webAddress(data);
  return {
    png: imageApiUrl(origin, {
      data,
      format: "png",
      size: String(CHAT_QR_PNG_SIZE),
    }),
    svg: imageApiUrl(origin, { data }),
    editor: new URL(playgroundHref(url ? { url } : {}), origin).toString(),
  };
}

/** Content shortened for a caption, alt text or notification preview. */
export function chatQrCaption(data: string, max = CAPTION_MAX): string {
  const oneLine = data.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** The first http(s) address in a message, for "make a code from this message". */
export function firstWebAddress(text: string): string | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`|]+/gi)) {
    // Trailing punctuation belongs to the sentence, not the address.
    const candidate = match[0].replace(/[.,;:!?)\]}]+$/, "");
    const url = webAddress(candidate);
    if (url) return url;
  }
  return null;
}

/** `value` itself when it is one web address (the editor's rule), else null. */
function webAddress(value: string): string | null {
  if (/\s/.test(value)) return null;
  return parseLinkUrl(value) ? value : null;
}

function fitsInQrCode(data: string): boolean {
  try {
    renderQrSvg({ ...QR_DEFAULTS, data, size: 64, margin: 0 });
    return true;
  } catch (error) {
    if (error instanceof QrDataTooLongError) return false;
    throw error;
  }
}
