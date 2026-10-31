import {
  type MyErrorResponseType,
  SubscriptionRequiredError,
  UnauthorizedError,
  ValidationError,
} from "@/types/errors";
import { logError } from "./shared";

/**
 * Error with an explicit HTTP status (e.g. 413, 429) that is safe to expose.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function jsonError(
  code: MyErrorResponseType["code"],
  message: MyErrorResponseType["message"],
  data: MyErrorResponseType["data"],
  status: MyErrorResponseType["status"],
  headers?: Record<string, string>,
): Response {
  const response: MyErrorResponseType = { code, message, data, status };
  return new Response(JSON.stringify(response), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function handleError(
  error: unknown,
  context: Record<string, unknown> = {},
): Response {
  if (error instanceof ValidationError) {
    return jsonError(
      "VALIDATION_ERROR",
      error.message,
      { details: error.details },
      400,
    );
  }

  if (error instanceof SubscriptionRequiredError) {
    return jsonError("SUBSCRIPTION_REQUIRED", error.message, error.data, 402);
  }

  if (error instanceof UnauthorizedError) {
    return jsonError("UNAUTHORIZED", error.message, undefined, 401);
  }

  if (error instanceof HttpError) {
    return jsonError(
      error.code,
      error.message,
      undefined,
      error.status,
      error.headers,
    );
  }

  logError(error as Error, context);
  return new Response("Internal Server Error", { status: 500 });
}
