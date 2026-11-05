// Text people publish (names, descriptions, display names, frame labels):
// cleaned the same way the engine cleans frame labels, and refused when it
// carries contact details or links, so an item can't be used to spread
// them. Safe to import anywhere.
import { sanitizeFrameText } from "qrdx/types";

const LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|co|me|ly|xyz|info|biz)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;

/** Trimmed, single-spaced, no control or invisible characters, `max` long. */
export function cleanText(text: string, max: number): string {
  return sanitizeFrameText(text ?? "", max);
}

/** Why published text is refused, or null when it's fine. */
export function textProblem(text: string): string | null {
  if (EMAIL.test(text)) {
    return "Leave email addresses out of names, labels and descriptions.";
  }
  if (LINK.test(text)) {
    return "Leave links out of names, labels and descriptions.";
  }
  if (PHONE.test(text)) {
    return "Leave phone numbers out of names, labels and descriptions.";
  }
  return null;
}

/** "Wi-Fi table card" → "wi-fi-table-card" (a-z, 0-9 and "-"). */
export function slugify(text: string, max = 48): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

// Links (with or without a scheme), emails and phone numbers, matched
// anywhere in the text.
const URLS = /\b(?:https?|ftp|file|data|javascript):\S*|\bwww\.\S+/gi;
const DOMAINS =
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|app|co|me|ly|xyz|info|biz|ai|gg|so|to|link|site|online|shop|store)\b\S*/gi;
const EMAILS = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONES = /\+?\d[\d\s().-]{7,}\d/g;
const MARKUP = /[<>`{}[\]|\\]/g;

/**
 * Text someone else wrote, made safe to hand to an agent or show as a
 * draft: one line, no control or invisible characters, no links, emails,
 * phone numbers or markup characters, at most `max` characters. Used for
 * community text read back by the API and MCP, and for what the chat's
 * model drafts before a person publishes it.
 */
export function untrustedText(text: string | null | undefined, max: number) {
  if (!text) return "";
  const stripped = cleanText(text, 1000)
    .replace(URLS, " ")
    .replace(EMAILS, " ")
    .replace(DOMAINS, " ")
    .replace(PHONES, " ")
    .replace(MARKUP, " ");
  const clean = cleanText(stripped, Number.MAX_SAFE_INTEGER);
  const chars = Array.from(clean);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : clean;
}
