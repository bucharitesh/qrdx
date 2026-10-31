// Export files from providers without an API (or without API access): column
// presets, provider auto-detection and rows → links. Pure and client-safe.
//
// Header names come from the providers' help docs where they publish them
// (Uniqode lists its export columns; QR TIGER describes its "Download QR
// List"; Flowcode's bulk template). The rest are best guesses, which is why
// the dialog always shows the column mapping before anything is imported.

import { absoluteShortLink, splitShortLink, splitTagCell } from "./normalize";
import type { FileProviderId } from "./providers";
import type { SourceLink } from "./types";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const FILE_FIELDS = [
  "destination",
  "title",
  "shortLink",
  "id",
  "tags",
  "createdAt",
  "clicks",
] as const;
export type FileField = (typeof FILE_FIELDS)[number];

export const FILE_FIELD_LABELS: Record<FileField, string> = {
  destination: "Destination URL",
  title: "Name",
  shortLink: "Old short link",
  id: "Old code ID",
  tags: "Tags",
  createdAt: "Created",
  clicks: "Scans or clicks",
};

/** Column index per field; -1 = not in the file. */
export type FileMapping = Record<FileField, number>;

interface Preset {
  /** Exact headers (case-insensitive) by field, most specific first */
  columns: Partial<Record<FileField, string[]>>;
  /** Headers only this provider's files have (for detection) */
  signature: string[];
  /** Short-link hosts in the data that point at this provider */
  hosts?: RegExp;
}

export const FILE_PRESETS: Record<Exclude<FileProviderId, "csv">, Preset> = {
  uniqode: {
    columns: {
      id: ["qr code id"],
      title: ["qr code name"],
      shortLink: ["qr code url"],
      destination: ["destination url"],
      createdAt: ["creation date & timestamp", "creation date"],
      tags: ["labels"],
    },
    signature: [
      "qr code id",
      "qr code url",
      "creation date & timestamp",
      "frame text details",
      "organization name",
    ],
    hosts: /(^|\.)(uniqode\.com|beaconstac\.com|qr\.codes)$/,
  },
  "qr-tiger": {
    columns: {
      id: ["qr id", "id", "campaign id"],
      title: ["name", "campaign name", "qr name"],
      destination: ["destination url", "url", "destination"],
      clicks: ["scan count", "scans", "total scans"],
      shortLink: ["short url", "qr url"],
    },
    signature: ["scan count", "category", "campaign name"],
    hosts: /(^|\.)(qrcode-tiger\.com|qrtiger\.com|qr1\.ink)$/,
  },
  flowcode: {
    columns: {
      title: ["flowcode name", "name"],
      destination: ["flowcode scan url", "destination", "destination url"],
      shortLink: ["flowcode url", "short url"],
    },
    signature: ["flowcode name", "flowcode scan url"],
    hosts: /(^|\.)(flowcode\.com|flow\.page)$/,
  },
  "qr-code-generator-pro": {
    columns: {
      id: ["id", "qr code id"],
      title: ["name", "qr code name", "title"],
      shortLink: ["short url", "short link", "qr code url"],
      destination: ["url", "destination url", "content", "target url"],
      createdAt: ["created", "created at", "creation date"],
      clicks: ["scans", "total scans"],
      tags: ["folder", "tags"],
    },
    signature: ["short url", "total scans"],
    hosts: /(^|\.)(qr-code-generator\.com|qr1\.be|qrco\.de)$/,
  },
  "me-qr": {
    columns: {
      title: ["name", "qr name", "title"],
      shortLink: ["qr link", "short link", "link"],
      destination: ["destination url", "url", "content"],
      createdAt: ["created", "date"],
      clicks: ["scans"],
    },
    signature: ["qr link"],
    hosts: /(^|\.)me-qr\.com$/,
  },
  tinyurl: {
    columns: {
      id: ["alias"],
      shortLink: ["tinyurl", "tiny url", "short url", "tiny_url"],
      destination: ["long url", "url", "long_url", "destination"],
      title: ["title", "name"],
      createdAt: ["created", "date created", "created at", "created_at"],
      clicks: ["clicks", "hits", "total clicks"],
      tags: ["tags"],
    },
    signature: ["alias", "tinyurl", "tiny url", "long url"],
    hosts: /(^|\.)(tinyurl\.com|tiny\.one)$/,
  },
  hovercode: {
    columns: {
      id: ["id", "qr code id"],
      title: ["name", "qr code name", "display name"],
      shortLink: ["short link", "shortlink", "hovercode link", "tracking link"],
      destination: ["destination", "link", "url", "destination url"],
      createdAt: ["created", "created at"],
      clicks: ["scans", "total scans"],
      tags: ["tags"],
    },
    signature: ["hovercode link", "display name"],
    hosts: /(^|\.)(hovercode\.com|hov\.to)$/,
  },
  scanova: {
    columns: {
      id: ["qr id", "qr code id"],
      title: ["name", "qr name", "qr code name"],
      shortLink: ["short url", "short link"],
      destination: ["destination url", "url", "content", "website url"],
      tags: ["tags"],
      createdAt: ["created on", "created", "creation date"],
      clicks: ["scans", "total scans"],
    },
    signature: ["qr id", "creator", "short url"],
    hosts: /(^|\.)(scanova\.io|qrcodes\.pro)$/,
  },
};

// Any provider: common header spellings.
const GENERIC: Record<FileField, RegExp> = {
  destination:
    /^(destination|destination[ _-]?url|target[ _-]?url|long[ _-]?url|original[ _-]?url|redirect([ _-]?url)?|url|link|website)$/i,
  title: /^(title|name|label|campaign|qr[ _-]?(code[ _-]?)?name)$/i,
  shortLink:
    /^(short[ _-]?(url|link)|tiny[ _-]?url|qr[ _-]?(code[ _-]?)?(url|link)|tracking[ _-]?(url|link)|bitlink)$/i,
  id: /^(id|code[ _-]?id|qr[ _-]?(code[ _-]?)?id|alias|slug|back[ _-]?half|key)$/i,
  tags: /^(tags?|labels?|folder|group)$/i,
  createdAt:
    /^(created|created[ _-]?(at|on|date)|date[ _-]?created|creation[ _-]?date|date)$/i,
  clicks: /^(clicks?|scans?|hits|visits|total[ _-]?(scans|clicks))$/i,
};

const norm = (header: string) =>
  header.replace(/^﻿/, "").trim().replace(/\s+/g, " ").toLowerCase();

export function guessFileMapping(
  headers: string[],
  provider: FileProviderId,
): FileMapping {
  const names = headers.map(norm);
  const used = new Set<number>();
  const mapping = {} as FileMapping;
  const preset = provider === "csv" ? null : FILE_PRESETS[provider];
  for (const field of FILE_FIELDS) {
    let index = -1;
    for (const exact of preset?.columns[field] ?? []) {
      index = names.findIndex((name, i) => !used.has(i) && name === exact);
      if (index >= 0) break;
    }
    if (index < 0) {
      index = names.findIndex(
        (name, i) => !used.has(i) && GENERIC[field].test(name),
      );
    }
    mapping[field] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

export interface Detection {
  provider: FileProviderId;
  confidence: "high" | "medium" | "low";
}

/** Which provider's export this looks like (headers first, then link hosts). */
export function detectFileProvider(
  headers: string[],
  rows: string[][],
): Detection {
  const names = new Set(headers.map(norm));
  let best: { provider: FileProviderId; score: number } = {
    provider: "csv",
    score: 0,
  };
  for (const [provider, preset] of Object.entries(FILE_PRESETS) as [
    Exclude<FileProviderId, "csv">,
    Preset,
  ][]) {
    const score = preset.signature.filter((name) => names.has(name)).length;
    if (score > best.score) best = { provider, score };
  }
  if (best.score >= 2) return { provider: best.provider, confidence: "high" };

  // Hosts of URL-looking cells in the first rows.
  const counts = new Map<FileProviderId, number>();
  for (const row of rows.slice(0, 50)) {
    for (const cell of row) {
      if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/\S+$/i.test(cell.trim())) {
        continue;
      }
      const host = splitShortLink(cell.trim()).domain ?? "";
      for (const [provider, preset] of Object.entries(FILE_PRESETS) as [
        Exclude<FileProviderId, "csv">,
        Preset,
      ][]) {
        if (preset.hosts?.test(host)) {
          counts.set(provider, (counts.get(provider) ?? 0) + 1);
        }
      }
    }
  }
  const [host] = [...counts].sort((a, b) => b[1] - a[1]);
  if (host) return { provider: host[0], confidence: "medium" };
  // One shared header ("Short URL") is too weak to name a provider.
  return { provider: "csv", confidence: "low" };
}

/** Stable key for a row without an id or old link (re-uploads match). */
function rowKey(parts: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\u0000")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `row-${hash.toString(36)}`;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseCount(value: string): number | null {
  const digits = value.replace(/[\s,]/g, "");
  if (!/^\d{1,12}$/.test(digits)) return null;
  return Number(digits);
}

/** File rows → links (blank rows dropped; destinations checked later). */
export function linksFromRows(
  rows: string[][],
  mapping: FileMapping,
): SourceLink[] {
  const cell = (row: string[], field: FileField) =>
    mapping[field] >= 0 ? (row[mapping[field]] ?? "").trim() : "";
  return rows.flatMap((row) => {
    if (!row.some((value) => value.trim())) return [];
    const destination = cell(row, "destination");
    const title = cell(row, "title");
    const shortLink = absoluteShortLink(cell(row, "shortLink"));
    const oldId = cell(row, "id");
    const { domain, backHalf } = splitShortLink(shortLink);
    return [
      {
        id: (oldId || shortLink || rowKey([destination, title])).slice(0, 300),
        shortLink,
        domain,
        backHalf,
        destinationUrl: destination,
        title: title || null,
        tags: splitTagCell(cell(row, "tags")),
        clicks: parseCount(cell(row, "clicks")),
        createdAt: parseDate(cell(row, "createdAt")),
        archived: false,
      },
    ];
  });
}
