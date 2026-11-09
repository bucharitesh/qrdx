// The audit log's numbers, in one light module (no "server-only"): the
// server code, the pricing table and the docs (lib/product-facts.ts tokens)
// all read them from here.

/** Rows are deleted this many days after they're recorded. */
export const AUDIT_RETENTION_DAYS = 365;

/** The most rows one CSV export holds. */
export const AUDIT_EXPORT_MAX_ROWS = 50_000;

/** Rows per page in Settings → Audit log. */
export const AUDIT_PAGE_SIZE = 50;
