// What a workspace audit log row may hold in `metadata`: small, flat values,
// a before and after of the fields that changed, and never a secret. Pure,
// so the recorder and the tests share it.

export type AuditValue = string | number | boolean | null | string[];

export interface AuditMetadata {
  /** The changed fields' old values */
  before?: Record<string, AuditValue>;
  /** The changed fields' new values */
  after?: Record<string, AuditValue>;
  [key: string]: AuditValue | Record<string, AuditValue> | undefined;
}

/**
 * Keys that name a secret. Their values are never stored, whatever they
 * hold: a field that says whether a password is set is `passwordSet`.
 */
const SECRET_KEY =
  /(secret|token|password$|^password|passphrase|hash|credential|private|^key$|apikey|api_key$|cookie|otp|^code$)/i;

/** Values that look like a credential QRdx issues, whatever their key. */
const SECRET_VALUE = /^(qrdx_|whsec_|qrdx-sk-|sk_|Bearer\s)/;

const MAX_STRING = 2048;
const MAX_LIST = 50;
const MAX_KEYS = 40;
/** Rows stay small: past this the metadata is dropped, not truncated mid-value. */
const MAX_BYTES = 16_384;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key) && key !== "passwordSet";
}

function cleanValue(value: unknown): AuditValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value.trim())) return undefined;
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING - 1)}…`
      : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LIST)
      .map((item) => cleanValue(item))
      .filter((item): item is string => typeof item === "string");
  }
  return undefined;
}

function cleanRecord(
  record: Record<string, unknown>,
): Record<string, AuditValue> {
  const out: Record<string, AuditValue> = {};
  for (const [key, value] of Object.entries(record).slice(0, MAX_KEYS)) {
    if (isSecretKey(key)) continue;
    const clean = cleanValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/**
 * The metadata as stored: secret keys and credential-looking values dropped,
 * long strings and lists cut, nested objects only under `before` and
 * `after`. Null when nothing is left.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AuditMetadata | null {
  if (!metadata) return null;
  const out: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata).slice(0, MAX_KEYS)) {
    if (isSecretKey(key)) continue;
    if (
      (key === "before" || key === "after") &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const record = cleanRecord(value as Record<string, unknown>);
      if (Object.keys(record).length > 0) out[key] = record;
      continue;
    }
    const clean = cleanValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  if (Object.keys(out).length === 0) return null;
  if (JSON.stringify(out).length > MAX_BYTES) return { truncated: true };
  return out;
}

/**
 * Before and after for the fields of `next` whose value differs from
 * `previous` (compared as stored: dates by time, lists by content). Empty
 * when nothing changed.
 */
export function changedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): { before: Record<string, AuditValue>; after: Record<string, AuditValue> } {
  const before: Record<string, AuditValue> = {};
  const after: Record<string, AuditValue> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const from = cleanValue(previous[key] ?? null) ?? null;
    const to = cleanValue(value) ?? null;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    before[key] = from;
    after[key] = to;
  }
  return { before, after };
}

/** True when `changedFields` found anything. */
export const hasChanges = (change: { after: Record<string, AuditValue> }) =>
  Object.keys(change.after).length > 0;

/**
 * A webhook endpoint's address as the log keeps it: the origin, and "/…"
 * for any path or query, which often hold a secret (catch-hook paths,
 * ?token=). Same form as the REST API's masked target URLs.
 */
export function maskedEndpointUrl(value: string): string {
  try {
    const url = new URL(value);
    const rest = url.pathname !== "/" || url.search || url.hash;
    return `${url.origin}${rest ? "/…" : ""}`;
  } catch {
    return "…";
  }
}

/**
 * Before and after of a webhook endpoint's address, masked. A new path on
 * the same host still shows as a change.
 */
export function endpointUrlChange(previous: string, next: string) {
  const before = maskedEndpointUrl(previous);
  let after = maskedEndpointUrl(next);
  if (before === after) after = `${after} (new path)`;
  return { before: { url: before }, after: { url: after } };
}
