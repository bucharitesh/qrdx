// vCard 3.0 (RFC 2426) for a page's contact block: the most widely imported
// version (iOS, Android, Outlook). Text is escaped per RFC 2426 §4 / RFC 6350
// §3.4, lines end in CRLF and are folded at 75 octets without splitting
// UTF-8 characters.

import type { ContactProps } from "@/lib/landing/blocks/contact";

export type VCardPhoto =
  | { kind: "inline"; base64: string; type: "JPEG" | "PNG" | "GIF" | "WEBP" }
  | { kind: "uri"; uri: string };

export interface VCardInput {
  contact: ContactProps;
  photo?: VCardPhoto | null;
  /** Social profile links (network id → URL) */
  socials?: Array<{ network: string; url: string }>;
}

/** Escapes a TEXT value: backslash, newline, comma and semicolon. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** URIs are not TEXT: keep commas, only drop line breaks. */
const uriValue = (value: string) => value.replace(/[\r\n]+/g, "");

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (CRLF + one space continuation). */
export function foldLine(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
  if (/^[\x00-\x7f]*$/.test(line)) {
    if (line.length <= 75) return line;
    const chunks = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74)
      chunks.push(line.slice(i, i + 74));
    return chunks.join("\r\n ");
  }
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, so they hold 74 octets of content.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const PHONE_TYPES: Record<ContactProps["phones"][number]["type"], string> = {
  mobile: "CELL,VOICE",
  work: "WORK,VOICE",
  home: "HOME,VOICE",
  fax: "FAX",
  other: "VOICE",
};

const EMAIL_TYPES: Record<ContactProps["emails"][number]["type"], string> = {
  work: "INTERNET,WORK",
  home: "INTERNET,HOME",
  other: "INTERNET",
};

const paramValue = (value: string) => value.replace(/[^A-Za-z0-9-]/g, "");

export function buildVCard({
  contact,
  photo,
  socials = [],
}: VCardInput): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const fn = name || contact.company || "Contact";
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  lines.push(
    `N:${[contact.lastName, contact.firstName, "", "", ""].map(escapeText).join(";")}`,
    `FN:${escapeText(fn)}`,
  );
  if (contact.company) lines.push(`ORG:${escapeText(contact.company)}`);
  if (!name && contact.company) lines.push("X-ABShowAs:COMPANY");
  if (contact.jobTitle) lines.push(`TITLE:${escapeText(contact.jobTitle)}`);

  for (const phone of contact.phones) {
    const number = phone.number.replace(/[^\d+]/g, "");
    if (number) lines.push(`TEL;TYPE=${PHONE_TYPES[phone.type]}:${number}`);
  }
  for (const email of contact.emails) {
    lines.push(
      `EMAIL;TYPE=${EMAIL_TYPES[email.type]}:${escapeText(email.address)}`,
    );
  }
  if (contact.website) lines.push(`URL:${uriValue(contact.website)}`);

  const { street, city, region, postalCode, country } = contact.address;
  if (street || city || region || postalCode || country) {
    lines.push(
      `ADR;TYPE=WORK:${["", "", street, city, region, postalCode, country]
        .map(escapeText)
        .join(";")}`,
    );
  }
  if (contact.bio) lines.push(`NOTE:${escapeText(contact.bio)}`);

  for (const social of socials) {
    if (!/^https?:\/\//i.test(social.url)) continue;
    lines.push(
      `X-SOCIALPROFILE;TYPE=${paramValue(social.network) || "other"}:${uriValue(social.url)}`,
    );
  }

  if (photo?.kind === "inline") {
    lines.push(`PHOTO;ENCODING=b;TYPE=${photo.type}:${photo.base64}`);
  } else if (photo?.kind === "uri") {
    lines.push(`PHOTO;VALUE=uri:${uriValue(photo.uri)}`);
  }

  lines.push("END:VCARD");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** ASCII file name for Content-Disposition, e.g. "Alex_Morgan.vcf". */
export function vcardFilename(contact: ContactProps): string {
  const base =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.company ||
    "contact";
  const ascii = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return `${ascii || "contact"}.vcf`;
}
