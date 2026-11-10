import {
  CODES_PAGE_SIZE,
  DEFAULT_BASE_URL,
  SCANS_PAGE_SIZE,
} from "./constants";

// Request building and pagination for the QRdx REST API, kept free of n8n
// runtime imports: the node files hand these a requester that calls n8n's
// HTTP helpers, and the tests hand them a fake one.

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequest {
  method: ApiMethod;
  /** Path under the base URL, starting with `/` */
  path: string;
  qs?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
  /** Resolve with `undefined` on 404 instead of failing (unsubscribing). */
  allowNotFound?: boolean;
}

export type ApiRequester = (request: ApiRequest) => Promise<unknown>;

export type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseUrl = (value: string): URL | undefined =>
  URL.canParse(value) ? new URL(value) : undefined;

const NOT_JSON = Symbol("not JSON");

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return NOT_JSON;
  }
}

/**
 * `https://api.qrdx.dev/v1/` → `https://api.qrdx.dev/v1`. Empty means the
 * hosted API; anything that isn't an http(s) URL is refused.
 */
export function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_BASE_URL;
  const url = parseUrl(trimmed);
  if (!url) {
    throw new Error(
      `The base URL "${trimmed}" isn't a URL. Use ${DEFAULT_BASE_URL}, or your own copy's address ending in /api/v1.`
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The base URL must start with https:// or http://.");
  }
  return trimmed.replace(/\/+$/, "");
}

/** `/codes/{id}`, with the id escaped. */
export const codePath = (codeId: string, suffix = "") =>
  `/codes/${encodeURIComponent(codeId.trim())}${suffix}`;

export const hookPath = (hookId: string) =>
  `/hooks/${encodeURIComponent(hookId)}`;

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * The message and description of a failed request. QRdx errors look like
 * `{ code, message, status, docs?, data?: { details: [{ path | param, message }] } }`.
 */
export function apiErrorDetails(
  statusCode: number,
  body: unknown
): { message: string; description: string } {
  const error = isRecord(body) ? body : {};
  const message =
    typeof error.message === "string" && error.message
      ? error.message
      : `QRdx answered with HTTP ${statusCode}`;
  const lines: string[] = [];
  const details = isRecord(error.data) ? error.data.details : undefined;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (!isRecord(detail) || typeof detail.message !== "string") continue;
      const field = detail.path ?? detail.param;
      lines.push(
        typeof field === "string" && field
          ? `${field}: ${detail.message}`
          : detail.message
      );
    }
  }
  if (typeof error.code === "string") lines.push(`Error code: ${error.code}`);
  if (typeof error.docs === "string") lines.push(`More: ${error.docs}`);
  return { message, description: lines.join("\n") };
}

// ─── Codes ───────────────────────────────────────────────────────────────────

export interface ListOptions {
  returnAll: boolean;
  /** Used when `returnAll` is false */
  limit: number;
}

export interface CodeFilters {
  status?: string;
  search?: string;
}

/** GET /codes, page by page (limit + offset), until the limit or the end. */
export async function collectCodes(
  request: ApiRequester,
  { returnAll, limit }: ListOptions,
  filters: CodeFilters = {}
): Promise<JsonRecord[]> {
  const codes: JsonRecord[] = [];
  let offset = 0;
  for (;;) {
    const pageSize = returnAll
      ? CODES_PAGE_SIZE
      : Math.min(CODES_PAGE_SIZE, limit - codes.length);
    if (pageSize <= 0) break;
    const page = await request({
      method: "GET",
      path: "/codes",
      qs: {
        limit: pageSize,
        offset,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { q: filters.search } : {}),
      },
    });
    const data =
      isRecord(page) && Array.isArray(page.data)
        ? page.data.filter(isRecord)
        : [];
    codes.push(...data);
    offset += data.length;
    const pagination = isRecord(page) ? page.pagination : undefined;
    const total = isRecord(pagination) ? pagination.total : undefined;
    if (
      data.length < pageSize ||
      (typeof total === "number" && offset >= total)
    ) {
      break;
    }
  }
  return returnAll ? codes : codes.slice(0, limit);
}

export interface CodeFields {
  title?: string;
  slug?: string;
  domainId?: string;
  style?: unknown;
  archived?: boolean;
}

/** A design as the API takes it: a JSON object (or its text). */
export function parseStyle(value: unknown): JsonRecord | undefined {
  if (value === undefined || value === null || value === "") return;
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (parsed === NOT_JSON) {
    throw new Error(
      'Style must be JSON, like {"fgColor": "#111827", "bodyPattern": "circle"}.'
    );
  }
  if (!isRecord(parsed)) {
    throw new Error(
      'Style must be a JSON object, like {"fgColor": "#111827", "bodyPattern": "circle"}.'
    );
  }
  return parsed;
}

/** POST /codes body for one code. */
export function codeCreateBody(
  destinationUrl: string,
  fields: CodeFields = {}
): JsonRecord {
  const destination = destinationUrl.trim();
  if (!destination) throw new Error("Enter the destination URL.");
  const body: JsonRecord = { destinationUrl: destination };
  if (fields.title?.trim()) body.title = fields.title.trim();
  if (fields.slug?.trim()) body.slug = fields.slug.trim();
  if (fields.domainId?.trim()) body.domainId = fields.domainId.trim();
  const style = parseStyle(fields.style);
  if (style && Object.keys(style).length > 0) body.style = style;
  return body;
}

/**
 * PATCH /codes/{id} body: only the fields that were added. An empty title
 * clears it; an empty domain moves the code back to the default short link.
 */
export function codeUpdateBody(
  fields: CodeFields & { destinationUrl?: string }
): JsonRecord {
  const body: JsonRecord = {};
  if (fields.destinationUrl !== undefined) {
    const destination = fields.destinationUrl.trim();
    if (!destination) throw new Error("The destination URL can't be empty.");
    body.destinationUrl = destination;
  }
  if (fields.title !== undefined) body.title = fields.title.trim() || null;
  if (fields.slug !== undefined) {
    const slug = fields.slug.trim();
    if (!slug) throw new Error("The back-half can't be empty.");
    body.slug = slug;
  }
  if (fields.domainId !== undefined) {
    body.domainId = fields.domainId.trim() || null;
  }
  if (fields.archived !== undefined) body.archived = fields.archived;
  if (fields.style !== undefined) {
    const style = parseStyle(fields.style);
    if (style && Object.keys(style).length > 0) body.style = style;
  }
  if (Object.keys(body).length === 0) {
    throw new Error("Add at least one field to update.");
  }
  return body;
}

// ─── Scans ───────────────────────────────────────────────────────────────────

export interface ScanFilters {
  range?: string;
  /** Only scans before this time (ISO 8601) */
  before?: string;
}

/**
 * Individual scans of a code, newest first: GET /codes/{id}/scans with
 * `limit` > 0, following `nextBefore` until the limit or the last page.
 */
export async function collectScans(
  request: ApiRequester,
  codeId: string,
  { returnAll, limit }: ListOptions,
  filters: ScanFilters = {}
): Promise<JsonRecord[]> {
  const scans: JsonRecord[] = [];
  let before = filters.before?.trim() || undefined;
  for (;;) {
    const pageSize = returnAll
      ? SCANS_PAGE_SIZE
      : Math.min(SCANS_PAGE_SIZE, limit - scans.length);
    if (pageSize <= 0) break;
    const response = await request({
      method: "GET",
      path: codePath(codeId, "/scans"),
      qs: {
        limit: pageSize,
        ...(filters.range ? { range: filters.range } : {}),
        ...(before ? { before } : {}),
      },
    });
    const data =
      isRecord(response) && isRecord(response.data) ? response.data : {};
    const events = Array.isArray(data.events)
      ? data.events.filter(isRecord)
      : [];
    const id = typeof data.codeId === "string" ? data.codeId : codeId;
    scans.push(...events.map((event) => ({ codeId: id, ...event })));
    const next = typeof data.nextBefore === "string" ? data.nextBefore : null;
    if (!next || events.length < pageSize || next === before) break;
    before = next;
  }
  return returnAll ? scans : scans.slice(0, limit);
}

/** The `data` object of a response, or the response itself. */
export function unwrapData(response: unknown): JsonRecord {
  if (isRecord(response) && isRecord(response.data)) return response.data;
  return isRecord(response) ? response : {};
}

/** The `data` array of a list response. */
export function unwrapList(response: unknown): JsonRecord[] {
  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data.filter(isRecord);
  }
  return [];
}
