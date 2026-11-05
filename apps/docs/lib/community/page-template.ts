import "server-only";

import { z } from "zod";
import { PAGE_SETTINGS_TYPE } from "@/components/landing/page-settings-block";
import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import { getTemplate } from "@/lib/landing/templates";
import { TEMPLATE_MEDIA_PATH } from "@/lib/landing/templates/media";
import { baseUrl } from "@/lib/metadata";
import type { LandingBlock, LandingPageContent } from "@/types/landing";

// A hosted page published as a community page template. Before anything is
// stored, the page is scrubbed of personal data, because a template is a
// layout other people fill in, never someone's real page:
//
// - every link becomes https://example.com (app store, video and calendar
//   links become neutral ones of the same kind), mailto:/tel:/sms: links and
//   every email address and phone number become sample ones;
// - postal addresses, contact names and companies, event organizers and
//   Wi-Fi network names and passwords become sample data;
// - uploaded photos and files (and any picture linked from elsewhere) are
//   removed. Photos and marks from QRdx's own template library
//   (public/images/templates, Unsplash License or drawn by QRdx) are kept;
// - links, emails and phone numbers written inside text become sample ones;
// - page settings (share image, description, custom CSS) and hidden blocks
//   are left out, and a block that no longer works without what was removed
//   (a PDF without its file, say) is left out too.
//
// The result is validated like a page save, then checked again on every
// read. The person sees the scrubbed page and what changed before they
// publish (the dashboard's publish dialog).

/** Largest page template payload (JSON characters). */
export const PAGE_TEMPLATE_MAX_LENGTH = 256_000;

export const SAMPLE_LINK = "https://example.com";
export const SAMPLE_EMAIL = "hello@example.com";
export const SAMPLE_PHONE = "+1 555 0100";
const SAMPLE_ADDRESS = {
  street: "123 Main Street",
  city: "Springfield",
  region: "",
  postalCode: "",
  country: "",
};
const SAMPLE_ADDRESS_LINE = "123 Main Street, Springfield";
const SAMPLE_NAMES: Record<string, string> = {
  firstName: "Alex",
  lastName: "Morgan",
  company: "Example Studio",
  organizer: "Example Studio",
};
/** Links that must stay on a host of their kind to stay valid. */
const SAMPLE_KIND_LINKS: Record<string, string> = {
  appStoreUrl: "https://apps.apple.com/",
  playStoreUrl: "https://play.google.com/store/apps",
};

export interface ScrubReport {
  /** Links replaced with https://example.com */
  links: number;
  emails: number;
  phones: number;
  /** Postal addresses */
  addresses: number;
  /** Contact names, companies and event organizers */
  names: number;
  /** Wi-Fi network names and passwords */
  wifi: number;
  /** Uploaded or linked photos removed */
  images: number;
  /** Uploaded files removed (PDF, audio, video, downloads) */
  files: number;
  /** Blocks left out because they didn't work without what was removed */
  blocks: string[];
  /** Hidden blocks left out */
  hidden: number;
  /** Share image, description and custom CSS left out */
  settings: boolean;
  /** Photos kept from QRdx's template library */
  libraryPhotos: number;
}

const emptyReport = (): ScrubReport => ({
  links: 0,
  emails: 0,
  phones: 0,
  addresses: 0,
  names: 0,
  wifi: 0,
  images: 0,
  files: 0,
  blocks: [],
  hidden: 0,
  settings: false,
  libraryPhotos: 0,
});

/** Keys whose values are never personal data: ids, enums, codes, dates. */
const STRUCTURAL_KEYS = new Set([
  "id",
  "type",
  "code",
  "barcode",
  "barcodeValue",
  "validFrom",
  "validUntil",
  "start",
  "end",
  "timeZone",
  "network",
  "platform",
  "security",
  "font",
  "headingFont",
  "layout",
  "style",
  "size",
  "align",
  "shape",
  "avatarShape",
  "buttonShape",
  "texture",
  "spacing",
  "fileId",
]);
const PHONE_KEYS = new Set(["number", "phone", "phoneNumber", "mobile"]);
const POSTAL_KEYS = ["street", "city", "region", "postalCode", "country"];

const EMAIL_ONLY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
const URL_IN_TEXT =
  /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+|\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|co|me|ly|xyz|info|biz|ai|shop|store|site)\b(?:\/[^\s<>"')]*)?/gi;
// Not inside a word, a path or a longer number; a full stop may follow.
const PHONE_IN_TEXT = /(?<![\w/]|\d[.-])\+?\d[\d ().-]{6,}\d(?![\w/]|[.-]\d)/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
/** A whole value that is a link: a known scheme and no spaces. */
const LINK_ONLY =
  /^(?:https?|mailto|tel|sms|javascript|data|ftp|file|vbscript):\S+$/i;
/** Keys of pictures (the rest of the uploads are files). */
const PICTURE_KEYS = new Set(["cover", "poster", "images", "photo", "photos"]);

const digits = (text: string) => text.replace(/\D/g, "").length;
const looksLikePhone = (text: string) =>
  digits(text) >= 7 && /^\+?[0-9 ()./-]+$/.test(text.trim());

/** Origins QRdx's template media is served from (here and in production). */
const MEDIA_ORIGINS = new Set([new URL(baseUrl).origin, "https://qrdx.dev"]);
const MEDIA_FILE = new RegExp(
  `^${TEMPLATE_MEDIA_PATH.replace(/\//g, "\\/")}[a-z0-9-]+(?:\\.sm)?\\.(?:webp|svg)$`,
);

/** A photo or mark from QRdx's own template library (licence-checked). */
export function isLibraryMedia(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      MEDIA_ORIGINS.has(url.origin) &&
      MEDIA_FILE.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const REMOVED = Symbol("removed");
type Scrubbed = unknown | typeof REMOVED;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

class Scrubber {
  readonly report = emptyReport();

  constructor(private readonly blockType: string) {}

  /** Text with links, emails and phone numbers written inside it replaced. */
  text(value: string): string {
    let next = value.replace(EMAIL_IN_TEXT, () => {
      this.report.emails++;
      return SAMPLE_EMAIL;
    });
    next = next.replace(URL_IN_TEXT, (match) => {
      if (match === "example.com" || match.startsWith(SAMPLE_LINK)) {
        return match;
      }
      this.report.links++;
      return "example.com";
    });
    next = next.replace(PHONE_IN_TEXT, (match) => {
      if (digits(match) < 8 || ISO_DATE.test(match)) return match;
      if (match.replace(/\D/g, "") === SAMPLE_PHONE.replace(/\D/g, "")) {
        return match;
      }
      this.report.phones++;
      return SAMPLE_PHONE;
    });
    return next;
  }

  /** A string that is a link, or null when it isn't one. */
  link(key: string, value: string): string | null {
    if (!LINK_ONLY.test(value.trim())) return null;
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return null;
    }
    if (url.protocol === "mailto:") {
      this.report.emails++;
      return `mailto:${SAMPLE_EMAIL}`;
    }
    if (url.protocol === "tel:" || url.protocol === "sms:") {
      this.report.phones++;
      return `${url.protocol}+15550100`;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      this.report.links++;
      return SAMPLE_LINK;
    }
    if (isLibraryMedia(value) || value.startsWith(SAMPLE_LINK)) return value;
    this.report.links++;
    if (SAMPLE_KIND_LINKS[key]) return SAMPLE_KIND_LINKS[key];
    if (this.blockType === "video-embed" && key === "url") {
      const fallback = getBlock("video-embed")?.defaults as
        | { url?: string }
        | undefined;
      return fallback?.url ?? SAMPLE_LINK;
    }
    return SAMPLE_LINK;
  }

  string(key: string, value: string): string {
    if (STRUCTURAL_KEYS.has(key) || !value.trim()) return value;
    if (key === "password") {
      this.report.wifi++;
      return "your-password";
    }
    if (key === "ssid") {
      this.report.wifi++;
      return "Guest Wi-Fi";
    }
    if (
      SAMPLE_NAMES[key] &&
      (this.blockType === "contact" || key === "organizer")
    ) {
      this.report.names++;
      return SAMPLE_NAMES[key];
    }
    const link = this.link(key, value);
    if (link !== null) return link;
    if (EMAIL_ONLY.test(value.trim())) {
      this.report.emails++;
      return SAMPLE_EMAIL;
    }
    if (PHONE_KEYS.has(key) && looksLikePhone(value)) {
      this.report.phones++;
      return SAMPLE_PHONE;
    }
    if (key === "address") {
      this.report.addresses++;
      return SAMPLE_ADDRESS_LINE;
    }
    return this.text(value);
  }

  /** A picture or file: kept from QRdx's library, otherwise removed. */
  media(value: Record<string, unknown>, kind: "images" | "files"): Scrubbed {
    if (isLibraryMedia(value.url)) {
      this.report.libraryPhotos++;
      return value;
    }
    this.report[kind]++;
    return REMOVED;
  }

  value(key: string, value: unknown, parentKey = ""): Scrubbed {
    if (typeof value === "string") return this.string(key, value);
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const item of value) {
        const next = this.value(key, item, key);
        if (next !== REMOVED) items.push(next);
      }
      return items;
    }
    if (!isRecord(value)) return value;

    // An uploaded file, or a file or picture linked from elsewhere.
    const isFile = value.type === "file" && typeof value.fileId === "string";
    const isLinkedFile = value.type === "url" && typeof value.url === "string";
    if (isFile || isLinkedFile) {
      const picture = PICTURE_KEYS.has(key) || PICTURE_KEYS.has(parentKey);
      return this.media(value, picture ? "images" : "files");
    }
    // A picture ({ url, alt }).
    if (typeof value.url === "string" && "alt" in value) {
      return this.media(value, "images");
    }
    // A postal address.
    if (key === "address" && POSTAL_KEYS.some((part) => part in value)) {
      if (POSTAL_KEYS.some((part) => String(value[part] ?? "").trim())) {
        this.report.addresses++;
        return { ...SAMPLE_ADDRESS };
      }
      return value;
    }

    const next: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      const scrubbed = this.value(childKey, child, key);
      if (scrubbed === REMOVED) {
        // An item that was only its file (a gallery photo, a download, a
        // track) goes with it.
        if (childKey === "source" && key !== "") return REMOVED;
        continue;
      }
      next[childKey] = scrubbed;
    }
    return next;
  }
}

function addReports(into: ScrubReport, from: ScrubReport) {
  for (const key of [
    "links",
    "emails",
    "phones",
    "addresses",
    "names",
    "wifi",
    "images",
    "files",
    "hidden",
    "libraryPhotos",
  ] as const) {
    into[key] += from[key];
  }
}

function scrubTheme(
  theme: LandingPageContent["theme"],
  report: ScrubReport,
): LandingPageContent["theme"] {
  const next = { ...theme };
  if (next.background?.type === "image") {
    if (isLibraryMedia(next.background.url)) {
      report.libraryPhotos++;
    } else {
      report.images++;
      next.background = { type: "solid" };
    }
  }
  if (next.logo) {
    if (isLibraryMedia(next.logo.url)) {
      report.libraryPhotos++;
    } else {
      report.images++;
      delete next.logo;
    }
  }
  return next;
}

/** `content` with personal data taken out, and what was changed. */
export function scrubPageContent(content: LandingPageContent): {
  content: LandingPageContent;
  report: ScrubReport;
} {
  const report = emptyReport();
  const blocks: LandingBlock[] = [];
  for (const block of content.blocks) {
    if (block.type === PAGE_SETTINGS_TYPE) {
      report.settings = true;
      continue;
    }
    if (block.hidden) {
      report.hidden++;
      continue;
    }
    const definition = getBlock(block.type);
    if (!definition) {
      report.blocks.push(block.type);
      continue;
    }
    const scrubber = new Scrubber(block.type);
    const props = scrubber.value("", block.props);
    addReports(report, scrubber.report);
    const parsed = definition.schema.safeParse(props);
    if (!parsed.success) {
      report.blocks.push(definition.label);
      continue;
    }
    blocks.push({ id: block.id, type: block.type, props: parsed.data });
  }
  return {
    content: { ...content, theme: scrubTheme(content.theme, report), blocks },
    report,
  };
}

/** Plain lines for the publish dialog: what the scrub changed. */
export function scrubSummary(report: ScrubReport): string[] {
  const lines: string[] = [];
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  if (report.links) {
    lines.push(
      `${count(report.links, "link", "links")} replaced with example.com`,
    );
  }
  if (report.emails || report.phones) {
    const parts = [
      report.emails
        ? count(report.emails, "email address", "email addresses")
        : "",
      report.phones
        ? count(report.phones, "phone number", "phone numbers")
        : "",
    ].filter(Boolean);
    lines.push(`${parts.join(" and ")} replaced with sample ones`);
  }
  if (report.addresses) {
    lines.push(
      `${count(report.addresses, "address", "addresses")} replaced with a sample address`,
    );
  }
  if (report.names) {
    lines.push(
      `${count(report.names, "name", "names")} replaced with sample ones`,
    );
  }
  if (report.wifi) {
    lines.push("Wi-Fi network name and password replaced with sample ones");
  }
  if (report.images) {
    lines.push(
      `${count(report.images, "photo", "photos")} you uploaded or linked removed`,
    );
  }
  if (report.files) {
    lines.push(`${count(report.files, "file", "files")} removed`);
  }
  if (report.blocks.length) {
    lines.push(
      `Left out because they need your own files or details: ${[...new Set(report.blocks)].join(", ")}`,
    );
  }
  if (report.hidden) {
    lines.push(
      `${count(report.hidden, "hidden block", "hidden blocks")} left out`,
    );
  }
  if (report.settings) {
    lines.push("Share image, description and custom CSS left out");
  }
  return lines;
}

const SLUG = /^[a-z][a-z0-9-]{0,47}$/;

/** What a page template item stores: the page type and its content. */
export const pageTemplatePayloadSchema = z
  .object({
    page: z
      .object({ type: z.string().regex(SLUG), content: z.unknown() })
      .strict(),
  })
  .strict();

export type PageTemplatePayload = {
  page: { type: string; content: LandingPageContent };
};

/**
 * A stored page template made usable, or null: a known page type and
 * content that still validates (blocks that don't are dropped on read, as
 * on a live page).
 */
export function readPageTemplate(
  payload: unknown,
  mode: "read" | "write" = "read",
): PageTemplatePayload | null {
  const parsed = pageTemplatePayloadSchema.safeParse(payload);
  if (!parsed.success || !getTemplate(parsed.data.page.type)) return null;
  const content = parseLandingPageContent(parsed.data.page.content, { mode });
  if (!content.success) return null;
  return { page: { type: parsed.data.page.type, content: content.data } };
}

/** Whether the page shows a photo or mark from QRdx's template library. */
export function usesLibraryMedia(content: LandingPageContent): boolean {
  let found = false;
  const visit = (value: unknown) => {
    if (found) return;
    if (typeof value === "string") {
      found = isLibraryMedia(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (isRecord(value)) {
      Object.values(value).forEach(visit);
    }
  };
  visit(content);
  return found;
}
