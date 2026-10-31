// Pure helpers for a code's version history (lib/code-versions.ts): which
// settings a version holds, what changed between two versions, and what a
// restore writes back. Snapshots are stored as JSON, so dates arrive as ISO
// strings; live rows carry Date objects. Both normalize to the same shape.

export type VersionValueKind =
  | "text"
  | "url"
  | "date"
  | "number"
  | "flag"
  | "opaque";

interface FieldSpec {
  label: string;
  kind: VersionValueKind;
}

/** Settings a version tracks and a restore puts back (password: tracked only). */
export const VERSION_FIELDS = {
  destinationUrl: { label: "Destination", kind: "url" },
  title: { label: "Title", kind: "text" },
  style: { label: "QR design", kind: "opaque" },
  domainId: { label: "Short link domain", kind: "text" },
  startsAt: { label: "Start date", kind: "date" },
  expiresAt: { label: "Expiry date", kind: "date" },
  scanLimit: { label: "Scan limit", kind: "number" },
  fallbackUrl: { label: "Fallback URL", kind: "url" },
  hasPassword: { label: "Password", kind: "flag" },
  routing: { label: "Routing rules", kind: "opaque" },
  utm: { label: "UTM parameters", kind: "opaque" },
  pixels: { label: "Tracking pixels", kind: "opaque" },
} as const satisfies Record<string, FieldSpec>;

export type VersionField = keyof typeof VERSION_FIELDS;

export const VERSION_FIELD_KEYS = Object.keys(VERSION_FIELDS) as VersionField[];

export interface NormalizedVersion {
  destinationUrl: string | null;
  title: string | null;
  /** Key-sorted JSON (compared, never shown) */
  style: string | null;
  domainId: string | null;
  /** ISO timestamps */
  startsAt: string | null;
  expiresAt: string | null;
  scanLimit: number | null;
  fallbackUrl: string | null;
  hasPassword: boolean;
  routing: string | null;
  utm: string | null;
  pixels: string | null;
}

type VersionValue = NormalizedVersion[VersionField];

export interface VersionChange {
  field: VersionField;
  label: string;
  kind: VersionValueKind;
  /** Display values (null = not set); omitted for opaque settings */
  from?: string | null;
  to?: string | null;
}

/** Key-sorted JSON so equal objects compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

const toText = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

const isEmptyJson = (value: unknown) =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && Object.keys(value as object).length === 0);

/**
 * A snapshot or live row reduced to the tracked settings. `hasPassword` comes
 * from the snapshot flag or, for live rows, from `passwordHash`.
 */
export function normalizeVersion(
  raw: Record<string, unknown>,
): NormalizedVersion {
  const hasPassword =
    typeof raw.hasPassword === "boolean"
      ? raw.hasPassword
      : Boolean(raw.passwordHash);
  const scanLimit =
    typeof raw.scanLimit === "number" && Number.isFinite(raw.scanLimit)
      ? raw.scanLimit
      : null;
  const json = (value: unknown) =>
    isEmptyJson(value) ? null : stableStringify(value);
  return {
    destinationUrl: toText(raw.destinationUrl),
    title: toText(raw.title),
    style: json(raw.style),
    domainId: toText(raw.domainId),
    startsAt: toIso(raw.startsAt),
    expiresAt: toIso(raw.expiresAt),
    scanLimit,
    fallbackUrl: toText(raw.fallbackUrl),
    hasPassword,
    routing: json(raw.routing),
    utm: json(raw.utm),
    pixels: json(raw.pixels),
  };
}

function display(
  field: VersionField,
  value: VersionValue,
  domainName: (id: string) => string | null,
): string | null {
  if (value === null) return null;
  if (field === "hasPassword") return value ? "On" : "Off";
  if (field === "domainId")
    return domainName(String(value)) ?? "Removed domain";
  return String(value);
}

/** Settings that differ from `before` to `after`, in VERSION_FIELDS order. */
export function diffVersions(
  before: NormalizedVersion,
  after: NormalizedVersion,
  {
    domainName = () => null,
  }: { domainName?: (id: string) => string | null } = {},
): VersionChange[] {
  const changes: VersionChange[] = [];
  for (const field of VERSION_FIELD_KEYS) {
    if (before[field] === after[field]) continue;
    const { label, kind } = VERSION_FIELDS[field];
    changes.push(
      kind === "opaque"
        ? { field, label, kind }
        : {
            field,
            label,
            kind,
            from: display(field, before[field], domainName),
            to: display(field, after[field], domainName),
          },
    );
  }
  return changes;
}

/** Groups of settings a plan may not include (restores skip them then). */
export const GATED_FIELDS = {
  linkControls: ["startsAt", "expiresAt", "scanLimit", "fallbackUrl"],
  routing: ["routing", "utm"],
  pixels: ["pixels"],
} as const satisfies Record<string, VersionField[]>;

export type RestorableField = Exclude<VersionField, "hasPassword">;

export type RestorableColumns = Record<RestorableField, unknown> & {
  destinationUrl: string | null;
  domainId: string | null;
  fallbackUrl: string | null;
};

/** Raw values from a snapshot for the columns a restore may write. */
export function restorableColumns(
  snapshot: Record<string, unknown>,
): RestorableColumns {
  const normalized = normalizeVersion(snapshot);
  const date = (value: string | null) => (value ? new Date(value) : null);
  const jsonValue = (key: "style" | "routing" | "utm" | "pixels") =>
    isEmptyJson(snapshot[key]) ? null : snapshot[key];
  return {
    destinationUrl: normalized.destinationUrl,
    title: normalized.title,
    style: jsonValue("style"),
    domainId: normalized.domainId,
    startsAt: date(normalized.startsAt),
    expiresAt: date(normalized.expiresAt),
    scanLimit: normalized.scanLimit,
    fallbackUrl: normalized.fallbackUrl,
    routing: jsonValue("routing"),
    utm: jsonValue("utm"),
    pixels: jsonValue("pixels"),
  };
}
