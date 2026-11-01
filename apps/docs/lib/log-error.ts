/** Longest error message kept in logs; SDK errors can embed whole bodies. */
const MAX_LOGGED_MESSAGE = 300;

/** The HTTP status an SDK or fetch error carries, if any. */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["statusCode", "status"]) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  const response = record.response ?? record.rawResponse;
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Logs an action failure as a small, safe summary: never the raw error
 * object, which for SDK errors (Polar, Resend, AWS) can include request
 * URLs, response headers and bodies with customer data. Code bugs (no HTTP
 * status) keep their stack.
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  const name = error?.name ?? "Error";
  const message = String(error?.message ?? error).slice(0, MAX_LOGGED_MESSAGE);
  const status = errorStatus(error);

  if (name === "UnauthorizedError" || name === "ValidationError") {
    console.warn("Expected error:", { name, message, context });
    return;
  }
  console.error("Unexpected error:", {
    name,
    message,
    ...(status === undefined ? { stack: error?.stack } : { status }),
    context,
  });
}
