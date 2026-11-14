/**
 * Error with an explicit HTTP status (e.g. 413, 429) that is safe to expose.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: Record<string, string>;
  /** A docs page that explains the fix (sent as `docs`). */
  readonly docs?: string;
  /** Sent as the response's `data`, e.g. `{ details }` per row of a batch. */
  readonly data?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>,
    docs?: string,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.docs = docs;
    this.data = data;
  }
}
