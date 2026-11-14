/**
 * Postgres's "undefined table" (42P01), however deeply the driver wraps it:
 * what every read and write of workspace_audit_log hits until
 * packages/database/manual-sql/2026-11-09-workspace-audit-log.sql is applied.
 */
export function isMissingTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
