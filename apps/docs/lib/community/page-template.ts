import "server-only";

import { z } from "zod";
import { PAGE_SETTINGS_TYPE } from "@/components/landing/page-settings-block";
import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import { getTemplate } from "@/lib/landing/templates";
import type { LandingBlock, LandingPageContent } from "@/types/landing";
import { textProblem } from "./text";

// A hosted page published as a community page template. A template is a
// layout other people fill in, never someone's real page, so before
// anything is stored the page is scrubbed with an allowlist (fail-closed):
//
// - Text: every string the person typed is replaced with neutral sample
//   text for its field ("Your name", "Event name", "Venue"). Only values on
//   the structural list below (ids, enums, dates, times, colours) are kept
//   as they are, so a block field added later is scrubbed by default. The
//   publisher can keep their own text field by field in the review step;
//   kept text must still pass the personal-data check (links, emails,
//   @handles, phone numbers, street addresses, and anything the scrub took
//   out elsewhere on the page, such as the Wi-Fi password).
// - Links become https://example.com (app store and video links neutral
//   ones of their kind); emails, phone numbers, postal addresses, Wi-Fi
//   names and passwords and coupon codes become samples. These can't be
//   kept.
// - Every picture is removed, QRdx's template library included (owner
//   decision: a template is purely CC0): uploads, linked images, logos,
//   background and share images, audio covers, video posters. Each slot is
//   left empty to fill in after "Use template". Uploaded files go too, and
//   a block that only worked with its file (PDF, video, audio, downloads)
//   is left out.
// - Page settings (share image, description, custom CSS) and hidden blocks
//   are left out.
//
// The result is validated like a page save. The person reviews it, and
// what they chose to keep, before publishing.

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
const SAMPLE_COUPON_CODE = "SAVE10";
/** Links that must stay on a host of their kind to stay valid. */
const SAMPLE_KIND_LINKS: Record<string, string> = {
  appStoreUrl: "https://apps.apple.com/",
  playStoreUrl: "https://play.google.com/store/apps",
};

/** Neutral sample text by field name; anything else becomes "Text". */
const SAMPLE_TEXT: Record<string, string> = {
  title: "Title",
  subtitle: "A line about you",
  eyebrow: "Label",
  heading: "Heading",
  body: "A few words about this.",
  description: "A short description.",
  label: "Link",
  name: "Name",
  note: "A note",
  jobTitle: "Your job title",
  bio: "A line about you",
  company: "Your company",
  firstName: "Your",
  lastName: "Name",
  venue: "Venue",
  organizer: "Organizer",
  headline: "Your offer",
  terms: "Terms apply.",
  caption: "Caption",
  alt: "",
  submitLabel: "Send",
  successMessage: "Thank you!",
  question: "Your question",
  placeholder: "",
  priceNote: "",
  openLabel: "Open",
};
/** Sample text that depends on the block. */
const BLOCK_SAMPLE_TEXT: Record<string, Record<string, string>> = {
  header: { title: "Your name" },
  event: { title: "Event name" },
  menu: { title: "Section", name: "Item" },
  button: { label: "Button" },
  coupon: { headline: "Your offer" },
  "address-map": { name: "Place name" },
};
const SAMPLE_FALLBACK = "Text";

/**
 * Values kept as they are: structure, never something a person wrote
 * about themselves. Everything else is replaced (fail-closed).
 */
const STRUCTURAL_KEYS = new Set([
  "id",
  "type",
  "barcode",
  "validFrom",
  "validUntil",
  "start",
  "end",
  "open",
  "close",
  "timeZone",
  "timezone",
  "currency",
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
  "columns",
  "variant",
  "diet",
  "allergens",
  "fileId",
]);
const PHONE_KEYS = new Set(["number", "phone", "phoneNumber", "mobile"]);
const POSTAL_KEYS = ["street", "city", "region", "postalCode", "country"];
const EMAIL_ONLY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A whole value that is a link: a known scheme and no spaces. */
const LINK_ONLY =
  /^(?:https?|mailto|tel|sms|javascript|data|ftp|file|vbscript):\S+$/i;
const HEX = /^#[0-9a-f]{3,8}$/i;
/** Keys of pictures (the rest of the uploads are files). */
const PICTURE_KEYS = new Set(["cover", "poster", "images", "photo", "photos"]);
/** Blocks that only work with their file; left out when it's removed. */
const FILE_BLOCKS: Record<string, (props: Record<string, unknown>) => boolean> =
  {
    pdf: (props) => props.source == null,
    "video-file": (props) => props.source == null,
    audio: (props) => !Array.isArray(props.tracks) || props.tracks.length === 0,
    "file-download": (props) =>
      !Array.isArray(props.files) || props.files.length === 0,
  };

export interface ScrubReport {
  /** Text fields replaced with sample text */
  texts: number;
  /** Text fields the publisher kept */
  kept: number;
  /** Links replaced with https://example.com */
  links: number;
  emails: number;
  phones: number;
  /** Postal addresses */
  addresses: number;
  /** Wi-Fi network names and passwords */
  wifi: number;
  /** Coupon codes and barcode values */
  codes: number;
  /** Pictures removed (uploads, links, QRdx's library, logos, covers) */
  images: number;
  /** Uploaded files removed (PDF, audio, video, downloads) */
  files: number;
  /** Blocks left out because they didn't work without what was removed */
  blocks: string[];
  /** Hidden blocks left out */
  hidden: number;
  /** Share image, description and custom CSS left out */
  settings: boolean;
}

const emptyReport = (): ScrubReport => ({
  texts: 0,
  kept: 0,
  links: 0,
  emails: 0,
  phones: 0,
  addresses: 0,
  wifi: 0,
  codes: 0,
  images: 0,
  files: 0,
  blocks: [],
  hidden: 0,
  settings: false,
});

/** A text field the scrub replaced; the publisher may keep it. */
export interface ScrubbedField {
  /** "<block id>:<path>", e.g. "h1:title" or "l1:items.0.label" */
  id: string;
  /** "Header", "Link list" */
  block: string;
  /** "title", "items 1 label" */
  field: string;
  original: string;
  sample: string;
}

/** Kept text that can't be published, and why. */
export interface KeptProblem {
  id: string;
  message: string;
}

const REMOVED = Symbol("removed");
type Scrubbed = unknown | typeof REMOVED;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fieldLabel = (path: string[]) =>
  path
    .map((part) => (/^\d+$/.test(part) ? String(Number(part) + 1) : part))
    .join(" ");

class Scrubber {
  readonly report = emptyReport();
  readonly fields: ScrubbedField[] = [];
  /** What was taken out elsewhere on the page (kept text can't repeat it) */
  readonly secrets = new Set<string>();
  private readonly kept: { field: ScrubbedField }[] = [];

  constructor(
    private readonly block: LandingBlock,
    private readonly blockLabel: string,
    private readonly keep: ReadonlySet<string>,
  ) {}

  private secret(value: string) {
    const trimmed = value.trim();
    if (trimmed.length >= 4) this.secrets.add(trimmed.toLowerCase());
  }

  /** A string that is a link, or null when it isn't one. */
  private link(key: string, value: string): string | null {
    if (!LINK_ONLY.test(value.trim())) return null;
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return null;
    }
    if (value.startsWith(SAMPLE_LINK)) return value;
    if (url.protocol === "mailto:") {
      this.report.emails++;
      return `mailto:${SAMPLE_EMAIL}`;
    }
    if (url.protocol === "tel:" || url.protocol === "sms:") {
      this.report.phones++;
      return `${url.protocol}+15550100`;
    }
    this.report.links++;
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return SAMPLE_LINK;
    }
    if (SAMPLE_KIND_LINKS[key]) return SAMPLE_KIND_LINKS[key];
    if (this.block.type === "video-embed" && key === "url") {
      const fallback = getBlock("video-embed")?.defaults as
        | { url?: string }
        | undefined;
      return fallback?.url ?? SAMPLE_LINK;
    }
    return SAMPLE_LINK;
  }

  private sampleFor(key: string, parentKey: string, path: string[]): string {
    if (parentKey === "options") {
      return `Option ${Number(path.at(-1) ?? 0) + 1}`;
    }
    return (
      BLOCK_SAMPLE_TEXT[this.block.type]?.[key] ??
      SAMPLE_TEXT[key] ??
      SAMPLE_FALLBACK
    );
  }

  private string(
    key: string,
    value: string,
    parentKey: string,
    path: string[],
  ): string {
    if (STRUCTURAL_KEYS.has(key) || STRUCTURAL_KEYS.has(parentKey)) {
      return value;
    }
    if (!value.trim() || HEX.test(value.trim())) return value;
    const link = this.link(key, value);
    if (link !== null) {
      this.secret(value);
      return link;
    }
    if (key === "password" || key === "ssid") {
      this.secret(value);
      this.report.wifi++;
      return key === "password" ? "your-password" : "Guest Wi-Fi";
    }
    if (key === "code" || key === "barcodeValue") {
      this.secret(value);
      this.report.codes++;
      return key === "code" ? SAMPLE_COUPON_CODE : "";
    }
    if (EMAIL_ONLY.test(value.trim())) {
      this.secret(value);
      this.report.emails++;
      return SAMPLE_EMAIL;
    }
    if (PHONE_KEYS.has(key)) {
      this.secret(value);
      this.report.phones++;
      return SAMPLE_PHONE;
    }
    if (key === "address") {
      this.secret(value);
      this.report.addresses++;
      return SAMPLE_ADDRESS_LINE;
    }
    // Free text: a sample, unless the publisher keeps it.
    const field: ScrubbedField = {
      id: `${this.block.id}:${path.join(".")}`,
      block: this.blockLabel,
      field: fieldLabel(path),
      original: value,
      sample: this.sampleFor(key, parentKey, path),
    };
    this.fields.push(field);
    if (this.keep.has(field.id)) {
      this.report.kept++;
      this.kept.push({ field });
      return value;
    }
    this.report.texts++;
    return field.sample;
  }

  /** A picture or file: always removed, leaving its slot empty. */
  private media(kind: "images" | "files"): Scrubbed {
    this.report[kind]++;
    return REMOVED;
  }

  value(
    key: string,
    value: unknown,
    parentKey: string,
    path: string[],
  ): Scrubbed {
    if (typeof value === "string") {
      return this.string(key, value, parentKey, path);
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      value.forEach((item, index) => {
        const next = this.value(key, item, key, [...path, String(index)]);
        if (next !== REMOVED) items.push(next);
      });
      return items;
    }
    if (!isRecord(value)) return value;

    // An uploaded file, or a file or picture linked from elsewhere.
    const isFile = value.type === "file" && typeof value.fileId === "string";
    const isLinkedFile = value.type === "url" && typeof value.url === "string";
    if (isFile || isLinkedFile) {
      const picture = PICTURE_KEYS.has(key) || PICTURE_KEYS.has(parentKey);
      return this.media(picture ? "images" : "files");
    }
    // A picture ({ url, alt }).
    if (typeof value.url === "string" && "alt" in value) {
      return this.media("images");
    }
    // A postal address.
    if (key === "address" && POSTAL_KEYS.some((part) => part in value)) {
      if (POSTAL_KEYS.some((part) => String(value[part] ?? "").trim())) {
        for (const part of POSTAL_KEYS) this.secret(String(value[part] ?? ""));
        this.report.addresses++;
        return { ...SAMPLE_ADDRESS };
      }
      return value;
    }

    const next: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      const scrubbed = this.value(childKey, child, key, [...path, childKey]);
      if (scrubbed === REMOVED) {
        // An item that was only its file (a gallery photo, a download, a
        // track) goes with it.
        if (childKey === "source" && path.length > 0) return REMOVED;
        continue;
      }
      next[childKey] = scrubbed;
    }
    return next;
  }

  private readonly restored = new Set<string>();

  /** Fixed choices put back after validation: they aren't replaced text. */
  forget(paths: string[]) {
    for (const path of paths) {
      const id = `${this.block.id}:${path}`;
      if (this.restored.has(id)) continue;
      this.restored.add(id);
      if (this.fields.some((field) => field.id === id)) this.report.texts--;
    }
  }

  visibleFields(): ScrubbedField[] {
    return this.fields.filter((field) => !this.restored.has(field.id));
  }

  /** Kept text that repeats a secret or carries contact details. */
  problems(secrets: ReadonlySet<string>): KeptProblem[] {
    const problems: KeptProblem[] = [];
    for (const { field } of this.kept) {
      const text = field.original;
      const lower = text.toLowerCase();
      const repeated = [...secrets].some((secret) => lower.includes(secret));
      const message = repeated
        ? "It repeats a detail taken out elsewhere on the page."
        : textProblem(text);
      if (message) {
        problems.push({
          id: field.id,
          message: `${field.block} ${field.field}: ${message}`,
        });
      }
    }
    return problems;
  }
}

const COUNTED = [
  "texts",
  "kept",
  "links",
  "emails",
  "phones",
  "addresses",
  "wifi",
  "codes",
  "images",
  "files",
  "hidden",
] as const;

function scrubTheme(
  theme: LandingPageContent["theme"],
  report: ScrubReport,
): LandingPageContent["theme"] {
  const next = { ...theme };
  if (next.background?.type === "image") {
    report.images++;
    next.background = { type: "solid" };
  }
  if (next.logo) {
    report.images++;
    delete next.logo;
  }
  return next;
}

export interface ScrubResult {
  content: LandingPageContent;
  report: ScrubReport;
  /** Every text field that was replaced (or kept), in page order */
  fields: ScrubbedField[];
  /** Kept text that can't be published */
  problems: KeptProblem[];
}

/**
 * `content` with personal data taken out. `keep` lists the text fields
 * (ScrubbedField ids) the publisher chose to publish as they wrote them.
 */
export function scrubPageContent(
  content: LandingPageContent,
  options: { keep?: readonly string[] } = {},
): ScrubResult {
  const keep = new Set(options.keep ?? []);
  const report = emptyReport();
  const blocks: LandingBlock[] = [];
  const fields: ScrubbedField[] = [];
  const scrubbers: Scrubber[] = [];
  const secrets = new Set<string>();
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
    const scrubber = new Scrubber(block, definition.label, keep);
    const props = scrubber.value("", block.props, "", []) as Record<
      string,
      unknown
    >;
    // A sample coupon code isn't an EAN: its barcode becomes Code 128.
    if (block.type === "coupon" && props.barcode === "ean13") {
      props.barcode = "code128";
    }

    for (const secret of scrubber.secrets) secrets.add(secret);
    let parsed = definition.schema.safeParse(props);
    // A fixed choice (an enum or literal, such as a video's aspect ratio)
    // can't hold personal data: put back the values the schema refused as
    // not one of its choices, and only those.
    if (!parsed.success) {
      const restored = restoreChoices(block.props, props, parsed.error.issues);
      if (restored.length > 0) {
        scrubber.forget(restored);
        parsed = definition.schema.safeParse(props);
      }
    }
    if (!parsed.success || FILE_BLOCKS[block.type]?.(parsed.data)) {
      report.blocks.push(definition.label);
      report.images += scrubber.report.images;
      report.files += scrubber.report.files;
      continue;
    }
    for (const key of COUNTED) report[key] += scrubber.report[key];
    scrubbers.push(scrubber);
    fields.push(...scrubber.visibleFields());
    blocks.push({ id: block.id, type: block.type, props: parsed.data });
  }
  return {
    content: { ...content, theme: scrubTheme(content.theme, report), blocks },
    report,
    fields,
    problems: scrubbers.flatMap((scrubber) => scrubber.problems(secrets)),
  };
}

type Path = (string | number | symbol)[];

/** Paths whose value the schema refused as not one of its choices. */
function restoreChoices(
  original: Record<string, unknown>,
  scrubbed: Record<string, unknown>,
  issues: { code: string; path: Path }[],
): string[] {
  const restored: string[] = [];
  for (const issue of issues) {
    if (issue.code !== "invalid_value" && issue.code !== "invalid_enum_value") {
      continue;
    }
    const path = issue.path.map(String);
    let from: unknown = original;
    let into: unknown = scrubbed;
    for (const part of path.slice(0, -1)) {
      from = (from as Record<string, unknown> | undefined)?.[part];
      into = (into as Record<string, unknown> | undefined)?.[part];
    }
    const last = path.at(-1);
    if (last === undefined || (!isRecord(into) && !Array.isArray(into)))
      continue;
    const value = (from as Record<string, unknown> | undefined)?.[last];
    if (typeof value !== "string") continue;
    (into as Record<string, unknown>)[last] = value;
    restored.push(path.join("."));
  }
  return restored;
}

/** Plain lines for the publish dialog: what the scrub changed. */
export function scrubSummary(report: ScrubReport): string[] {
  const lines: string[] = [];
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  if (report.texts) {
    lines.push(
      `${count(report.texts, "text", "texts")} replaced with sample text`,
    );
  }
  if (report.kept) {
    lines.push(`${count(report.kept, "text", "texts")} kept as you wrote it`);
  }
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
  if (report.wifi) {
    lines.push("Wi-Fi network name and password replaced with sample ones");
  }
  if (report.codes) {
    lines.push("Coupon code replaced with a sample one");
  }
  if (report.images) {
    lines.push(
      `${count(report.images, "photo", "photos")} removed: people add their own`,
    );
  }
  if (report.files) {
    lines.push(`${count(report.files, "file", "files")} removed`);
  }
  if (report.blocks.length) {
    lines.push(
      `Left out because they need your own files: ${[...new Set(report.blocks)].join(", ")}`,
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
