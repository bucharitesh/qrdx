/**
 * Postgres's "undefined table" (42P01), however deeply the driver wraps it:
 * what every read and write of the affiliate tables hits until
 * packages/database/manual-sql/2026-11-10-affiliates.sql is applied.
 */
export function isMissingTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

let warned = false;

/**
 * Logs the missing tables once per process (a warning, not an error: it's
 * expected until the SQL is applied). Returns true when `error` was that.
 */
export function noteMissingTables(error: unknown): boolean {
  if (!isMissingTableError(error)) return false;
  if (!warned) {
    warned = true;
    console.warn(
      "Affiliate program: the affiliate tables don't exist yet (packages/database/manual-sql/2026-11-10-affiliates.sql). Referrals and commissions aren't recorded until they do.",
    );
  }
  return true;
}

/** Thrown by the page loaders so a page can say the program isn't ready. */
export class AffiliatesNotReadyError extends Error {
  constructor() {
    super("The affiliate program isn't available yet.");
    this.name = "AffiliatesNotReadyError";
  }
}
