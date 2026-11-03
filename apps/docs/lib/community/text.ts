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
