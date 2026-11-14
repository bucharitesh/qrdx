import {
  type MyErrorResponseType,
  SubscriptionRequiredError,
  UnauthorizedError,
  ValidationError,
} from "@/types/errors";
import { HttpError } from "./http-error";
import { logError } from "./shared";

// In a module of its own, so code that only throws it (request-guards, the
// admin action runner) doesn't load ./shared, which reaches the auth server.
export { HttpError } from "./http-error";

function jsonError(
  code: MyErrorResponseType["code"],
  message: MyErrorResponseType["message"],
  data: MyErrorResponseType["data"],
  status: MyErrorResponseType["status"],
  headers?: Record<string, string>,
  docs?: string,
): Response {
  const response: MyErrorResponseType = {
    code,
    message,
    data,
    status,
    ...(docs ? { docs } : {}),
  };
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
      error.data,
      error.status,
      error.headers,
      error.docs,
    );
  }

  logError(error as Error, context);
  return jsonError(
    "INTERNAL_ERROR",
    "Something went wrong on our side. Try again in a moment.",
    undefined,
    500,
  );
}
