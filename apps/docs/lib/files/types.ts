// Client-safe file rules shared by the upload API, the file manager and the
// landing-page blocks. Only these types can be uploaded: no SVG, HTML,
// archives or office documents, so nothing served from storage can run script
// in a browser.

export const FILE_KINDS = ["pdf", "image", "audio", "video"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  image: "Image",
  audio: "Audio",
  video: "Video",
};

interface MimeInfo {
  kind: FileKind;
  /** First one is canonical */
  extensions: readonly [string, ...string[]];
  label: string;
}

export const ALLOWED_MIME_TYPES = {
  "application/pdf": { kind: "pdf", extensions: ["pdf"], label: "PDF" },
  "image/jpeg": { kind: "image", extensions: ["jpg", "jpeg"], label: "JPEG" },
  "image/png": { kind: "image", extensions: ["png"], label: "PNG" },
  "image/webp": { kind: "image", extensions: ["webp"], label: "WebP" },
  "image/gif": { kind: "image", extensions: ["gif"], label: "GIF" },
  "image/avif": { kind: "image", extensions: ["avif"], label: "AVIF" },
  "audio/mpeg": { kind: "audio", extensions: ["mp3"], label: "MP3" },
  "audio/mp4": { kind: "audio", extensions: ["m4a"], label: "M4A" },
  "audio/aac": { kind: "audio", extensions: ["aac"], label: "AAC" },
  "audio/ogg": { kind: "audio", extensions: ["ogg", "oga"], label: "Ogg" },
  "audio/wav": { kind: "audio", extensions: ["wav"], label: "WAV" },
  "video/mp4": { kind: "video", extensions: ["mp4", "m4v"], label: "MP4" },
  "video/webm": { kind: "video", extensions: ["webm"], label: "WebM" },
  "video/quicktime": { kind: "video", extensions: ["mov"], label: "MOV" },
} as const satisfies Record<string, MimeInfo>;

export type AllowedMime = keyof typeof ALLOWED_MIME_TYPES;

const MIME_ALIASES: Record<string, AllowedMime> = {
  "application/x-pdf": "application/pdf",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "video/x-m4v": "video/mp4",
};

const MIME_BY_EXTENSION = new Map<string, AllowedMime>(
  Object.entries(ALLOWED_MIME_TYPES).flatMap(([mime, info]) =>
    info.extensions.map((ext) => [ext, mime as AllowedMime] as const),
  ),
);

export const MAX_FILENAME_LENGTH = 200;
const MAX_STORAGE_STEM_LENGTH = 80;

export function isAllowedMime(mime: string): mime is AllowedMime {
  return Object.hasOwn(ALLOWED_MIME_TYPES, mime);
}

export function kindForMime(mime: AllowedMime): FileKind {
  return ALLOWED_MIME_TYPES[mime].kind;
}

export function mimesForKind(kind: FileKind): AllowedMime[] {
  return (Object.keys(ALLOWED_MIME_TYPES) as AllowedMime[]).filter(
    (mime) => ALLOWED_MIME_TYPES[mime].kind === kind,
  );
}

function extensionOf(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function baseName(filename: string): string {
  return filename.split(/[/\\]/).pop() ?? "";
}

/**
 * The allowed MIME type of an upload from the browser's `File.type` (often
 * empty or a vendor alias) and the file name, or null when unsupported.
 */
export function normalizeMime(
  type: string | null | undefined,
  filename: string,
): AllowedMime | null {
  const declared = (type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (isAllowedMime(declared)) return declared;
  const alias = MIME_ALIASES[declared];
  if (alias) return alias;
  if (declared && declared !== "application/octet-stream") return null;
  return MIME_BY_EXTENSION.get(extensionOf(filename)) ?? null;
}

/** `accept` attribute for a file input limited to some kinds. */
export function acceptAttribute(kinds: readonly FileKind[] = FILE_KINDS) {
  return (Object.keys(ALLOWED_MIME_TYPES) as AllowedMime[])
    .filter((mime) => kinds.includes(ALLOWED_MIME_TYPES[mime].kind))
    .flatMap((mime) => [
      mime,
      ...ALLOWED_MIME_TYPES[mime].extensions.map((ext) => `.${ext}`),
    ])
    .join(",");
}

/** Human list of supported formats, e.g. "JPEG, PNG, WebP". */
export function formatsForKinds(kinds: readonly FileKind[] = FILE_KINDS) {
  return (Object.keys(ALLOWED_MIME_TYPES) as AllowedMime[])
    .filter((mime) => kinds.includes(ALLOWED_MIME_TYPES[mime].kind))
    .map((mime) => ALLOWED_MIME_TYPES[mime].label)
    .join(", ");
}

/**
 * Name shown to people and used for downloads: the original name without
 * path, control characters or runs of whitespace, at most 200 characters
 * (the extension survives truncation).
 */
export function displayFilename(filename: string): string {
  const cleaned = baseName(filename)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, MAX_FILENAME_LENGTH - ext.length).trimEnd()}${ext}`;
}

/**
 * URL- and key-safe file name for the storage key: ASCII letters, digits,
 * `.`, `_` and `-` only, with an extension that matches `mime`.
 */
export function storageFilename(filename: string, mime: AllowedMime): string {
  const { extensions } = ALLOWED_MIME_TYPES[mime];
  const base = baseName(filename);
  const dot = base.lastIndexOf(".");
  const rawExt = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const ext = (extensions as readonly string[]).includes(rawExt)
    ? rawExt
    : extensions[0];
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, MAX_STORAGE_STEM_LENGTH)
    .replace(/[-._]+$/g, "");
  return `${stem || "file"}.${ext}`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 → "1.5 KB"; Infinity → "Unlimited". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unlimited";
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

export type FileStatus = "pending" | "ready" | "blocked";

/** A stored file as the dashboard, editor and API see it. */
export interface FileView {
  id: string;
  filename: string;
  mime: AllowedMime;
  kind: FileKind;
  size: number;
  status: FileStatus;
  /** ISO timestamp */
  createdAt: string;
  /** Stable public link (survives "Replace file") */
  url: string;
  /** Uploaded by the signed-in user (team members may only manage their own) */
  mine: boolean;
}

/** File ids are cuids; anything else never reaches the database. */
export const FILE_ID_PATTERN = /^[a-z0-9]{20,40}$/;

/** Path of a file's public link, relative to the app origin. */
export function filePath(id: string, { download = false } = {}): string {
  return `/api/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}
