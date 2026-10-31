/**
 * Shared HTTP helper for provider API clients: JSON requests with typed,
 * token-free errors (401, 403, 404, 429, network) that routes can map to
 * user-facing messages.
 */

export type IntegrationErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "upgrade_required"
  | "bad_request"
  | "server"
  | "network";

export class IntegrationApiError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly code: IntegrationErrorCode;
  readonly retryAfterSeconds?: number;
  /** Parsed error body; never contains credentials (they are only sent, never echoed). */
  readonly body?: unknown;

  constructor(options: {
    provider: string;
    status: number;
    code: IntegrationErrorCode;
    message: string;
    retryAfterSeconds?: number;
    body?: unknown;
  }) {
    super(options.message);
    this.name = "IntegrationApiError";
    this.provider = options.provider;
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.body = options.body;
  }
}

export function isIntegrationApiError(
  error: unknown
): error is IntegrationApiError {
  return error instanceof IntegrationApiError;
}

export function errorCodeForStatus(status: number): IntegrationErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 402) return "upgrade_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

const DEFAULT_MESSAGES: Record<IntegrationErrorCode, string> = {
  unauthorized: "rejected the saved credentials. Reconnect the account.",
  forbidden: "doesn't allow this for your account or plan.",
  not_found: "couldn't find that item.",
  conflict: "reported a conflict.",
  rate_limited: "is rate limiting requests. Try again in a minute.",
  upgrade_required: "needs a paid plan for this.",
  bad_request: "rejected the request.",
  server: "had a server error. Try again later.",
  network: "couldn't be reached. Check your connection and try again.",
};

const PROVIDER_WORDED_CODES = new Set<IntegrationErrorCode>([
  "bad_request",
  "forbidden",
  "conflict",
  "upgrade_required",
]);

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
}

/** Pulls a human message out of common API error shapes. */
export function readErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return typeof body === "string" && body.trim()
      ? body.trim().slice(0, 200)
      : undefined;
  }
  const record = body as Record<string, unknown>;
  const nested = record.error;
  const candidates = [
    record.message,
    record.description,
    record.error_description,
    record.error_summary,
    typeof nested === "object" && nested
      ? (nested as Record<string, unknown>).message
      : nested,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 200);
    }
  }
}

export interface ProviderRequestInit extends RequestInit {
  /** Overrides the parsed message for a given error body. */
  describeError?: (body: unknown, status: number) => string | undefined;
}

/**
 * Fetches `url` and parses JSON. Non-2xx responses and network failures throw
 * an {@link IntegrationApiError}; credentials are never part of the message.
 */
export async function providerRequest<T>(
  provider: { slug: string; name: string },
  url: string,
  init: ProviderRequestInit = {}
): Promise<T> {
  const { describeError, ...requestInit } = init;
  let response: Response;
  try {
    response = await fetch(url, requestInit);
  } catch {
    throw new IntegrationApiError({
      provider: provider.slug,
      status: 0,
      code: "network",
      message: `${provider.name} ${DEFAULT_MESSAGES.network}`,
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // keep the raw text
    }
    const code = errorCodeForStatus(response.status);
    // Auth, rate-limit and server errors read better with our own wording.
    const detail = describeError
      ? describeError(body, response.status)
      : PROVIDER_WORDED_CODES.has(code)
        ? readErrorMessage(body)
        : undefined;
    throw new IntegrationApiError({
      provider: provider.slug,
      status: response.status,
      code,
      message: detail
        ? `${provider.name}: ${detail}`
        : `${provider.name} ${DEFAULT_MESSAGES[code]}`,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
      body,
    });
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
