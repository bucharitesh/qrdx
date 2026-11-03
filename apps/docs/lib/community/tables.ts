// Small helpers for code that touches the community tables without the rest
// of the community layer (admin actions, account export and deletion).

/** Cache tag of every community read (revalidated on any write). */
export const COMMUNITY_TAG = "community-items";

/**
 * Postgres's "undefined table" (42P01) or "undefined column" (42703),
 * however deeply the driver error is wrapped (drizzle's DrizzleQueryError
 * keeps it in `cause`): the community tables from manual-sql/0012 aren't
 * there yet.
 */
export function isMissingSchemaError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "42P01" || code === "42703") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
